package com.chubb.claimops.claim.domain;

import com.chubb.claimops.common.error.BusinessRuleViolationException;
import com.chubb.claimops.common.error.ForbiddenOperationException;
import com.chubb.claimops.common.error.InvalidStateTransitionException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * The claim aggregate root. Every status change goes through a method on this class, which checks the
 * {@link ClaimStatus} transition table and the actor's right to act before mutating anything.
 *
 * <p><b>Concurrency:</b> {@link #version} turns on JPA optimistic locking. If two officers pick up the same claim
 * at once, both read version N. The first commit moves it to N+1, and the second update matches zero rows, so
 * Hibernate rejects it. The API maps that to 409 Conflict. Optimistic locking was chosen over
 * {@code SELECT ... FOR UPDATE}: collisions are rare (one claim, a few officers), and it holds no database locks
 * while a request is in flight.
 *
 * <p><b>Encapsulation:</b> Lombok generates the getters, but there are deliberately no setters. A public
 * {@code setStatus} would let any caller skip the transition table and the assignee check; every change must go
 * through a named domain method instead.
 *
 * <p><b>Identity:</b> the id is assigned in the constructor rather than by the database, so a claim has its
 * identity (and its Kafka key) before it is persisted.
 */
@Entity
@Table(name = "claims")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Claim {

    @Id
    private UUID id;

    @Column(name = "claim_number", nullable = false, unique = true, length = 32)
    private String claimNumber;

    @Column(name = "claimant_name", nullable = false, length = 100)
    private String claimantName;

    @Column(name = "policy_number", nullable = false, length = 32)
    private String policyNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "claim_type", nullable = false, length = 16)
    private ClaimType claimType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 2)
    private Market market;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private Currency currency;

    @Column(name = "incident_date", nullable = false)
    private LocalDate incidentDate;

    @Column(name = "incident_description", nullable = false, length = 2000)
    private String incidentDescription;

    @Column(name = "claimed_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal claimedAmount;

    @Column(name = "settled_amount", precision = 15, scale = 2)
    private BigDecimal settledAmount;

    @Column(name = "decision_note", length = 1000)
    private String decisionNote;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ClaimStatus status;

    @Column(name = "assigned_handler", length = 100)
    private String assignedHandler;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Version
    @Column(nullable = false)
    private Long version;

    @Getter(AccessLevel.NONE)
    @OneToMany(mappedBy = "claim", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("requestedAt ASC")
    private List<InfoRequest> infoRequests = new ArrayList<>();

    private Claim(String claimNumber, String claimantName, String policyNumber, ClaimType claimType, Market market,
                  Currency currency, LocalDate incidentDate, String incidentDescription, BigDecimal claimedAmount,
                  Instant now) {
        this.id = UUID.randomUUID();
        this.claimNumber = claimNumber;
        this.claimantName = claimantName;
        this.policyNumber = policyNumber;
        this.claimType = claimType;
        this.market = market;
        this.currency = currency;
        this.incidentDate = incidentDate;
        this.incidentDescription = incidentDescription;
        this.claimedAmount = claimedAmount;
        this.status = ClaimStatus.SUBMITTED;
        this.submittedAt = now;
        this.updatedAt = now;
    }

    /**
     * Creates a new claim in {@link ClaimStatus#SUBMITTED}.
     *
     * @param currency the claim currency, which must be the market's local currency or USD
     */
    public static Claim submit(String claimNumber, String claimantName, String policyNumber, ClaimType claimType,
                               Market market, Currency currency, LocalDate incidentDate, String incidentDescription,
                               BigDecimal claimedAmount, Instant now) {
        if (!market.accepts(currency)) {
            throw new BusinessRuleViolationException("Claims in " + market + " must be in "
                    + market.getLocalCurrency() + " or " + Currency.USD + ", not " + currency);
        }
        if (incidentDate.isAfter(LocalDate.ofInstant(now, ZoneOffset.UTC).plusDays(1))) {
            // One day of slack covers markets ahead of UTC (e.g. JP, AU), where "today" is already tomorrow in UTC.
            throw new BusinessRuleViolationException("Incident date cannot be in the future");
        }
        return new Claim(claimNumber, claimantName, policyNumber, claimType, market, currency, incidentDate,
                incidentDescription, claimedAmount, now);
    }

    /** A staff member takes ownership of a submitted claim and starts the review. */
    public void pickUp(String handler, Instant now) {
        transitionTo(ClaimStatus.IN_REVIEW, now);
        this.assignedHandler = handler;
    }

    /** The assigned handler asks the claimant for more information. The claim waits until it is answered. */
    public void requestInfo(String handler, String question, Instant now) {
        requireAssignedTo(handler);
        transitionTo(ClaimStatus.INFO_REQUESTED, now);
        infoRequests.add(new InfoRequest(this, question, handler, now));
    }

    /** The claimant answers the open information request, which returns the claim to review. */
    public void provideInfo(String claimant, String answer, Instant now) {
        requireOwnedBy(claimant);
        InfoRequest open = openInfoRequest().orElseThrow(() ->
                new InvalidStateTransitionException("Claim " + claimNumber + " has no open information request"));
        transitionTo(ClaimStatus.IN_REVIEW, now);
        open.answer(answer, now);
    }

    /**
     * The assigned handler settles the claim.
     *
     * <p>The settled amount must be positive and must not exceed the claimed amount. Paying more than was asked
     * for would need a separate adjustment with its own approval, which is out of scope here.
     */
    public void settle(String handler, BigDecimal amount, String note, Instant now) {
        requireAssignedTo(handler);
        if (amount.signum() <= 0) {
            throw new BusinessRuleViolationException("Settled amount must be greater than zero");
        }
        if (amount.compareTo(claimedAmount) > 0) {
            throw new BusinessRuleViolationException(
                    "Settled amount " + amount + " exceeds claimed amount " + claimedAmount);
        }
        transitionTo(ClaimStatus.SETTLED, now);
        this.settledAmount = amount;
        this.decisionNote = note;
        this.decidedAt = now;
    }

    /** The assigned handler rejects the claim. A reason is required, because the claimant sees it. */
    public void reject(String handler, String reason, Instant now) {
        requireAssignedTo(handler);
        transitionTo(ClaimStatus.REJECTED, now);
        this.decisionNote = reason;
        this.decidedAt = now;
    }

    public boolean isOwnedBy(String claimant) {
        return claimantName.equals(claimant);
    }

    public Optional<InfoRequest> openInfoRequest() {
        return infoRequests.stream().filter(InfoRequest::isOpen).findFirst();
    }

    private void transitionTo(ClaimStatus next, Instant now) {
        if (!status.canTransitionTo(next)) {
            throw new InvalidStateTransitionException(
                    "Claim " + claimNumber + " cannot move from " + status + " to " + next);
        }
        this.status = next;
        this.updatedAt = now;
    }

    private void requireAssignedTo(String handler) {
        if (assignedHandler == null || !assignedHandler.equals(handler)) {
            throw new ForbiddenOperationException("Claim " + claimNumber + " is not assigned to " + handler);
        }
    }

    private void requireOwnedBy(String claimant) {
        if (!isOwnedBy(claimant)) {
            throw new ForbiddenOperationException("Claim " + claimNumber + " does not belong to " + claimant);
        }
    }

    /** Read-only view, so information requests can only be added through {@link #requestInfo}. */
    public List<InfoRequest> getInfoRequests() {
        return Collections.unmodifiableList(infoRequests);
    }
}

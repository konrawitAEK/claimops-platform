package com.chubb.claimops.claim.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chubb.claimops.common.error.BusinessRuleViolationException;
import com.chubb.claimops.common.error.ForbiddenOperationException;
import com.chubb.claimops.common.error.InvalidStateTransitionException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class ClaimTest {

    private static final Instant NOW = Instant.parse("2026-11-12T03:00:00Z");

    private static Claim newClaim() {
        return Claim.submit("CLM-SG-2026-000001", "alice", "POL-123", ClaimType.MOTOR, Market.SG,
                Currency.SGD, LocalDate.parse("2026-11-10"), "Rear-ended at a junction", new BigDecimal("5000.00"), NOW);
    }

    @Test
    void submitStartsInSubmittedWithTheMarketCurrency() {
        Claim claim = newClaim();

        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.SUBMITTED);
        assertThat(claim.getCurrency()).isEqualTo(Currency.SGD);
        assertThat(claim.getAssignedHandler()).isNull();
    }

    @Test
    void submitRejectsAnIncidentDateInTheFuture() {
        assertThatThrownBy(() -> Claim.submit("CLM-SG-2026-000002", "alice", "POL-123", ClaimType.MOTOR, Market.SG,
                Currency.SGD, LocalDate.parse("2026-11-20"), "Future", new BigDecimal("1.00"), NOW))
                .isInstanceOf(BusinessRuleViolationException.class);
    }

    @Test
    void submitAcceptsUsdInAnyMarket() {
        Claim claim = Claim.submit("CLM-JP-2026-000003", "alice", "POL-123", ClaimType.PROPERTY, Market.JP,
                Currency.USD, LocalDate.parse("2026-11-10"), "Water damage", new BigDecimal("800.00"), NOW);

        assertThat(claim.getCurrency()).isEqualTo(Currency.USD);
    }

    @Test
    void submitRejectsAnotherMarketsCurrency() {
        assertThatThrownBy(() -> Claim.submit("CLM-SG-2026-000004", "alice", "POL-123", ClaimType.MOTOR, Market.SG,
                Currency.THB, LocalDate.parse("2026-11-10"), "Wrong currency", new BigDecimal("1.00"), NOW))
                .isInstanceOf(BusinessRuleViolationException.class);
    }

    @Test
    void fullHappyPathWithAnInformationRequest() {
        Claim claim = newClaim();

        claim.pickUp("bob", NOW);
        claim.requestInfo("bob", "Please upload the police report", NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.INFO_REQUESTED);
        assertThat(claim.openInfoRequest()).isPresent();

        claim.provideInfo("alice", "Report number 12345", NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.IN_REVIEW);
        assertThat(claim.openInfoRequest()).isEmpty();

        claim.settle("bob", new BigDecimal("4200.00"), "Repair quote accepted", NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.SETTLED);
        assertThat(claim.getSettledAmount()).isEqualByComparingTo("4200.00");
        assertThat(claim.getDecidedAt()).isEqualTo(NOW);
    }

    @Test
    void aClaimCannotBePickedUpTwice() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);

        assertThatThrownBy(() -> claim.pickUp("carol", NOW)).isInstanceOf(InvalidStateTransitionException.class);
        assertThat(claim.getAssignedHandler()).isEqualTo("bob");
    }

    @Test
    void onlyTheAssignedHandlerCanDecide() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);

        assertThatThrownBy(() -> claim.reject("carol", "Not covered", NOW))
                .isInstanceOf(ForbiddenOperationException.class);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.IN_REVIEW);
    }

    @Test
    void cannotDecideWithoutReview() {
        Claim claim = newClaim();

        assertThatThrownBy(() -> claim.settle("bob", new BigDecimal("1.00"), null, NOW))
                .isInstanceOf(InvalidStateTransitionException.class)
                .hasMessageContaining("SUBMITTED to SETTLED");
    }

    @Test
    void cannotSettleWhileWaitingForInformation() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);
        claim.requestInfo("bob", "Photos?", NOW);

        assertThatThrownBy(() -> claim.settle("bob", new BigDecimal("100.00"), null, NOW))
                .isInstanceOf(InvalidStateTransitionException.class);
    }

    @Test
    void settledAmountCannotExceedTheClaimedAmount() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);

        assertThatThrownBy(() -> claim.settle("bob", new BigDecimal("5000.01"), null, NOW))
                .isInstanceOf(BusinessRuleViolationException.class);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.IN_REVIEW);
    }

    @Test
    void onlyTheOwnerCanAnswerAnInformationRequest() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);
        claim.requestInfo("bob", "Photos?", NOW);

        assertThatThrownBy(() -> claim.provideInfo("mallory", "Here", NOW))
                .isInstanceOf(ForbiddenOperationException.class);
    }

    @Test
    void decidedClaimsAreFinal() {
        Claim claim = newClaim();
        claim.pickUp("bob", NOW);
        claim.reject("bob", "Policy lapsed", NOW);

        assertThatThrownBy(() -> claim.requestInfo("bob", "More?", NOW))
                .isInstanceOf(InvalidStateTransitionException.class);
        assertThat(claim.getDecisionNote()).isEqualTo("Policy lapsed");
    }
}

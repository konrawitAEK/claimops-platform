package com.chubb.claimops.claim.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chubb.claimops.common.error.InvalidStateTransitionException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.function.BiConsumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Exhaustive state-machine test: every operation is tried from every status. Each operation has exactly one
 * legal starting status. From there it must succeed. From any other status it must throw
 * {@link InvalidStateTransitionException} and leave the claim unchanged.
 */
class ClaimStateMachineTest {

    private static final Instant NOW = Instant.parse("2026-11-12T05:00:00Z");
    private static final String CLAIMANT = "alice";
    private static final String HANDLER = "bob";

    /** Each operation is performed by the right actor, so only the status rule is under test. */
    enum Operation {
        PICK_UP(ClaimStatus.SUBMITTED, ClaimStatus.IN_REVIEW, (c, t) -> c.pickUp(HANDLER, t)),
        REQUEST_INFO(ClaimStatus.IN_REVIEW, ClaimStatus.INFO_REQUESTED,
                (c, t) -> c.requestInfo(HANDLER, "Photos of the damage?", t)),
        PROVIDE_INFO(ClaimStatus.INFO_REQUESTED, ClaimStatus.IN_REVIEW, (c, t) -> c.provideInfo(CLAIMANT, "Attached", t)),
        SETTLE(ClaimStatus.IN_REVIEW, ClaimStatus.SETTLED,
                (c, t) -> c.settle(HANDLER, new BigDecimal("1000.00"), "Approved", t)),
        REJECT(ClaimStatus.IN_REVIEW, ClaimStatus.REJECTED, (c, t) -> c.reject(HANDLER, "Not covered", t));

        final ClaimStatus source;
        final ClaimStatus target;
        final BiConsumer<Claim, Instant> action;

        Operation(ClaimStatus source, ClaimStatus target, BiConsumer<Claim, Instant> action) {
            this.source = source;
            this.target = target;
            this.action = action;
        }
    }

    static Stream<Arguments> everyStatusAndOperation() {
        return Stream.of(ClaimStatus.values())
                .flatMap(status -> Stream.of(Operation.values()).map(op -> Arguments.of(status, op)));
    }

    @Test
    void everyOperationFollowsAnEdgeOfTheTransitionTable() {
        for (Operation operation : Operation.values()) {
            assertThat(operation.source.canTransitionTo(operation.target)).as(operation.name()).isTrue();
        }
    }

    @ParameterizedTest(name = "{1} from {0}")
    @MethodSource("everyStatusAndOperation")
    void operationSucceedsOnlyFromItsSourceStatus(ClaimStatus from, Operation operation) {
        Claim claim = claimIn(from);
        long infoRequests = claim.getInfoRequests().size();
        String handlerBefore = claim.getAssignedHandler();

        if (from == operation.source) {
            operation.action.accept(claim, NOW);
            assertThat(claim.getStatus()).isEqualTo(operation.target);
        } else {
            assertThatThrownBy(() -> operation.action.accept(claim, NOW))
                    .isInstanceOf(InvalidStateTransitionException.class)
                    .hasMessageContaining(from.name());
            assertThat(claim.getStatus()).isEqualTo(from);
            assertThat(claim.getAssignedHandler()).isEqualTo(handlerBefore);
            assertThat(claim.getInfoRequests()).hasSize((int) infoRequests);
            assertThat(claim.getSettledAmount()).isEqualTo(from == ClaimStatus.SETTLED ? new BigDecimal("1000.00") : null);
        }
    }

    @Test
    @DisplayName("SUBMITTED → IN_REVIEW → INFO_REQUESTED → IN_REVIEW → SETTLED")
    void fullValidPath() {
        Claim claim = claimIn(ClaimStatus.SUBMITTED);

        claim.pickUp(HANDLER, NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.IN_REVIEW);
        claim.requestInfo(HANDLER, "Police report?", NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.INFO_REQUESTED);
        claim.provideInfo(CLAIMANT, "Report 123", NOW);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.IN_REVIEW);
        claim.settle(HANDLER, new BigDecimal("4200.00"), "Repair quote accepted", NOW);

        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.SETTLED);
        assertThat(claim.getAssignedHandler()).isEqualTo(HANDLER);
        assertThat(claim.getInfoRequests()).singleElement()
                .satisfies(request -> assertThat(request.getAnswer()).isEqualTo("Report 123"));
    }

    @Test
    void anotherOfficerCannotTakeOverAClaimThatIsWaitingForTheClaimant() {
        Claim claim = claimIn(ClaimStatus.INFO_REQUESTED);

        assertThatThrownBy(() -> claim.pickUp("carol", NOW)).isInstanceOf(InvalidStateTransitionException.class);
        assertThat(claim.getAssignedHandler()).isEqualTo(HANDLER);
        assertThat(claim.getStatus()).isEqualTo(ClaimStatus.INFO_REQUESTED);
    }

    @Test
    void settlingASubmittedClaimDirectlyIsRejectedAsAnInvalidTransition() {
        Claim claim = claimIn(ClaimStatus.SUBMITTED);

        assertThatThrownBy(() -> claim.settle(HANDLER, new BigDecimal("100.00"), null, NOW))
                .isInstanceOf(InvalidStateTransitionException.class)
                .hasMessageContaining("SUBMITTED to SETTLED");
    }

    @Test
    void aRejectedClaimCannotBeModifiedByAnyOperation() {
        for (Operation operation : Operation.values()) {
            Claim claim = claimIn(ClaimStatus.REJECTED);

            assertThatThrownBy(() -> operation.action.accept(claim, NOW))
                    .as(operation.name())
                    .isInstanceOf(InvalidStateTransitionException.class);
            assertThat(claim.getStatus()).isEqualTo(ClaimStatus.REJECTED);
            assertThat(claim.getDecisionNote()).isEqualTo("Not covered");
        }
    }

    /** Builds a claim in {@code status} by walking the real lifecycle, so no test reaches into private state. */
    private static Claim claimIn(ClaimStatus status) {
        Claim claim = Claim.submit("CLM-SG-2026-000001", CLAIMANT, "POL-123", ClaimType.MOTOR, Market.SG,
                Currency.SGD, LocalDate.parse("2026-11-10"), "Rear-ended", new BigDecimal("5000.00"), NOW);
        switch (status) {
            case SUBMITTED -> { }
            case IN_REVIEW -> claim.pickUp(HANDLER, NOW);
            case INFO_REQUESTED -> {
                claim.pickUp(HANDLER, NOW);
                claim.requestInfo(HANDLER, "Photos?", NOW);
            }
            case SETTLED -> {
                claim.pickUp(HANDLER, NOW);
                claim.settle(HANDLER, new BigDecimal("1000.00"), "Approved", NOW);
            }
            case REJECTED -> {
                claim.pickUp(HANDLER, NOW);
                claim.reject(HANDLER, "Not covered", NOW);
            }
        }
        assertThat(claim.getStatus()).isEqualTo(status);
        return claim;
    }
}

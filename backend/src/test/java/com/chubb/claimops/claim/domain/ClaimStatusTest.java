package com.chubb.claimops.claim.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import org.junit.jupiter.api.Test;

class ClaimStatusTest {

    @Test
    void transitionTableMatchesTheAgreedLifecycle() {
        assertThat(ClaimStatus.SUBMITTED.allowedNext()).containsExactly(ClaimStatus.IN_REVIEW);
        assertThat(ClaimStatus.IN_REVIEW.allowedNext())
                .containsExactlyInAnyOrder(ClaimStatus.INFO_REQUESTED, ClaimStatus.SETTLED, ClaimStatus.REJECTED);
        assertThat(ClaimStatus.INFO_REQUESTED.allowedNext()).containsExactly(ClaimStatus.IN_REVIEW);
        assertThat(ClaimStatus.SETTLED.allowedNext()).isEmpty();
        assertThat(ClaimStatus.REJECTED.allowedNext()).isEmpty();
    }

    @Test
    void openStatusesAreExactlyTheNonTerminalOnes() {
        EnumSet<ClaimStatus> nonTerminal = EnumSet.noneOf(ClaimStatus.class);
        for (ClaimStatus status : ClaimStatus.values()) {
            if (!status.isTerminal()) {
                nonTerminal.add(status);
            }
        }
        assertThat(ClaimStatus.OPEN).isEqualTo(nonTerminal);
    }
}

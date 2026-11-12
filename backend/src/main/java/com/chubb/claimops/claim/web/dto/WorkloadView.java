package com.chubb.claimops.claim.web.dto;

import com.chubb.claimops.claim.domain.ClaimStatus;
import java.util.List;
import java.util.Map;

/**
 * Team workload: claim counts per status (every status present, zero included) and open claims per handler.
 *
 * <p>The counts are read straight from the write model rather than from a projection. They are simple aggregates
 * over an indexed column, and staff expect them to be exact right after they act.
 */
public record WorkloadView(Map<ClaimStatus, Long> byStatus, List<HandlerLoad> openByHandler) {

    public record HandlerLoad(String handler, long openClaims) {
    }
}

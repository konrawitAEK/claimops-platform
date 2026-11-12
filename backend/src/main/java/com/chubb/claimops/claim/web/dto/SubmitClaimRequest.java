package com.chubb.claimops.claim.web.dto;

import com.chubb.claimops.claim.domain.ClaimType;
import com.chubb.claimops.claim.domain.Currency;
import com.chubb.claimops.claim.domain.Market;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Body of {@code POST /api/claimant/claims}. The claimant is taken from the caller, never from the body.
 *
 * <p>{@code currency} is optional and defaults to the market's local currency. USD is also accepted in every market.
 */
public record SubmitClaimRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9-]{4,32}", message = "must be 4-32 letters, digits or dashes")
        String policyNumber,
        @NotNull ClaimType claimType,
        @NotNull Market market,
        Currency currency,
        @NotNull LocalDate incidentDate,
        @NotBlank @Size(max = 2000) String incidentDescription,
        @NotNull @Positive @Digits(integer = 13, fraction = 2) BigDecimal claimedAmount) {
}

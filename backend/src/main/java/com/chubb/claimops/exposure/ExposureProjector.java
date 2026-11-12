package com.chubb.claimops.exposure;

import com.chubb.claimops.claim.event.ClaimEvent;
import java.math.BigDecimal;
import java.sql.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Applies claim events to the read models: {@code liability_exposures} and {@code claim_audit_log}.
 *
 * <p><b>Idempotency:</b> Kafka delivers at least once, so the same event can arrive twice, for example when the
 * consumer crashes after writing but before committing its offset. The first statement of every apply inserts
 * the event id into {@code processed_events}, using {@code ON CONFLICT DO NOTHING}. If no row was inserted, the event
 * has already been applied and is skipped. The ledger insert and the read-model updates share one transaction, so
 * they are written together or not at all. No window exists in which an event is recorded as processed but its
 * effect is missing.
 *
 * <p><b>Exposure semantics:</b> outstanding exposure is the claimed amount of every open claim, per market, claim
 * type and currency. A claim adds to it when submitted and leaves it when decided. Settled amounts are accumulated
 * separately to show paid-out value. The claimed amount stands in for a handler-set reserve, which would be
 * more accurate and is the next refinement.
 *
 * <p>Writes go through {@link JdbcClient} with SQL upserts rather than JPA entities. Each update is a single atomic
 * {@code INSERT ... ON CONFLICT DO UPDATE}, so concurrent consumers on different partitions can update the same
 * market row without lost updates and without optimistic-lock retries.
 */
@Component
public class ExposureProjector {

    private static final Logger log = LoggerFactory.getLogger(ExposureProjector.class);

    private final JdbcClient jdbc;

    public ExposureProjector(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Applies one event once.
     *
     * @return {@code true} if the event was applied, {@code false} if it was a duplicate and was skipped
     */
    @Transactional
    public boolean apply(ClaimEvent event) {
        int recorded = jdbc.sql("""
                        INSERT INTO processed_events (event_id, processed_at) VALUES (:eventId, now())
                        ON CONFLICT (event_id) DO NOTHING
                        """)
                .param("eventId", event.eventId())
                .update();
        if (recorded == 0) {
            log.info("Skipping duplicate event {} ({}) for claim {}", event.eventId(), event.type(), event.claimNumber());
            return false;
        }

        appendAudit(event);
        switch (event.type()) {
            case CLAIM_SUBMITTED -> adjustExposure(event, 1, event.claimedAmount(), BigDecimal.ZERO);
            case CLAIM_DECIDED -> adjustExposure(event, -1, event.claimedAmount().negate(),
                    event.settledAmount() == null ? BigDecimal.ZERO : event.settledAmount());
            case CLAIM_STATUS_CHANGED -> {
                // Moves between open statuses don't change exposure; the audit entry above records them.
            }
        }
        return true;
    }

    private void appendAudit(ClaimEvent event) {
        jdbc.sql("""
                        INSERT INTO claim_audit_log
                            (event_id, claim_id, claim_number, event_type, previous_status, new_status, actor, occurred_at)
                        VALUES (:eventId, :claimId, :claimNumber, :type, :previousStatus, :newStatus, :actor, :occurredAt)
                        """)
                .param("eventId", event.eventId())
                .param("claimId", event.claimId())
                .param("claimNumber", event.claimNumber())
                .param("type", event.type().name())
                .param("previousStatus", event.previousStatus() == null ? null : event.previousStatus().name())
                .param("newStatus", event.newStatus().name())
                .param("actor", event.actor())
                .param("occurredAt", Timestamp.from(event.occurredAt()))
                .update();
    }

    private void adjustExposure(ClaimEvent event, int openDelta, BigDecimal outstandingDelta, BigDecimal settledDelta) {
        jdbc.sql("""
                        INSERT INTO liability_exposures
                            (market, claim_type, currency, open_claims, outstanding_amount, settled_amount, updated_at)
                        VALUES (:market, :claimType, :currency, :openDelta, :outstandingDelta, :settledDelta, now())
                        ON CONFLICT (market, claim_type, currency) DO UPDATE SET
                            open_claims        = liability_exposures.open_claims + EXCLUDED.open_claims,
                            outstanding_amount = liability_exposures.outstanding_amount + EXCLUDED.outstanding_amount,
                            settled_amount     = liability_exposures.settled_amount + EXCLUDED.settled_amount,
                            updated_at         = EXCLUDED.updated_at
                        """)
                .param("market", event.market().name())
                .param("claimType", event.claimType().name())
                .param("currency", event.currency().name())
                .param("openDelta", openDelta)
                .param("outstandingDelta", outstandingDelta)
                .param("settledDelta", settledDelta)
                .update();
    }
}

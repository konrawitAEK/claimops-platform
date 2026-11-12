package com.chubb.claimops.claim;

import com.chubb.claimops.claim.domain.Claim;
import com.chubb.claimops.claim.domain.ClaimStatus;
import com.chubb.claimops.claim.domain.ClaimType;
import com.chubb.claimops.claim.domain.Market;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClaimRepository extends JpaRepository<Claim, UUID> {

    List<Claim> findByClaimantNameOrderBySubmittedAtDesc(String claimantName);

    Optional<Claim> findByClaimNumber(String claimNumber);

    /** Staff work queue. Each filter is optional: pass {@code null} to ignore it. Oldest claims come first. */
    @Query("""
            select c from Claim c
            where (:status is null or c.status = :status)
              and (:market is null or c.market = :market)
              and (:claimType is null or c.claimType = :claimType)
              and (:handler is null or c.assignedHandler = :handler)
            order by c.submittedAt asc
            """)
    List<Claim> search(@Param("status") ClaimStatus status,
                       @Param("market") Market market,
                       @Param("claimType") ClaimType claimType,
                       @Param("handler") String handler);

    @Query(value = "select nextval('claim_number_seq')", nativeQuery = true)
    long nextClaimSequence();

    @Query("select c.status as status, count(c) as count from Claim c group by c.status")
    List<StatusCount> countByStatus();

    @Query("""
            select c.assignedHandler as handler, count(c) as count from Claim c
            where c.assignedHandler is not null and c.status in :statuses
            group by c.assignedHandler
            order by count(c) desc
            """)
    List<HandlerCount> countOpenByHandler(@Param("statuses") Collection<ClaimStatus> statuses);

    interface StatusCount {
        ClaimStatus getStatus();

        long getCount();
    }

    interface HandlerCount {
        String getHandler();

        long getCount();
    }
}

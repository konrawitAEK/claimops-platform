# claimops-platform

APAC motor and property claims platform. Claimants submit and track claims; claims staff pick them up, request information, and settle or reject them. Built as a Spring Boot modular monolith with PostgreSQL and Kafka.

- **Design and trade-offs:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **AI working journal:** [AI_JOURNAL.md](AI_JOURNAL.md)

## Run

Requires Docker.

```bash
docker compose up --build
```

| Service | Address |
|---|---|
| Backend | http://localhost:8080 (health check: `/actuator/health`) |
| PostgreSQL | `localhost:5432`, database, user and password all `claimops` |
| Kafka | `localhost:9092` from the host |

To reset all data, run `docker compose down -v`.

## Test

```bash
cd backend && ./mvnw test
```

The unit tests need no Docker, database or Kafka; JDK 21 is the only requirement. They cover:

| Test | What it proves |
|---|---|
| `ClaimStateMachineTest` | Every operation is tried from every status (25 cases). Each succeeds only from its one legal source status. Otherwise it throws `InvalidStateTransitionException` and leaves the claim unchanged. |
| `ClaimTest` | Business rules: currency per market, settlement cap, owner and assignee checks. |
| `ClaimServiceTest` (Mockito) | A concurrent pickup loses with `ObjectOptimisticLockingFailureException` and publishes no event. Each command raises the right Kafka event. |
| `StaffClaimControllerTest` (`@WebMvcTest`) | An optimistic-lock failure becomes **409** Problem Details, as do invalid transitions. Also covers 401, 403 and 400 with field errors. |
| `ExposureProjectorTest` | Exposure goes up on `CLAIM_SUBMITTED` and down on settle or reject. A redelivered `eventId` is ignored. Currencies are never summed together. |

Thai versions of the docs, for my own preparation: [README.th.md](README.th.md) and [docs/ARCHITECTURE.th.md](docs/ARCHITECTURE.th.md).

## API

Every `/api` request needs two headers:

- `X-User-Role`: `CLAIMANT` or `STAFF`
- `X-User-Name`: the user's name

Errors are returned as RFC 9457 Problem Details.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/claimant/claims` | Claimant | Submit a claim. `currency` is optional: local currency by default, or `USD`. |
| GET | `/api/claimant/claims` | Claimant | List my claims |
| GET | `/api/claimant/claims/{id}` | Claimant | Claim detail, including information requests |
| POST | `/api/claimant/claims/{id}/info-responses` | Claimant | Answer the open information request |
| GET | `/api/staff/claims?status=&market=&claimType=&assignedTo=me` | Staff | Work queue, oldest first |
| GET | `/api/staff/claims/{id}` | Staff | Claim detail |
| POST | `/api/staff/claims/{id}/pickup` | Staff | Take the claim (409 if someone else got it first) |
| POST | `/api/staff/claims/{id}/info-requests` | Assigned handler | Ask the claimant a question |
| POST | `/api/staff/claims/{id}/settlement` | Assigned handler | Settle, for no more than the claimed amount |
| POST | `/api/staff/claims/{id}/rejection` | Assigned handler | Reject, with a reason |
| GET | `/api/staff/dashboard` | Staff | Liability exposure per market, type and currency, plus team workload |
| GET | `/api/staff/claims/{id}/audit` | Staff | Audit trail built from Kafka events |

### Example

```bash
curl -X POST localhost:8080/api/claimant/claims \
  -H 'X-User-Role: CLAIMANT' -H 'X-User-Name: alice' -H 'Content-Type: application/json' \
  -d '{"policyNumber":"POL-1001","claimType":"MOTOR","market":"SG","incidentDate":"2026-11-10","incidentDescription":"Rear-ended at a junction","claimedAmount":5000.00}'
```

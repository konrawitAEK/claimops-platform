# claimops-platform

APAC motor and property claims platform. Claimants submit and track claims; claims staff pick them up, request information, and settle or reject them. Built as a Spring Boot modular monolith with PostgreSQL and Kafka.

- **Design and trade-offs:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **AI working journal:** [AI_JOURNAL.md](AI_JOURNAL.md)

## Run

Requires Docker. Run every command from the repository root unless it says `cd`.

### Everything (recommended)

```bash
docker compose up --build -d
```

| Service | Address |
|---|---|
| App (Angular) | http://localhost:4200. Use the top bar to switch between Claimant and Staff view, user and market. |
| Backend | http://localhost:8080 (health check: `/actuator/health`) |
| API docs | http://localhost:8080/swagger-ui.html (OpenAPI JSON at `/v3/api-docs`). Use "Authorize" to set the two identity headers. |
| PostgreSQL | `localhost:5432`, database, user and password all `claimops` |
| Kafka | `localhost:9092` from the host |

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Follow backend logs | `docker compose logs -f backend` |
| Rebuild one service after a code change | `docker compose up -d --build backend` (or `frontend`) |
| Stop, keeping data | `docker compose down` |

### Reset the database

**Clear all data, keep the stack running.** Claim numbers restart at 000001. Kafka keeps its old events, but the consumer has already passed them, so they are not replayed.

```bash
docker compose exec postgres psql -U claimops -c "TRUNCATE claims, info_requests, liability_exposures, claim_audit_log, processed_events; ALTER SEQUENCE claim_number_seq RESTART;"
```

**Full reset.** Deletes the Postgres volume, so Flyway migrates from scratch and Kafka starts empty. Use this after editing an existing migration file.

```bash
docker compose down -v && docker compose up --build -d
```

### Run parts on the host (for development)

Start only the infrastructure in Docker:

```bash
docker compose up -d postgres kafka
```

**Backend from the host or IDE.** Needs JDK 21. It connects to `localhost:5432` and `localhost:9092` by default. If the backend container is running, stop it first with `docker compose stop backend`.

```bash
cd backend && ./mvnw spring-boot:run
```

**Frontend dev server** on http://localhost:4200, with `/api` proxied to `localhost:8080`. Needs Node 22.22.3 or later. If the frontend container is running, stop it first with `docker compose stop frontend`.

```bash
cd frontend && npm install && npm start
```

### Inspect

```bash
docker compose exec postgres psql -U claimops
```

Read every event on the topic:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic chubb.claims.events --from-beginning
```

## Frontend

The Angular 22 app (standalone components, signals, Angular Material) lives in `frontend/`:

Every component is a folder holding `<name>.ts`, `<name>.html` and `<name>.scss`.

| Folder | Contents |
|---|---|
| `components/` | Shared components, one folder each: `app-layout/` (with the role switcher), `alert/`, `status-chip/` |
| `core/` | `identity.interceptor.ts` (adds `X-User-Role` / `X-User-Name`), `guards.ts` (`roleGuard`), API URL and error text, labels |
| `utils/` | Pure helper functions: `format.util.ts` (money, dates), `text.util.ts`, `claim.util.ts` |
| `models/` | One `*.model.ts` per area, mirroring the backend DTOs |
| `services/` | `session`, `claimant` and `staff` API services |
| `pages/` | One folder per feature, each with its own `<feature>.routes.ts`, lazy-loaded by `app.routes.ts`. `claimant/` holds `submit-claim/` and `track-claim/`; `staff/` holds `staff-workspace/`. A page's own sub-components live in `<page>/components/<name>/` |

Calls go to the relative path `/api`. nginx (in Docker) or the dev-server proxy (`ng serve`) forwards them to the backend, so there is no CORS setup and no URL baked into the build. To run it outside Docker, see *Run parts on the host*.

## Test

```bash
cd backend && ./mvnw test
```

Frontend type check and production build (Node 22.22.3 or later):

```bash
cd frontend && npm run build
```

Or, without a local Node, the same build in a container:

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22.23-alpine sh -c "npm ci && npm run build"
```

The backend unit tests need no Docker, database or Kafka; JDK 21 is the only requirement. They cover:

| Test | What it proves |
|---|---|
| `ClaimTest` (7) | Lifecycle and business rules: the valid path; settling a `SUBMITTED` claim and changing a `REJECTED` one both fail; no takeover of a claim waiting for the claimant (regression); only the assignee may decide; settlement cap; currency rule. |
| `ClaimServiceTest` (2, Mockito) | A concurrent pickup loses with `ObjectOptimisticLockingFailureException` and publishes no event. Submitting raises `CLAIM_SUBMITTED`. |
| `StaffClaimControllerTest` (2, `@WebMvcTest`) | An optimistic-lock failure becomes **409** Problem Details. A claimant calling a staff endpoint gets 403. |
| `ExposureProjectorTest` (4) | Exposure goes up on `CLAIM_SUBMITTED` and down on settle or reject. A redelivered `eventId` is ignored. |

## API

Every `/api` request needs two headers:

- `X-User-Role`: `CLAIMANT` or `STAFF`
- `X-User-Name`: the user's name

Errors are returned as RFC 9457 Problem Details.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/claimant/claims` | Claimant | Submit a claim. `currency` is optional: local currency by default, or `USD`. `incidentDetails` must hold `licensePlate` and `vehicleModel` for MOTOR, or `propertyAddress` and `damageCategory` for PROPERTY. |
| GET | `/api/claimant/claims/by-number/{claimNumber}` | Claimant | Track a claim by its number (only the caller's own) |
| GET | `/api/claimant/claims` | Claimant | List my claims |
| GET | `/api/claimant/claims/{id}` | Claimant | Claim detail, including information requests |
| POST | `/api/claimant/claims/{id}/info-responses` | Claimant | Answer the open information request |
| GET | `/api/staff/claims?status=&market=&claimType=&assignedTo=me` | Staff | Work queue, oldest first |
| GET | `/api/staff/claims/{id}` | Staff | Claim detail |
| POST | `/api/staff/claims/{id}/pickup` | Staff | Take the claim (409 if someone else got it first) |
| POST | `/api/staff/claims/{id}/info-requests` | Assigned handler | Ask the claimant a question |
| POST | `/api/staff/claims/{id}/settlement` | Assigned handler | Settle, for no more than the claimed amount |
| POST | `/api/staff/claims/{id}/rejection` | Assigned handler | Reject, with a reason |
| GET | `/api/staff/dashboard` | Staff | Liability exposure per market, type and currency; team workload; per-officer performance (settled, rejected, average time to decision) |
| GET | `/api/staff/claims/{id}/audit` | Staff | Audit trail built from Kafka events |

### Example

```bash
curl -X POST localhost:8080/api/claimant/claims \
  -H 'X-User-Role: CLAIMANT' -H 'X-User-Name: alice' -H 'Content-Type: application/json' \
  -d '{"policyNumber":"POL-1001","claimType":"MOTOR","market":"SG","incidentDate":"2026-11-10","incidentDescription":"Rear-ended at a junction","claimedAmount":5000.00}'
```

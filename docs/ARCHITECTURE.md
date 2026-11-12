# Architecture

Claims platform for Chubb APAC: claimants submit motor and property claims and track them; claims staff review, assess and settle or reject them.

Status: **agreed design, not yet implemented.**

## Domain

| Entity | Purpose |
|---|---|
| **User** | Has one role: `CLAIMANT`, `HANDLER` (claims officer) or `MANAGER` (team view). |
| **Policy** | Seeded reference data. Links a claim to its cover and limit. There is no policy management. |
| **Claim** | Type (`MOTOR` / `PROPERTY`), market, incident date, description, claimed amount, assigned handler, status, and **reserve** (the estimated amount the company expects to pay). |
| **InfoRequest** | A handler's question to the claimant and the claimant's answer. |
| **ClaimEvent** | Append-only history of every change to a claim. It serves as the audit trail and as the Kafka event payload. |

### Claim lifecycle

```
SUBMITTED ──▶ UNDER_REVIEW ──▶ APPROVED ──▶ SETTLED
                 │   ▲   │
                 ▼   │   └──▶ REJECTED
              PENDING_INFO
```

- A handler picks up a `SUBMITTED` claim, which moves it to `UNDER_REVIEW` with that handler assigned.
- Asking the claimant for more information moves the claim to `PENDING_INFO`. The claimant's answer moves it back to `UNDER_REVIEW`.
- `SETTLED` and `REJECTED` are terminal states.

**Outstanding liability exposure** is the sum of the reserves on all open claims (every status except `SETTLED` and `REJECTED`), broken down by market and claim type.

## Backend

There is one Spring Boot service (Java 21) with two internal modules:

- **claims** handles commands and queries over REST. It owns the claim tables and publishes a `ClaimEvent` for every state change.
- **reporting** consumes the `claim-events` Kafka topic and builds read models: handler and team workload, outstanding exposure, and claimant notifications. It can also run automatic triage on a newly submitted claim.

### REST vs Kafka

| Channel | Used for | Why |
|---|---|---|
| **REST** | Submit a claim, pick up, request info, respond, approve, reject, settle, and every read | The user needs an immediate result, such as a claim number on submit or a validation error. |
| **Kafka** (`claim-events`) | Workload and exposure projections, notifications, triage | Side effects shouldn't slow down or fail the user's request. New consumers can be added without changing the command path. |

### Why one service, not two

Two deployable services would need two deploy pipelines, two databases, and handling of cross-service consistency, all within a 5-hour time box. Instead, the module boundary between claims and reporting is drawn explicitly, and the two modules already talk only through Kafka. To split reporting into its own service later, move that module out and give it its own database.

### Stack

- PostgreSQL, with Flyway for migrations
- Kafka in KRaft mode, single node
- Testcontainers for integration tests
- Docker Compose: `docker compose up` starts everything

## Contract

The design is contract-first. `contracts/openapi.yaml` is the source of truth: the backend implements it, and the Angular types are generated from it.

## Frontend

One Angular app serves both user types:

- Lazy-loaded `claimant/` and `staff/` feature areas, each protected by a role-based route guard.
- Claim status uses polling for now. Server-Sent Events (SSE) are the next step if time allows.

## Priorities (5-hour cap)

1. **Backend core** (about 2 hours): entities, state machine, REST, and tests for the state transitions.
2. **Kafka** (about 1 hour): publish events; a consumer builds the workload and exposure projections.
3. **Angular** (remaining time): claimant submit and track, and the staff work queue.

**Out of scope:**
- Document upload
- Real authentication (seeded users with a simple JWT instead)
- Multi-currency

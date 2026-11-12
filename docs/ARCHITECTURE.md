# Architecture

Claims platform for Chubb APAC: claimants submit motor and property claims and track them; claims staff review, assess and settle or reject them.

Status: **backend** (`backend/`) and **Angular frontend** (`frontend/`) implemented. Both run with `docker compose up --build`.

> The first design (see the 11:17 journal entry) was revised at the start of the build (11:32 entry): the `APPROVED` status was dropped, JWT was replaced by header-based identity, and the module and topic names changed. This document describes what is built.

## Domain

| Entity | Purpose |
|---|---|
| **Claim** | The aggregate root. Holds type (`MOTOR` / `PROPERTY`), market, currency, incident date and description, claimed and settled amounts, assigned handler, status and an optimistic-lock `version`. |
| **InfoRequest** | A handler's question to the claimant and the claimant's answer. It belongs to the Claim aggregate and changes only through it. |
| **Incident details** | Type-specific fields stored as JSONB: `licensePlate` and `vehicleModel` for MOTOR, `propertyAddress` and `damageCategory` for PROPERTY. The required keys live on `ClaimType`, so adding a field changes the enum and the form, not the schema. |
| **ClaimEvent** | Kafka payload (`chubb.claims.events`). It carries a snapshot, so consumers never read the claim tables. |

**Markets and currencies:** SG, TH, MY, HK, AU and JP. A claim is filed in the market's local currency (the default) or in USD. Amounts are never converted between currencies.

### Claim lifecycle

```
SUBMITTED ──▶ IN_REVIEW ──▶ SETTLED
                │  ▲    └──▶ REJECTED
                ▼  │
           INFO_REQUESTED
```

- **Transition table:** `ClaimStatus.allowedNext()` holds all the transitions in one place. `Claim` checks it before every change and has no setters, so no code path can skip it.
- **One source status per operation:** pick-up only from `SUBMITTED`, and answering only from `INFO_REQUESTED`, even though both lead to `IN_REVIEW`. The table alone would let an officer take over a claim that is waiting for the claimant. An exhaustive state-machine test caught this; a regression test now covers it.
- **Who may act:**
  - Any staff member can pick up a `SUBMITTED` claim, and becomes its assigned handler.
  - Only the assigned handler can request information, settle or reject.
  - Only the claim's owner can answer an information request.
- **Settlement:** the settled amount must be greater than 0 and no more than the claimed amount.

## Backend: modular monolith

One Spring Boot 3.5 service (Java 21) with three packages:

| Package | Responsibility |
|---|---|
| `claim` | Write model. REST API, state machine, JPA entities, and event publishing. |
| `exposure` | Read models. A Kafka consumer maintains `liability_exposures` and `claim_audit_log`; the module also serves the staff dashboard. |
| `common` | Header-based identity, Problem Details error mapping, Kafka and clock configuration. |

Dependencies point one way only, from `exposure` to `claim`. The claim module knows nothing about reporting.

### REST vs Kafka

| Channel | Used for | Why |
|---|---|---|
| **REST** | Submit, pick up, request info, answer, settle, reject; every read | The user needs an immediate, consistent result, such as a claim number or a 409. |
| **Kafka** `chubb.claims.events` | `CLAIM_SUBMITTED`, `CLAIM_STATUS_CHANGED`, `CLAIM_DECIDED` → exposure projection and audit trail | Side effects must not slow down or fail the officer's request. New consumers (notifications, fraud triage) can be added without touching the write path. |

### Consistency and integrity

- **Optimistic locking:** `Claim` has a `@Version` field. If two officers pick up the same claim at the same time, one succeeds and the other gets **409 Concurrent update**. This was verified against the running stack.
- **Publishing after commit:** events are sent from a `@TransactionalEventListener(AFTER_COMMIT)`, so a rolled-back change never produces an event.
  - **Known gap:** the commit and the send are not atomic. A transactional outbox would close the gap.
- **Ordering:** each event's Kafka key is the claim id, so all events for one claim are consumed in order.
- **Idempotent consumer:** each event id is inserted into `processed_events` in the same transaction as the read-model update. A replayed event is skipped (verified by re-producing an event).
- **Atomic exposure updates:** exposure is updated with `INSERT … ON CONFLICT DO UPDATE`, so concurrent consumers can't lose an update.
- **Testable projection rules:** `ExposureProjector` holds the rules; `ExposureStore` / `JdbcExposureStore` holds the SQL. The rules are unit-tested without a database.
- **Retry policy:** a failing record is retried 3 times and then skipped. A dead-letter topic is the production follow-up.

**Liability exposure** is the claimed amount of all open claims, broken down by market, claim type and currency. It is eventually consistent, typically a few milliseconds behind. The workload counts on the dashboard are read from the write model instead, so they are exact.

### Identity (simplified)

Each request identifies its caller with two headers:

- `X-User-Role`: `CLAIMANT` or `STAFF`
- `X-User-Name`: the user's name

Role boundaries are enforced by path: `/api/claimant/**` is for claimants and `/api/staff/**` is for staff. A claimant who asks for someone else's claim gets 404, not 403, so the response doesn't reveal that the claim exists. Moving to OAuth2/JWT means replacing only `HeaderAuthInterceptor`.

### Stack

- Java 21 and Spring Boot 3.5.16 (as specified; Spring Initializr now defaults to 4.x)
- PostgreSQL 16, with Flyway for migrations
- Kafka 3.9.1 in KRaft mode
- Lombok `@Getter` on entities (no setters)
- `docker compose up --build` starts everything

## Frontend

One Angular 22 app (standalone components, signals, zoneless change detection, Angular Material) serves both user types.

- **Identity:** a top-bar switcher picks the role, user and market. `identityInterceptor` sends the role and user as `X-User-Role` / `X-User-Name` on API calls only.
- **Routes:** `roleGuard` protects `/claim/*` (claimant) and `/staff`. Each page is lazy-loaded.
- **Claimant pages:**
  - **Submit:** a reactive form whose detail fields switch with the claim type, plus a currency choice of local or USD.
  - **Track:** look a claim up by number. Shows a status chip and a timeline built from the claim, with a reply form only while the claim is `INFO_REQUESTED`.
- **Staff workspace:** exposure cards per market, workload tiles, and a queue filtered by market, status and "only mine".
  - Pick Up / Request info / Settle / Reject are shown only when the action is legal for that claim.
  - A **409** is shown as a "changed by someone else" warning, and the queue reloads.
  - Clicking a row opens a **claim drawer** (`claim-drawer.ts`): full details, the Q&A thread, the decision and the audit trail.
- **Freshness:** pages poll every 10 s. SSE is the upgrade path.
- **Same origin:** the app calls `/api`. nginx proxies it to the backend, so no CORS setup is needed.

## Out of scope

- Document upload
- Real authentication
- FX conversion
- A handler-set reserve: exposure uses the claimed amount instead
- Transactional outbox
- Dead-letter topic

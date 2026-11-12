# AI Working Journal

A running log of what I asked the AI, what I accepted, challenged or overrode, and why. Written as I worked; not polished.

- **Tool:** Claude Code (model: _fill in_)
- **Raw prompt log:** `docs/ai-prompts.jsonl` is written automatically, one line per prompt with a timestamp

## Time log

| Start | End | Elapsed | Focus |
|---|---|---|---|
| | | | |

## Key decisions at a glance

Fill this in at the end. It's the table to bring to the walkthrough.

| Decision | Outcome | Why |
|---|---|---|
| | | |

---

## Entries

<!-- Entry format (Claude appends these; I fill in "My reasoning"):

### HH:MM: <short title>
- **Asked:** …
- **AI proposed:** …
- **Outcome:** Accepted | Challenged | Overrode
- **My reasoning:** _(candidate to fill)_
-->

### 11:17: Overall architecture and scope
- **Asked:** I described the system as a platform for submitting and reviewing Chubb claims, and asked for a design.
- **AI proposed:**
  - Entities: User (`CLAIMANT` / `HANDLER` / `MANAGER`), seeded Policy, Claim with a reserve, InfoRequest, ClaimEvent.
  - Claim lifecycle: `SUBMITTED → UNDER_REVIEW ⇄ PENDING_INFO → APPROVED → SETTLED`, with `REJECTED` reachable from review.
  - One Spring Boot service with separate claims and reporting modules. Rejected two services because of the deploy and consistency cost within 5 hours.
  - REST for commands and queries; Kafka `claim-events` for the workload and exposure projections, notifications and triage.
  - Contract-first OpenAPI; one Angular app with role-guarded `claimant/` and `staff/` areas; polling before SSE.
  - Priority order: backend core, then Kafka, then Angular. Cut: document upload, real auth, multi-currency.
- **Outcome:** Accepted (my reply: *"up โครงสร้างนี้ขึ้น git"*, meaning "push this structure to git"). Recorded in `docs/ARCHITECTURE.md`.
- **My reasoning:** _(candidate to fill)_

### 11:32: Step 1, backend build (my own detailed spec)
- **Asked:** I wrote my own prompt, setting the AI up as a principal engineer with strict guardrails, and asked for docker-compose plus the full backend. It changed the 11:17 design:
  - The lifecycle drops `APPROVED`: `SUBMITTED → IN_REVIEW ⇄ INFO_REQUESTED → SETTLED | REJECTED`.
  - Header-based identity (`X-User-Role` / `X-User-Name`) replaces JWT.
  - Packages are `claim` / `exposure` / `common`, and the topic is `chubb.claims.events`.
  - Requires `@Version` optimistic locking (409 on a concurrent pickup) and an idempotent consumer that tracks event ids.
  - The time box is 3 hours.
- **AI proposed (implementation choices made while building, not yet reviewed by me):**
  - **Spring Boot 3.5.16**, as I specified. Initializr now only offers 4.x, so the AI flagged that 3.x is the older line.
  - **Publishing to Kafka:** after the transaction commits, without a transactional outbox. Documented as a known gap.
  - **Exposure:** the claimed amount of open claims stands in for a reserve.
  - **Exposure writes:** idempotency ledger plus SQL upserts in one transaction.
  - **Data sources:** workload counts come from the write model, which is exact; exposure comes from the read model, which is eventually consistent.
  - **Hiding other claimants' claims:** a claimant asking for someone else's claim gets 404, not 403.
  - **Settlement cap:** the settled amount can't exceed the claimed amount.
  - **Kafka errors:** a failing record is retried 3 times and then skipped. No dead-letter topic yet.
- **Verified by the AI against the running stack:**
  - The full lifecycle works end to end.
  - Responses: 401 and 403 for identity and role, 404 for another claimant's claim, 409 for a concurrent pickup and for an invalid transition, 422 for a broken business rule, 400 for validation.
  - Replaying a Kafka event was skipped as a duplicate.
  - 14 unit tests pass.
- **Outcome:** Overrode (my spec replaced parts of the 11:17 design).
- **My reasoning:** _(candidate to fill)_

### 11:50: Lombok and USD (my request mid-build)
- **Asked:** *"เพิ่มการใช้ @Getter @Setter เพื่อลดการเขียนโค้ด get set และเพิ่มสกุลเงิน USD"* (use Lombok @Getter/@Setter to cut getter/setter code, and add USD).
- **AI proposed:**
  - **Lombok:** used `@Getter` and `@NoArgsConstructor(access = PROTECTED)` on the entities, but pushed back on `@Setter`. No setters existed, so it would remove no code. A public `setStatus` would also let callers bypass the state machine and the assignee check. The AI kept the getter for `infoRequests` hand-written so the list stays read-only.
  - **USD:** interpreted as "a claim may be filed in the market's local currency or in USD". Added a `Currency` enum and an optional `currency` field (defaulting to the local currency). Another market's currency returns 422. The exposure key became market + type + currency, so currencies are never summed together.
- **Outcome:** _(candidate to fill: Accepted / Challenged / Overrode, depending on my answer about @Setter and the USD interpretation)_
- **My reasoning:** _(candidate to fill)_

---

## What I'd do with more time

<!-- Fill this in at the end. It's a 10-minute segment of the walkthrough. -->

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

---

## What I'd do with more time

<!-- Fill this in at the end. It's a 10-minute segment of the walkthrough. -->

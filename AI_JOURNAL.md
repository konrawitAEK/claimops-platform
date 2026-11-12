# AI Working Journal

A running log of what I asked the AI, what I accepted, challenged or overrode, and why. Written as I worked; not polished.

- **Tool:** Claude Code (model: _fill in_)
- **Raw prompt log:** `docs/ai-prompts.jsonl` is written automatically, one line per prompt with a timestamp

## Time log

| Start | End | Elapsed | Focus |
|---|---|---|---|
| 11:17 | 11:57 | 0:40 | Before the formal timer: architecture design, then backend step 1 (API, Kafka, Docker). Timestamps from `docs/ai-prompts.jsonl`. |
| 11:57 | | | Formal timer started |

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

### 11:59: Unit tests with no external dependencies (my spec), and Thai docs
- **Asked:** JUnit 5 + Mockito tests covering:
  - the state machine (valid and invalid transitions),
  - a concurrent pickup mapping `OptimisticLockingFailureException` to 409,
  - the idempotent Kafka consumer (exposure up on submit, down on settle or reject, duplicates ignored).
  They had to run with `./mvnw test` and no external dependencies. I also asked for every `.md` file to be in Thai.
- **AI proposed:**
  - **Exhaustive state-machine test:** every operation from every status. **It caught a real bug.** `pickUp` checked only "can move to IN_REVIEW", and `INFO_REQUESTED → IN_REVIEW` is a legal edge, so a second officer could take over a claim that was waiting for the claimant. Fixed by giving each operation one source status.
  - **Status before actor:** status rules are now checked before the assignee check, so settling a `SUBMITTED` claim returns 409 "SUBMITTED to SETTLED" rather than 403 "not assigned", as my spec expected.
  - **Testing the consumer without a database:** extracted an `ExposureStore` port from `ExposureProjector`. The projection rules are tested against an in-memory store; the SQL lives in `JdbcExposureStore`.
  - **Testing the 409 mapping:** a `@WebMvcTest` with the real interceptor and exception handler and a mocked service, so no database or Kafka is needed. Also fixed a null `version` in `ClaimDetail` that the service tests exposed.
  - **Thai docs:** pushed back on translating the deliverables. The panel is APAC, so `README.md`, `ARCHITECTURE.md` and this journal stay in English. Thai versions were added as `README.th.md` and `docs/ARCHITECTURE.th.md`, with a list of likely panel questions.
  - **Verified:** 63 tests pass without Docker. The rebuilt stack passes the smoke test.
  - **Not covered by unit tests:** a real database race. The concurrent pickup was verified manually against Postgres. A Testcontainers integration test is still to do.
- **Outcome:** _(candidate to fill: Accepted, or Overrode if I want the main docs in Thai)_
- **My reasoning:** _(candidate to fill)_

### 12:06: Cut the test suite to essentials
- **Asked:** *"test case มีจำนวนเยอะเกินไปรึป่าว เหลือไว้เท่าที่จำเป็นสำคัญๆ ก่อน"* ("Aren't there too many test cases? Keep only the essential ones for now.")
- **AI proposed:** Cut 63 tests to 15, keeping one test per rule that matters:
  - **ClaimTest (7):** the valid lifecycle; settling a `SUBMITTED` claim fails; a `REJECTED` claim is final; a regression test for the takeover bug; only the assignee may decide; the settlement cap; the currency rule.
  - **ClaimServiceTest (2):** a concurrent pickup loses with an optimistic-lock failure and publishes no event; submitting raises `CLAIM_SUBMITTED`.
  - **StaffClaimControllerTest (2):** a lock failure maps to 409; a claimant calling a staff endpoint gets 403.
  - **ExposureProjectorTest (4):** exposure up on submit, down on settle and on reject; a duplicate event is ignored.
  - **Dropped:** the 25-case exhaustive state-machine matrix, which had already caught the takeover bug that the regression test now pins. Also dropped the separate transition-table test and the secondary 400/401, currency-summing and audit-only cases.
- **Outcome:** _(candidate to fill)_
- **My reasoning:** _(candidate to fill)_

### 12:10: Angular frontend (my spec), structured like my previous project
- **Asked:** My own spec for an Angular 18+ standalone frontend:
  - a role switcher that sends identity headers through an interceptor, and a `roleGuard`;
  - claimant submit with MOTOR or PROPERTY detail fields, and track by claim number with a timeline and an inline reply;
  - a staff workspace with exposure cards, workload, and a queue whose actions handle 409.

  I added: *"พยายามทำตามโครงสร้างที่ฉันเคยทำไปก่อนหน้านี้"* ("follow the structure I used before").
- **AI proposed:**
  - **Structure:** mirrored my SwiftQuote Angular app: `components/`, `core/` (interceptor, guards, api, labels), `models/*.model.ts`, `services/*.service.ts`, `pages/<page>/<page>-page.{ts,html,scss}`. Same stack: Angular 22.2.3, Material 3, zoneless signals, nginx image.
  - **Backend changes the spec needed:**
    - `incidentDetails` as JSONB, with the required keys on `ClaimType` and checked by the domain (422 if one is missing; unknown keys dropped);
    - `GET /api/claimant/claims/by-number/{n}`, scoped to the owner (404 otherwise).
  - **API calls:** the browser calls `/api` and nginx proxies it, rather than calling the backend directly with CORS. No API URL is baked into the build.
  - **Claimant timeline:** built from the claim detail, not the staff audit endpoint, so internal events stay internal.
  - **409 handling:** a warning alert ("changed by someone else"), then the queue reloads.
  - **Freshness:** polling every 10 s rather than SSE, to fit the time box.
  - **Market selector:** sets the claimant's default market and the staff queue's default filter.
- **Verified:**
  - The production build passes with strict templates.
  - The whole stack runs on :4200.
  - Through the nginx proxy: submit with `incidentDetails` (unknown key dropped), track by number, another claimant's number gives 404, a missing detail gives 422, and JP exposure appears in JPY.
  - The 15 backend tests still pass.
- **Not verified:** the UI has not been opened in a browser. The browser tool was unavailable in this session, so screens, the role switcher and the dialogs are unchecked by eye.
- **Outcome:** _(candidate to fill)_
- **My reasoning:** _(candidate to fill)_

### 12:40: Claim detail drawer on /staff
- **Asked:** *"หน้าของ /staff … ควรดูได้ว่ารายการนี้มีรายละเอียดอะไรบ้าง จะทำเป็น pop-up drawer ก็ได้ แต่ต้องทำเป็นไฟล์แยกไว้แล้วค่อยดึงมาใช้"* ("on /staff, officers should be able to see a claim's full details; a pop-up drawer is fine, but put it in its own file and import it").
- **AI proposed:**
  - **Component:** `claim-drawer.ts` in `pages/staff-workspace/`, next to `decision-dialog.ts`, opened through an `openClaimDrawer()` helper.
  - **Built on MatDialog,** pinned to the right at full height, rather than a `mat-sidenav` in the page layout. This reuses the focus trap, Escape and backdrop, and keeps the page template unchanged.
  - **Data loading:** the drawer loads the claim and its audit trail itself (`forkJoin`), so the queue passes only an id. Added `StaffService.audit()` for the existing `/audit` endpoint.
  - **Contents:** facts, incident details, the Q&A thread, the decision note, and the audit trail. The audit trail comes from the Kafka read model and can lag a moment.
  - **Opening it:** click a row or the new View button. The action buttons stop the click from reaching the row.
- **Verified:** the production build passes, the container was redeployed, and the drawer's two calls return 200 through nginx (5 audit events). **Not verified in a browser** (no browser tool in this session).
- **Outcome:** _(candidate to fill)_
- **My reasoning:** _(candidate to fill)_

### 12:47: Separate CSS from TypeScript
- **Asked:** *"ควรแยก css ออกมาจาก ts"* ("CSS should be separated from the TS").
- **AI proposed:** Moved the inline `styles` of all 7 components into a sibling `<name>.scss` referenced by `styleUrl`: alert, status-chip, app-layout, claim-timeline, exposure-cards, decision-dialog, claim-drawer. No rule changed. Templates stay inline in the small components, as in SwiftQuote; the pages already had separate `.html` and `.scss` files. The production build passes.
- **Outcome:** _(candidate to fill)_
- **My reasoning:** _(candidate to fill)_

### 12:50: Separate HTML too, one folder per component
- **Asked:** *"html ก็ต้องแยก แล้วสร้างเป็นไฟล์ components แล้วมีไฟล์ที่เป็นไฟล์เสริมเหล่านี้แยกเป็น folder ข้างในอีกที"* ("separate the HTML as well, make them component files, and put these supporting files in their own folder inside").
- **AI proposed:**
  - **One folder per component:** every component, the root `app` included, now has `<name>.ts`, `<name>.html` and `<name>.scss` in its own folder. No inline templates or styles remain.
  - **Shared components** stay in `components/`: `alert/`, `status-chip/`, `app-layout/`.
  - **Page-specific sub-components** moved to `pages/<page>/components/<name>/`: `claim-timeline` under track-claim; `claim-drawer`, `decision-dialog` and `exposure-cards` under staff-workspace.
  - **Moves and imports:** files were moved with `git mv` so their history follows them, and relative imports were rewritten.
  - The production build passes. Markup and styles are unchanged.
- **Outcome:** _(candidate to fill)_
- **My reasoning:** _(candidate to fill)_

---

## What I'd do with more time

<!-- Fill this in at the end. It's a 10-minute segment of the walkthrough. -->

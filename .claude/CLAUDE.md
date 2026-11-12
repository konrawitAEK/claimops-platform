# Claims Platform: take-home assessment

Chubb APAC full-stack take-home: a motor and property claims platform.
- Claimants report incidents, track their claims, answer requests for more information and receive decisions.
- Claims staff pick up claims, assess them, settle or reject them, and see their team's workload.

Required stack: Angular for the frontend, Spring Boot or .NET for the backend, REST and Kafka for communication.
Time box: 2–3 hours target, 5 hours hard cap. The backend comes first; the frontend is built only if time allows.

## The AI journal is a deliverable

`AI_JOURNAL.md` is graded. It must be an honest running log, written **during** the work, not afterwards.

After every exchange where a decision is made (design, technology, scope, a code change I review), append one entry to
`AI_JOURNAL.md` before ending your turn, using the entry format already in that file:
- **Asked:** my request, summarised in one line (quote me when the wording matters).
- **AI proposed:** what you suggested, including alternatives you rejected and why.
- **Outcome:** exactly one of `Accepted`, `Challenged`, or `Overrode`, as defined below.
  - `Accepted`: I took your proposal as is.
  - `Challenged`: I questioned it and we changed it together.
  - `Overrode`: I replaced it with my own decision.
- **My reasoning:** leave the placeholder `_(candidate to fill)_`. Never write my reasoning for me.

Rules:
- Never invent or embellish entries. If I simply said "ok", the outcome is `Accepted`.
- Skip trivial turns such as typos or "run the tests". Log the decision, not every message.
- Commit the journal together with the code it describes, so the git history shows them side by side.
- At each step, also update the elapsed time in the `Time log` section when I tell you the time.

## Working rules

- Explain trade-offs briefly and recommend one option. I make the final call on architecture and scope.
- Small, meaningful commits on a feature branch, using Conventional Commit messages.
- Keep everything runnable locally with one command (e.g. `docker compose up`).
- When something is unverified (not run, not tested, not opened in a browser), say so explicitly.
- I must be able to defend every line in the walkthrough: flag any code that is non-obvious so I can review it.

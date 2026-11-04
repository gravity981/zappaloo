# CLAUDE.md

## Project

<One paragraph: what the project is.> The specification in `spec/` is the source of truth; the code implements it.

| Document | Content |
|---|---|
| `spec/README.md` | Purpose, document index, status of each spec topic |
| `spec/sw-architecture.md` | Requirements, architecture, technology choices |
| `spec/test-strategy.md` | Test levels, requirement traceability, "not yet implemented" list |

## Working with the spec

- **Ask, don't assume.** When the spec leaves something open or is ambiguous, ask before implementing. Never fill a gap with your own assumption. Offer concrete options with a recommendation so the question is quick to answer.
- Once a gap is decided, write the decision into the spec (in the requirement it belongs to, or a "decisions" section), so the spec stays complete.
- Requirements live in tables with IDs (`| ABC-01 | Requirement | Prio |`, prefix of 2–4 capital letters per topic). Never renumber or reuse an ID; add new ones at the end of the topic.
- When implementation shows the spec is wrong or incomplete, point it out and propose a spec change. Don't silently deviate.

## Requirement traceability

- Every requirement is verified by at least one test, and each test names the requirement IDs it verifies:
  - <backend, e.g.> `@pytest.mark.req("ABC-01")`
  - <frontend / e2e, e.g.> `it("[ABC-01] does something", ...)`
- A requirement report (`<command, e.g. python -m <pkg>.tools.req_report>`) lists requirement → tests → result. CI fails if an implemented requirement has no passing test. Requirements not implemented yet are listed in `spec/test-strategy.md` ("not yet implemented"); shrink that list as stages are delivered.

## Implementation in stages

- The spec is implemented in stages, each split into steps (1a, 1b, …). Agree on the stage and step plan with the user before starting a stage.
- **The user creates branches and makes all commits. Never commit, and never create or switch branches.**
- Each stage is built on a branch named `feature/stage-<n>` or `feature/stage-<n>-<text>`. Before changing any file for a step, check:
  - `git branch --show-current` matches the current stage (exactly `n`, so `stage-1` does not match `stage-10`);
  - the working tree is clean (the previous step is committed).
  If either check fails, stop and ask the user. Don't fix it yourself.
- After each step: stop with a short summary (what changed, tests and their results, anything open) so the user can review and commit.
- **When a stage is complete,** finish with the updated status plan:
  - a table of stage | content | status (done / next / open);
  - the remaining requirements grouped by stage, with numbers taken from the requirement report;
  - anything waiting on the user.

## Environment

- <If the repo is on WSL / Windows:> The checkout has `core.fileMode=false`, so `chmod +x` is never committed. Invoke scripts explicitly (`bash script.sh`) and set the mode in the index: `git update-index --chmod=+x <file>` (check with `git ls-files -s <file>` → `100755`).
- Commands: <how to run the tests, the linter, the requirement report, and the app>.

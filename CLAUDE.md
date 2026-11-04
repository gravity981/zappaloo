# CLAUDE.md

## Project

Zappaloo is a reusable event platform (first use: a wedding) that combines a browser-based pixel-art game world — the core experience — with a classic event website. Guests redeem printed invitations, answer the RSVP, explore the event venues with their avatar among the wandering figures of the other guests, share snapshots and keepsakes, and play minigames. Full TypeScript stack: React, Phaser 4, Node.js, SQLite, deployed with Docker Compose and Caddy. The specification in `spec/` is the source of truth; the code implements it.

| Document | Content |
|---|---|
| `spec/README.md` | Purpose, document index, status of each spec topic |
| `spec/sw-architecture.md` | Requirements, architecture, technology choices |
| `spec/test-strategy.md` | Test levels, requirement traceability, "not yet implemented" list |
| `spec/implementation-plan.md` | Stages and steps, preconditions per stage, releases, status reports |

## Working with the spec

- **Ask, don't assume.** When the spec leaves something open or is ambiguous, ask before implementing. Never fill a gap with your own assumption. Offer concrete options with a recommendation so the question is quick to answer.
- Once a gap is decided, write the decision into the spec (in the requirement it belongs to, or a "decisions" section), so the spec stays complete.
- Requirements live in tables with IDs (`| ABC-01 | Requirement | Prio |`, prefix of 2–4 capital letters per topic). Never renumber or reuse an ID; add new ones at the end of the topic.
- When implementation shows the spec is wrong or incomplete, point it out and propose a spec change. Don't silently deviate.

## Requirement traceability

- Every requirement is verified by at least one test, and each test names the requirement IDs it verifies:
  - Vitest (unit, component, integration): `it("[ABC-01] does something", ...)`
  - Playwright (end-to-end): `test("[ABC-01][ABC-02] does something", ...)`
- A requirement report (`npm run req-report`, built in step 1a) lists requirement → tests → result. CI fails if an implemented requirement has no passing test. Requirements not implemented yet are listed in `spec/test-strategy.md` ("not yet implemented"); shrink that list as stages are delivered.

## Implementation in stages

- The spec is implemented in stages, each split into steps (1a, 1b, …), as planned in `spec/implementation-plan.md`. Before starting a stage, confirm its preconditions and steps with the user.
- **The user creates branches and makes all commits. Never commit, and never create or switch branches.**
- Each stage is built on a branch named `feature/stage-<n>` or `feature/stage-<n>-<text>`. Before changing any file for a step, check:
  - `git branch --show-current` matches the current stage (exactly `n`, so `stage-1` does not match `stage-10`);
  - the working tree is clean (the previous step is committed).
  If either check fails, stop and ask the user. Don't fix it yourself.
- After each step: stop with a short summary (what changed, tests and their results, anything open) so the user can review and commit.
- **When a stage is complete,** write a status report using the template in `spec/implementation-plan.md` (section 4), append it to section 5 there, update the overview table in section 3, and show the report in the conversation. It includes:
  - a table of stage | content | status (done / next / open);
  - the remaining requirements grouped by stage, with numbers taken from the requirement report;
  - anything waiting on the user.

## Environment

- Development happens in the devcontainer (`.devcontainer/`): Node.js, Playwright browsers (Chromium, WebKit), Mailpit (caught emails, web UI on port 8025), sqlite3. Dev data lives in the `zappaloo-data-dev` volume at `/var/lib/zappaloo`.
- Monorepo with npm workspaces `shared`, `backend`, `frontend`; tooling scripts in `scripts/` run directly by Node.js (type stripping, imports with `.ts` extension).
- Commands (from the repository root):

| Command | Does |
|---|---|
| `npm run lint` | ESLint (type-checked rules), no warnings allowed |
| `npm run format` / `npm run format:check` | Prettier (Markdown is excluded) |
| `npm run typecheck` | `tsc` for the root (scripts, e2e, configs) and every workspace |
| `npm test` | Vitest, all workspaces; JSON results in `reports/vitest.json` |
| `npm run test:e2e` | Playwright (desktop/mobile, Chromium/WebKit); JSON results in `reports/playwright.json` |
| `npm run req-report` | Requirement report from the spec and both JSON results; full report in `reports/requirements.md`; non-zero exit on errors |
| `npm run check` | All of the above in CI order |

- Run the tests before the requirement report; it reads their JSON results.

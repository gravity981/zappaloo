# CLAUDE.md

## Project

Zappaloo is a reusable event platform (first use: a wedding) that combines a browser-based pixel-art game world — the core experience — with a classic event website. Guests redeem printed invitations, answer the RSVP, explore the event venues with their avatar among the wandering figures of the other guests, share snapshots and keepsakes, and play minigames. Full TypeScript stack: React, Phaser 4, Node.js, SQLite, deployed with Docker Compose and Caddy. The specification in `spec/` is the source of truth; the code implements it.

| Document | Content |
|---|---|
| `spec/README.md` | Purpose, document index, status of each spec topic |
| `spec/sw-architecture.md` | Requirements, architecture, technology choices |
| `game-engine/README.md` | Tiled → WorldPackage → shared Phaser engine integration contract |
| `spec/test-strategy.md` | Test levels, requirement traceability, "not yet implemented" list |
| `spec/backlog/README.md` | How to work on epics and stories (policy), templates for epic files and epic reports |
| `spec/backlog/roadmap.md` | Order of the epics, release points, status and dependencies of each epic |
| `spec/backlog/epics/` | One file per epic: refinement, stories, epic report |
| `spec/mocks/` | Clickable UX mocks (`zappaloo-mocks.html`) and the UX decisions behind them |
| `game-preview/README.md` | The standalone game preview: local world packages, watching, the preview's controls |
| `theme-editor/README.md` | The developer-only theme package editor: how it is started and kept out of production |

## Working with the spec

- **Ask, don't assume.** When the spec leaves something open or is ambiguous, ask before implementing. Never fill a gap with your own assumption. Offer concrete options with a recommendation so the question is quick to answer.
- Once a gap is decided, write the decision into the spec (in the requirement it belongs to, or a "decisions" section), so the spec stays complete.
- Requirements live in tables with IDs (`| ABC-01 | Requirement | Prio |`, prefix of 2–4 capital letters per topic). Never renumber or reuse an ID; add new ones at the end of the topic.
- When implementation shows the spec is wrong or incomplete, point it out and propose a spec change. Don't silently deviate.

## Requirement traceability

- Every requirement is verified by at least one test, and each test names the requirement IDs it verifies:
  - Vitest (unit, component, integration): `it("[ABC-01] does something", ...)`
  - Playwright (end-to-end): `test("[ABC-01][ABC-02] does something", ...)`
- A requirement report (`npm run req-report`, built in step 1a) lists requirement → tests → result. CI fails if an implemented requirement has no passing test. Requirements not implemented yet are listed in `spec/test-strategy.md` ("not yet implemented"); shrink that list as epics are delivered.

## Implementation in epics

- The spec is implemented in epics, each split into stories (6a, 6b, …), as planned in `spec/backlog/`. Epics were called stages and stories steps until 2026-11-17; the numbers are the same, so "stage 6" or "step 6d" in the spec means epic 6 or story 6d.
- **Follow the policy in `spec/backlog/README.md`** (refinement, branch, one story at a time, epic report, pull request). It adds to the rules here and does not replace them; if the two seem to disagree, these rules apply and you point out the contradiction.
- Before starting an epic, refine it and confirm its preconditions, dependencies and stories with the user. **Start only an epic whose status is `ready`** (refined, preconditions met, every epic in "Depends on" done; `spec/backlog/roadmap.md`). Several epics can be in progress in parallel, each on its own branch; work only on the epic of the current branch.
- **The user creates branches and makes all commits. Never commit, and never create or switch branches.**
- **Commit messages feed the release notes** (OPS-19, sw-architecture.md 23.3.1). When suggesting a commit message, write the first line for the people who use the app and start it with `feat:` (or `Add`) for something new or `fix:` (or `Fix`) for a fix; other commits are listed as changes. `chore:`, `docs:`, `test:`, `ci:` and `build:` mark housekeeping that is left out, as is a bare `step 1d`; `step 1f - Backup and restore tools` is listed as "Backup and restore tools".
- Each epic is built on a branch named `feature/epic-<n>-<title>` (`<title>` is the slug of the epic file, e.g. `feature/epic-6-living-world`). Before changing any file for a story, check:
  - `git branch --show-current` matches the current epic (exactly `n`, so `epic-1` does not match `epic-10` and `epic-3` does not match `epic-3.5`);
  - the working tree is clean (the previous story is committed).
  If either check fails, stop and ask the user. Don't fix it yourself.
- **Frontend work follows the UX mocks** in `spec/mocks/`: build a screen from its mock (layout, flow, texts) and read the UX decisions in `spec/mocks/README.md`. If the mock and a requirement disagree, the requirement wins and the mock is fixed in the same story; propose other UX deviations before making them.
- After each story: stop with a short summary (what changed, tests and their results, anything open) and a suggested commit message, so the user can review and commit.
- **When an epic is complete,** write the epic report using the template in `spec/backlog/README.md` into the "Report" section of the epic file, set its status to `done` in its file and in `spec/backlog/roadmap.md`, propose `ready` for the refined epics it unblocks, and show the report in the conversation. It includes:
  - the stories and their status (done / changed / moved / dropped);
  - the remaining requirements grouped by epic, with numbers taken from the requirement report;
  - anything waiting on the user.
- **Then the pull request:** write its title and description from `.github/PULL_REQUEST_TEMPLATE.md` and show them to the user. Open it with `gh pr create` only after the user confirms and has pushed the branch. Never merge.

## Environment

- Development happens in the devcontainer (`.devcontainer/`): Node.js, Playwright browsers (Chromium, WebKit), Mailpit (caught emails, web UI on port 8025), sqlite3. Dev data lives in the `zappaloo-data-dev` volume at `/var/lib/zappaloo`.
- Monorepo with npm workspaces `shared`, `backend`, `frontend`, `game-engine`, `game-preview` and `theme-editor`; tooling scripts in `scripts/` run directly by Node.js (type stripping, imports with `.ts` extension).
- Commands (from the repository root):

| Command | Does |
|---|---|
| `npm run dev:backend` / `npm run dev:frontend` | Backend on port 3000 (restarts on change; migrates `DATA_DIR` on start) / Vite on port 5173, proxying `/api` to the backend |
| `APP_ENV=dev npm run dev:game-preview` | Standalone game preview on port 5175; enter an absolute world-package path in the UI to watch local changes |
| `APP_ENV=dev npm run dev:theme-editor` | Theme package editor on port 5176 (development tool, epic 5.2) |
| `npm run mocks` | UX mocks on `http://localhost:5174/zappaloo-mocks.html` (VS Code task "mocks"; works in the Simple Browser) |
| `npm run build` | Production build of the frontend (`frontend/dist`) |
| `npm run cli -- <command>` | The `zappaloo` CLI from source (`version`, `migrate`, …) |
| `npm run db:generate -w backend` | New Drizzle migration after a change of `backend/src/database/schema.ts` |
| `npm run schemas` | Regenerates the JSON Schemas (`schemas/`, committed) and the format documents (`dist/formats/`) from the format definitions |
| `npm run build:test-world` | Builds the test world package (`dist/zappaloo-world-test.tar.gz`) that the validator and the tests use |
| `npm run migration-check` | Schema has no change without a migration; migrations apply to an empty database and to the latest release's schema; released migrations unchanged |
| `npm run build:image` | Local image build (`ghcr.io/gravity981/zappaloo:local`, version `<last release>+local.<commit>`) plus smoke test |
| `npm run test:deploy` | Deployment test: the bundle in `infrastructure/deploy/` with the image (default `:local`, or `ZAPPALOO_TEST_IMAGE`) in Docker; results in `reports/vitest-deploy.json`. Runs on CI only: it does not work in the devcontainer under WSL, so never run it here; the local `npm run req-report` then reads old results and shows their errors |
| `npm run lint` | ESLint (type-checked rules), no warnings allowed |
| `npm run format` / `npm run format:check` | Prettier (Markdown is excluded) |
| `npm run typecheck` | `tsc` for the root (scripts, e2e, configs) and every workspace |
| `npm test` | Vitest, all workspaces; JSON results in `reports/vitest.json` |
| `npm run test:e2e` | Playwright (desktop/mobile, Chromium/WebKit) against the backend serving a test build of the frontend (port 4173, data in `.e2e-data/`); JSON results in `reports/playwright.json`. Tests marked `@flaky` are left out locally; CI (and `CI=1`) runs all |
| `npm run test:e2e:flaky` | Only the tests whose title ends with `@flaky`, with two retries; results in `reports/playwright-flaky.json`. The known flaky tests are tracked in `spec/test-strategy.md` 8.8 |
| `npm run req-report` | Requirement report from the spec and both JSON results; full report as a page with a collapsible result tree in `reports/requirements.html` (CI: artifact `requirement-report`, with a short summary on the run page); non-zero exit on errors |
| `npm run check` | All of the above in CI order |

- Run the tests before the requirement report; it reads their JSON results.

## Testing efficiency

Minimize test execution time while keeping sufficient confidence. The full policy is `spec/test-strategy.md`, section 8; these rules bind you:

- **Never run the entire suite after every change** (`npm test`, `npm run test:e2e`, `npm run check`). Prefer targeted tests for the modified functionality. Never rerun tests that passed unless relevant source, test code, dependencies or configuration changed, and do not run tests only to reconfirm a known result. Batch related changes before running tests. Do not run identical tests concurrently in several agents.
- **Before running tests:** inspect `git diff`, name the modified files and affected components, pick the smallest meaningful subset, and use the filtering the tools offer: `npx vitest run <path>` (from the repository root), `npx playwright test e2e/<file> --project=<project> -g "<title or ID>"` (the requirement IDs are in the titles).
- **Order:** targeted unit tests, then relevant integration tests, then lint and type checking as appropriate, then broader regression only when the scope or risk justifies it.
- **When a test fails:** analyze the failure first, decide whether the current changes caused it, fix the cause, and rerun only the failed test and the tests the fix affects, not the unrelated passing ones.
- **Run the full suite only** when the user asks, when shared infrastructure or cross-cutting functionality changed, when dependencies or configuration with broad impact changed, when targeted tests cannot give enough confidence, or for a release or CI validation. The requirement report needs a complete Vitest and Playwright run, so `npm run req-report` falls under this rule: run it at the end of an epic, not after every story.
- **Flaky e2e tests** (`spec/test-strategy.md` 8.8): when a test fails in a full run, re-run it alone first. A test that passes alone and fails under load gets `@flaky` at the end of its title and a row in the table of 8.8 (a test checks that the two match). Locally the flaky tests run apart (`npm run test:e2e:flaky`); CI runs every e2e test. Remove the tag and the row when the cause is fixed.
- **Multiple agents:** avoid duplicate runs, reuse another agent's results only for the exact same code state, name one agent for the final verification, and never assume a result stays valid after relevant source changes.
- **Completion report** (also the summary after each step): the tests executed, passed and failed, the tests skipped and why, and the remaining verification risks. Never claim that unexecuted tests passed.

## Long-running command execution

- Prefer foreground execution for commands whose live output is useful for monitoring progress.
- Use Shell mode (`!`) when the user wants to observe continuous command output directly.
- Do not use Monitor as a substitute for a continuously visible terminal session.
- Use background execution only when the agent needs to continue other work while the command runs.
- For long-running tests, builds and migrations, preserve meaningful progress output.
- Avoid unnecessarily capturing or forwarding verbose output into the LLM context.

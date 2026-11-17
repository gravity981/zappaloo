# Epic 1 – Walking Skeleton and Deployment

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Release 1 | – | `feature/stage-1-walking-skeleton` (PR #1, #2) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- Decide the backend framework and the database access library. *Decided 2026-11-04: Fastify, and Drizzle ORM on SQLite (sw-architecture.md 15.1).*
- LAN server (x86-64) with Docker for staging. *Needed from step 1d.*
- *Hosting is out of scope (2026-11-04, sw-architecture.md 21): the operator provides the hosts, the domain and the off-site backup storage. Stage 1 needs only a host for staging.*
- CI/CD adapted from the project owner's definitions (2026-11-04): version scheme, release candidates and promotion, GHCR, `deploy.sh` with rollback, staging on the LAN (sw-architecture.md 23, OPS-08–16).

## Stories

### Story 1a – Monorepo and tooling

Npm workspaces `frontend`, `backend`, `shared`; TypeScript, ESLint, Prettier, Vitest and Playwright configured; the requirement report (`npm run req-report`) reads the spec, the "not yet implemented" list and the test results.
Requirements: none (foundation for all later steps).

### Story 1b – Backend and frontend skeleton

Backend with a health endpoint and schema validation of all inputs; SQLite with versioned migrations; React app with routing and the i18n framework; Phaser mounted with an empty scene; `robots.txt` and `X-Robots-Tag: noindex`; CLI with `version` and `migrate`.
Requirements: DATA-01, DATA-04, LANG-01, SEC-03, SEC-10, OPS-17.

### Story 1c – Continuous integration and versioned images

`ci.yml` on every pull request and push to `main`: lint and format check, type checks, tests, end-to-end tests, requirement report, migration check; version determination; application image (Dockerfile) built with version and commit, smoke-tested via `GET /api/version`, pushed to GHCR from `main`; `cleanup-images.yml`; local `build-image.sh`. The project owner enables branch protection on `main` (sw-architecture.md 23.1, 23.2).
Requirements: OPS-06, OPS-08, OPS-14.

### Story 1d – Containers and staging

Compose file with the application and Caddy; persistent volumes; `deploy.sh` (pull, secrets, prod pre-deploy backup, version-checked health check) and the deployment bundle; CLI `backup` and `restore`; `deploy.sh --restore` for rollbacks, verified by the deployment test; first deployment of a `main` image to staging on the LAN, with an empty database and HTTPS from Caddy's local CA (sw-architecture.md 23.4–23.8).
Requirements: OPS-01, OPS-04, OPS-15, OPS-16, OPS-18.

### Story 1e – Releases

`release-candidate.yml` and `promote.yml` with unit-tested release rules; tag ruleset for `v*` against moving and deleting (set up by the project owner; enforced only once the repository is public, see the open points in README.md); SSE heartbeat endpoint, checked through Caddy by the deployment test; only Caddy's ports published, checked by the deployment test; staging next to prod on other ports with the HTTP→HTTPS redirect keeping the port; first release candidate built and deployed to staging (sw-architecture.md 17.1, 21.2, 21.3, 23.3).
Requirements: OPS-03, OPS-10, OPS-11, OPS-12, OPS-19 (added 2026-11-10: release notes with changelog and install/update commands, deployment bundle as one archive).

### Story 1f – Backup and restore tools

Full backup of an environment (database and files in the data volume) and its scripted restore; staging deploys restore a prod backup provided by the operator, with mail caught and the volume deleted after verification; runbook listing everything to back up. Scheduling and off-site storage are the operator's (sw-architecture.md 22.2).
Requirements: OPS-05, OPS-13.

## Report

### Status report (2026-11-10)

**Summary:** There are no guest features yet. The project now builds, tests and releases itself: a backend with health, version and live-update endpoints, a React app with an empty Phaser scene, versioned images, staging and prod deployment with rollback, release candidates and backup/restore tools.

**Steps:** 1a Monorepo and tooling – done. 1b Backend and frontend skeleton – done. 1c Continuous integration and versioned images – done. 1d Containers and staging – done. 1e Releases – done. 1f Backup and restore tools – done (full backup as one `.tar.gz`, staging restore from `backups/`, `--teardown`).

**Requirements:** 19 of 21 planned for this stage, all with passing tests (requirement report). Overall: 19 of 200 active requirements. The other two (OPS-12, OPS-13) have passing automated tests, but stay on the "not yet implemented" list until their manual checks are done (test-strategy.md 6.1). OPS-05 is done: its restore drill is recorded in the manual test protocol (2026-11-10, LAN staging).

**Tests:** 131 Vitest results (unit, integration and the 15-test deployment test against the real image in Docker), all passing; 20 Playwright results as of the last end-to-end run (not repeated in step 1f). Manual checks: the full backup and restore on LAN staging (OPS-05); the tag ruleset and the staging drill with a prod backup are open (see below).

**Spec changes and deviations:** Hosting is out of scope and step 1g was dropped (2026-11-04). Steps 1d–1f were reordered and OPS-08–18 added with the CI/CD definitions. In step 1f the full backup became one `.tar.gz` made and restored with `zappaloo backup --full` / `restore --full`, staging restores the newest `backups/*.tar.gz` (refused unless mail is caught) and `deploy.sh staging --teardown` deletes the staging data (sw-architecture.md 22.2, 23.5, 23.8). No deviation from the spec.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | next |
| 3 | RSVP and waiting page | open |
| 4 | Content and website | open |
| 5 | Game world and map importer | open |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage:** stage 1 → 2 (OPS-12, OPS-13: manual checks); 2 → 48; 3 → 17; 4 → 14; 5 → 31; 6 → 14; 7 → 28; 8 → 22; 9 → 1; 10 → 4. In total 181 of 200 active.

**Waiting on the project owner:**
- The staging drill on the LAN server: restore a prod backup, mail caught, volume deleted afterwards (OPS-13).
- Tag ruleset for `v*` in the GitHub repository settings (OPS-12; enforced only once the repository is public).
- First real release candidate built and promoted (OPS-10, OPS-11), and enabling branch protection as in the plan for 1c.
- Confirm the preconditions and steps of stage 2 before it starts.

**Risks and notes:** Let's Encrypt on the production host (OPS-02) is checked only at the Release 1 go-live. Backups hold personal data and must be deleted at shutdown (SEC-08). The off-site backup storage and its schedule are the operator's.

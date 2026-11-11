# Zappaloo – Test Strategy

This document defines how the requirements in [sw-architecture.md](sw-architecture.md) are verified: the test levels, the tooling, the traceability rules, and which requirements are not implemented yet.

## 1. Principles

- Every requirement is verified by at least one test, and every test names the requirement IDs it verifies.
- Tests run at the lowest level that can really verify a requirement. Logic is covered by unit tests, cross-module behaviour by integration tests, and user-visible flows by end-to-end tests.
- Security-relevant rules (permissions, invitation redemption, result validation, upload checks) are always tested on the server. A frontend-only test never counts as verification for them.
- Tests are deterministic. Time, randomness and network are controlled (fake timers, seeded tokens, local servers).

## 2. Test levels and tooling

| Level | Tool | Scope | Runs in |
|---|---|---|---|
| Unit | Vitest | Pure logic in `backend`, `shared`, `frontend` (e.g. access-condition evaluation, role combination rules, result plausibility checks, config schema validation) | CI, every push |
| Component | Vitest + React Testing Library (jsdom) | React UI components and pages in isolation | CI, every push |
| Integration | Vitest | Backend modules against a real SQLite database (temporary file per test run), and the HTTP API through the real server | CI, every push |
| End-to-end | Playwright | Full stack in the browser: website flows, game world, contributions. Desktop and mobile viewports (Chromium, WebKit) | CI, every push |
| Deployment smoke | Playwright / shell scripts | Docker Compose stack started in CI: reverse proxy, live update connections, persistence across container restart | CI, every push (local TLS); production checks per release |
| Load | open (see section 6) | Concurrent players and uploads against the production host | Before each production event |
| Manual | Written test protocol | Real-device checks (iOS/Android camera), backup restore drill, production firewall/TLS | Before each production event |

### Game world tests

Phaser rendering isn't asserted pixel by pixel. Game logic (map object interpretation, portal resolution, collision setup, scene lifecycle) is kept in plain TypeScript modules and unit-tested. End-to-end tests drive the game through a small test hook that exposes the game state (current map, player position, open dialogue) to Playwright. The hook is enabled only in test builds.

## 3. Requirement traceability

### Tagging tests

The test title starts with the requirement ID(s) in square brackets:

```ts
// Vitest (unit / component / integration)
it("[INV-03] rejects a second redemption of the same code", async () => { … });

// Playwright (end-to-end)
test("[PHO-01][PHO-02] QR link preselects the album and uploads a photo", async ({ page }) => { … });
```

- One test can verify several requirements: `[ABC-01][ABC-02]`.
- The ID must exist in `sw-architecture.md`. The requirement report flags unknown IDs as errors.

### Requirement report

A requirement report script, `npm run req-report`, is built in the first stage. It:

1. Reads all requirement IDs and priorities from the tables in `spec/sw-architecture.md`.
2. Reads the "not yet implemented" list in section 5 of this document.
3. Reads the JSON results of Vitest and Playwright.
4. Prints requirement → tests → result. It also lists requirements without tests and tests that reference unknown IDs.
5. Exits non-zero if any implemented requirement (one not on the "not yet implemented" list) has no passing test, or if a test references an unknown ID.

CI runs the report after the test jobs and fails the build on a non-zero exit.

## 4. Test areas per topic

| Topic | Main level(s) | Notes |
|---|---|---|
| GAME | Unit, E2E | Guided first sign-in, button bar with RSVP badge, landing in the game after sign-in, one click to the website, direct links bypassing the game. Object type interpretation, movement and collision logic, tap-to-move pathfinding as unit tests. Keyboard and tap control, portals and interaction via E2E with the test hook. |
| PRES | Unit, Integration, E2E | Only guests with an accepted RSVP appear; figures only on maps of their event parts and only inside wander areas (seeded random); own figure replaced by own avatar; speech bubble opening automatically for the nearest figure, closing on walking away, staying open when clicked; profile data shown without moderation and removable by the admin; relation list defined by the admin, chosen option shown as a badge; tablemates in the table finder; accompanying persons with VIP-chosen avatar; default seat at the VIP's table and admin override; hiding. Table finder visibility date with fake timers. |
| HUNT | Integration, E2E | Collecting once, guessed or invalid tokens rejected, rate limit, time window with fake timers, ranking order, unlocking as an access condition. |
| MG | Unit, Integration, E2E | Plausibility profiles as unit tests. Attempt IDs, API validation and storage as integration tests. Scene start/return as E2E. |
| SCR | E2E | Panel rotation, an approved snapshot (with caption) appearing on the wall within the configured time, unapproved content and keepsakes never shown, the read-only link granting nothing else, revocation, live leaderboard. |
| RSVP | Integration, E2E | Event parts per invitation; accompanying-person requests with RSVP filled in by the VIP (avatar later, PRES-07), editing and withdrawing while pending, editing after approval without a new approval; admin changes after the deadline, admin approval, no login possible, deletion together with the VIP; allergy data visible only to admins (SEC-11); deadline, overview totals, CSV export, reminder email via the test mail sink. |
| WEB | Component, E2E | E2E on desktop and mobile viewports. WEB-01 with the game bundle blocked. "Now / next" with fake timers across entry boundaries and the event timezone; schedule change visible immediately; "Go there". |
| CNT, LANG | Unit, Integration, E2E | The same content item appears on the website page and in a game-world dialogue. Markdown editing and preview via E2E. Language keys in the content model, and no hard-coded UI strings (lint check). |
| ACC, AVA | Integration, Component, E2E | SMTP is replaced by a local test mail sink. Covers verified and unverified paths, and the admin reset link. |
| ROLE, ACS, GRP | Unit, Integration, E2E | Full combination matrix of the three roles as table-driven tests. Server enforcement tested per endpoint and per map load. Every page and endpoint without sign-in is rejected, except the allowed list (ACS-09). Closed platform: guests reach only the waiting page and the RSVP, staff and admins everything; waiting-page text per RSVP status with placeholders filled, admin-edited texts, countdown only with the switch on and hidden at zero (fake timers), "door is open" email to verified addresses only via the test mail sink; opening switch and closing again (ACS-10–14). |
| INV | Integration, E2E | Includes a concurrency test for atomic redemption (INV-08) and the printable export at creation time (INV-14).  |
| PHO, MOD | Integration, E2E, Manual | Uploads closed by default, opened and closed separately by the admin, upload links show a notice while closed (PHO-18). Composer with "Upload snapshot" (disabled without a photo) and "Upload keepsake" (photo, photo + text, text only); text length limits; keepsake page; printable keepsake book PDF including photos. Fixture images in JPEG, PNG and HEIC, plus oversized and invalid files. Worker queue processed in tests. Anonymous upload via upload link: revoked or expired token rejected, token grants nothing else. Swipe moderation via Playwright touch emulation and arrow keys, undo, rejected list. Real-device camera check is manual. |
| MAP | Unit, Integration, E2E | Test maps exported from Tiled live in test fixtures, including invalid ones. Import validation, warnings for missing portal targets, portal properties from Tiled, `eventPart` and wander areas, rollback, new version used on next map entry with refreshed graphics. |
| DATA | Integration | Migrations run from an empty DB and from the previous schema version with data. The activity card (DATA-05): listed actions appear newest first, limited to 5, names resolved, excluded actions (login, role changes) never appear, deleted guests show no name, admin role required. |
| CFG | Unit, Integration | Setup validation (time zone, language, empty name) as unit tests. Setup from an empty database, later edits of name, time zone and language, `event seed-example` and its refusal on a set-up installation as integration tests; the setup form and the "not set up yet" page as E2E. Feature toggles and runtime settings changes checked in UI and API. |
| OPS | Deployment smoke, Unit, Manual | Deployment test (`npm run test:deploy`, in CI after the image build): the real bundle (`compose.yaml`, `deploy.sh`) with the real image in Docker – staging without backup, HTTPS through Caddy with its local CA, data kept across redeployments and restarts, prod release-tag rule, pre-deploy backup, failed deployment and rollback with `--restore`, Server-Sent Events through Caddy without buffering (OPS-01, OPS-02, OPS-04, OPS-15, OPS-16); staging restored from the latest full backup in `backups/` (database and files replaced, no restore without caught mail, `--no-restore`) and torn down with `--teardown` (OPS-05, OPS-13); full backup and restore as CLI tests (unit-level, with refusals and invalid archives, OPS-05); only Caddy's ports (and Mailpit's on staging) published, HTTP→HTTPS redirect keeping a non-standard port (OPS-03, OPS-01). Release rules (candidate numbering, only the latest candidate, no reused tags) as unit tests, and the release notes (changelog sorted from commit messages, install and update commands) and the deployment bundle as unit tests against a temporary git repository (OPS-19), and the structure of the release workflows (OPS-10, OPS-11, OPS-12). Image smoke test of `GET /api/version` (OPS-08); version determination and release-workflow checks (SemVer, candidate numbering, "only the latest candidate") as unit-tested scripts (OPS-08, OPS-10, OPS-11). See 6.1 for the manual part. |
| SEC | Unit, Integration, E2E | CSRF, rate limits and schema validation per endpoint group. Markdown sanitising, noindex headers and `robots.txt`, privacy notice without sign-in. Shutdown flow with fake timers: notice email, export, deletion. |
| PERF | Load | See open decision 6.2. |

## 5. Not yet implemented

All active requirements are listed here until their stage is delivered. Shrink this list as stages are completed. The requirement report treats every ID listed here as "not yet implemented" and does not require a passing test for it. Withdrawn requirements (ACC-02, ACS-01 – ACS-03, ACS-08, GB-01 – GB-04, INV-13, INV-15 – INV-19, MAP-07, MAP-11, MP-01 – MP-06, OPS-07, OPS-09, PERF-02, PHO-04, PRES-03, PRES-11, ROLE-02, ROLE-10, SCR-03, SCR-06) are not listed, and the report ignores them.

| Prefix | IDs | Count |
|---|---|---|
| GAME | GAME-01 – GAME-18 | 18 |
| PRES | PRES-01, PRES-02, PRES-04 – PRES-10, PRES-12 – PRES-15 | 13 |
| HUNT | HUNT-01 – HUNT-07 | 7 |
| MG | MG-01 – MG-13 | 13 |
| WEB | WEB-01 – WEB-09 | 9 |
| LANG | LANG-02 | 1 |
| SCR | SCR-01, SCR-02, SCR-04, SCR-05, SCR-07 | 5 |
| CNT | CNT-01 – CNT-05 | 5 |
| AVA | AVA-01 – AVA-04 | 4 |
| ACS | ACS-04 | 1 |
| PHO | PHO-01 – PHO-03, PHO-05 – PHO-19 | 18 |
| MOD | MOD-01 – MOD-05 | 5 |
| MAP | MAP-01 – MAP-06, MAP-08 – MAP-10, MAP-12 – MAP-15 | 13 |
| CFG | CFG-01, CFG-04 | 2 |
| OPS | OPS-02, OPS-12, OPS-13 | 3 |
| SEC | SEC-04 – SEC-08 | 5 |
| PERF | PERF-01, PERF-03, PERF-04 | 3 |
| PWA | PWA-01 – PWA-05 | 5 |
| LIC | LIC-01 – LIC-03 | 3 |
| **Total** | | **133** |

The stage each requirement belongs to is listed in `sw-architecture.md`, section 28.

**Partially implemented** (decided 2026-11-10). These requirements count as implemented from stage 2 on, because their mechanism exists and is tested, but parts of them belong to features of later stages. Each part is a "Follow-up from stage 2" line of the step that builds the feature in `implementation-plan.md`, and that step adds tests tagged with the ID:

- ACS-05: the treasure-hunt condition (step 8d); the admin page for manual releases, with the first step that stores access conditions (4a or 5b).
- ACS-07: server checks for map loading and protected game areas (5b), contribution upload (7b), moderation (7c), minigame start and result submission (8b).
- ROLE-06: the capabilities in use: `editWebsiteContent` (4a), `moderateContributions` (7c). Until then only test routes use them.
- ROLE-07: every step that adds an administration function guards it with the admin role and adds a `[ROLE-07]` test that a user without it is refused. The admin pages of stage 2 are built in step 2h; each later admin page adds its own `[ROLE-07]` test.

## 6. Verification beyond CI, and open decisions

### 6.1 Verifying requirements that can't be fully automated in CI (decided)

These requirements need a production environment, real devices or real time to verify completely:

- OPS-02 (Let's Encrypt and live updates on the production host, at the Release 1 go-live), OPS-05 (restore drill with a real full backup)
- OPS-12 (tag ruleset in the GitHub repository settings), OPS-10 and OPS-11 (first real release candidate and promotion), OPS-13 (staging on the LAN restored from the off-site backup, mail caught, volume deleted afterwards), OPS-14 (image cleanup run), OPS-15 and OPS-16 (deployment to prod and a rollback drill with `deploy.sh`)
- PHO-03 (camera capture on real iOS and Android devices)
- PWA-03, PWA-04 (add to home screen on real iOS and Android devices: icon, name, no browser bars, safe areas, sign-in after install; step 3.5e)
- PERF-01 (load test on the production host)

Decision:

- Everything that can run in CI is automated with Playwright and tagged with the requirement ID: local Compose stack, WebKit/Chromium mobile emulation including touch and swipe, scripted backup and restore against a temporary volume.
- The remaining real-environment checks are manual tests, recorded in a manual test protocol (`spec/manual-test-protocol.md`) that the requirement report reads as an extra result source. Each record has requirement ID, date, environment and result. For each requirement only its latest record counts, so a passed re-check replaces an earlier failure; the older rows stay as history.

### 6.2 Load test tool (PERF-01) — open

Options:

1. **(Recommended)** k6: HTTP load for website, game asset loading and API, plus a scenario for a burst of photo uploads.
2. Artillery.

## 7. Release checklist (before each production event)

Organisational items that are not software requirements:

- Privacy policy written and legal requirements reviewed (sw-architecture.md, section 24).
- Load test executed on the production host and result recorded (PERF-01).
- Backup restore drill done (OPS-05).
- Photo upload checked on at least one current iOS device and one current Android device (PHO-03).
- Emails (verification, password reset, shutdown notice) arrive through the production SMTP account and aren't marked as spam (sender domain SPF/DKIM set up).
- Printed invitation QR codes tested against production: redemption works and the account becomes VIP.
- Venue QR codes printed and checked against the production URLs.
- Treasure hunt codes printed, each scanned once on production, and the test finds reset.
- Event screen tested on the venue projector, with the screen link created and revoked after the event.
- Before shutdown: shutdown date set, notice sent, export taken and handed to the hosts.

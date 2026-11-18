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
| Unit | Vitest | Pure logic in `backend`, `shared`, `game-engine`, `game-preview`, `theme-editor`, `frontend` (e.g. access-condition evaluation, role combination rules, result plausibility checks, config schema validation) | CI, every push |
| Component | Vitest + React Testing Library (jsdom) | React UI components and pages in isolation | CI, every push |
| Integration | Vitest | Backend modules against a real SQLite database (temporary file per test run), and the HTTP API through the real server | CI, every push |
| End-to-end | Playwright | Full stack in the browser: website flows, game world, standalone game preview, contributions. Desktop and mobile viewports (Chromium, WebKit) | CI, every push |
| Deployment smoke | Playwright / shell scripts | Docker Compose stack started in CI: reverse proxy, live update connections, persistence across container restart | CI, every push (local TLS); production checks per release |
| Load | open (see section 6) | Concurrent players and uploads against the production host | Before each production event |
| Manual | Written test protocol | Real-device checks (iOS/Android camera), backup restore drill, production firewall/TLS | Before each production event |

### Game world tests

The renderer's Tiled-compatible geometry is verified with independent expected-value unit tests for map positions, tile-object anchors, tileset crops and map bounds. Package validation rejects unsupported authoring features. Zappaloo does not install or invoke the Tiled executable, export world sources, or run rasterizer comparisons; the asset-producing repository validates its generated packages with `zappaloo validate`. Collision, map interpretation, portals, pathfinding, depth logic and scene lifecycle are unit-tested. The foot anchor and collision-ellipse placement have explicit geometry tests. End-to-end tests drive the application and standalone preview through a test hook that exposes the game state to Playwright; the hook is enabled only in test builds.

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

The full report is one self-contained HTML page, `reports/requirements.html` (decided 2026-11-18): a result tree (epic → requirement → tests) in which every node starts collapsed, with "Expand all" and "Collapse all", and the errors and warnings in nodes of their own. CI uploads it as the artifact `requirement-report`. The page of a GitHub Actions run cannot show the HTML page, so the run gets a short Markdown summary instead (result, progress per epic, the first problems) that says the full report is in the artifact.

## 4. Test areas per topic

| Topic | Main level(s) | Notes |
|---|---|---|
| GAME | Unit, E2E | Guided first sign-in, button bar with RSVP badge, landing in the game after sign-in, one click to the website, direct links bypassing the game. Object type interpretation, foot-anchored collision and movement logic, tap-to-move pathfinding as unit tests. Keyboard and tap control, portals and interaction via E2E with the test hook. Fixtures cover sheet and collection ground layers, natural-size bottom-aligned tile objects, collision/trigger guides, hidden gameplay layers, actors in front of and behind props, and foreground coverage. Unsupported non-zero offsets, other alignments and scaled tile objects are rejected by the validator. |
| PRES | Unit, Integration, E2E | Only guests with an accepted RSVP appear; each figure on one map per guest, kept for that guest, and only inside wander areas (seeded random); own figure replaced by own avatar; speech bubble opening automatically for the nearest figure, closing on walking away, staying open when clicked; profile data shown without moderation and removable by the admin; relation list defined by the admin, chosen option shown as a badge; tablemates in the table finder; accompanying persons with VIP-chosen avatar; default seat at the VIP's table and admin override; hiding. Table finder visibility date with fake timers. |
| HUNT | Integration, E2E | Collecting once, guessed or invalid tokens rejected, rate limit, time window with fake timers, ranking order, unlocking as an access condition. |
| MG | Unit, Integration, E2E | Plausibility profiles as unit tests. Attempt IDs, API validation and storage as integration tests. Scene start/return as E2E. |
| SCR | E2E | Panel rotation, an approved snapshot (with caption) appearing on the wall within the configured time, unapproved content and keepsakes never shown, the read-only link granting nothing else, revocation, live leaderboard. |
| RSVP | Integration, E2E | Program items per invitation; accompanying-person requests with RSVP filled in by the VIP (avatar later, PRES-07), editing and withdrawing while pending, editing after approval without a new approval; approval switched off (added persons count at once, pending ones approved); one answer for all program items and per program item, mixed answers after switching; person types and the optional menu of a child, totals by type; admin changes after the deadline, admin approval, no login possible, deletion together with the VIP; allergy data visible only to admins (SEC-11); deadline, overview totals, CSV export, reminder email via the test mail sink. |
| WEB | Component, E2E | Navigation with only the entries that exist. Start page and "Mehr" on an installation without pages. Start page layout before and on the event day; hero image uncropped with its alt text, and the welcome text moving up without one; countdown with fake timers across midnight in the event timezone ("Noch 1 Tag", gone on the event day), without program items and with the switch off; shortcuts limited to "Programm" and three visible pages. E2E on desktop and mobile viewports. WEB-01 with the game bundle blocked. "Now / next" with fake timers across entry boundaries and the event timezone; schedule change visible immediately. |
| CNT, LANG | Unit, Integration, E2E | Pages created, ordered, hidden and deleted; a fresh installation without pages; editing only with the admin role or `editWebsiteContent`. Image upload with fixture files in JPEG, PNG and WebP, a wrong type behind a right name, an oversized file, no access without sign-in. Places referenced by program items and pages, the migration of place texts, the Google Maps link check, no request to another site from a page (CNT-06, CNT-07). The same content item appears on the website page and in a game-world dialogue. Markdown editing and preview via E2E. Language keys in the content model, and no hard-coded UI strings (lint check). |
| ACC, AVA | Integration, Component, E2E | SMTP is replaced by a local test mail sink. Covers verified and unverified paths, and the admin reset link. |
| ROLE, ACS, GRP | Unit, Integration, E2E | Full combination matrix of the three roles as table-driven tests. Server enforcement tested per endpoint and per map load. Every page and endpoint without sign-in is rejected, except the allowed list (ACS-09). Closed platform: guests reach only the waiting page and the RSVP, staff and admins everything; waiting-page text per RSVP status with placeholders filled, admin-edited texts, countdown only with the switch on and hidden at zero (fake timers), "door is open" email to verified addresses only via the test mail sink; opening switch and closing again (ACS-10–14). |
| INV | Integration, E2E | Includes a concurrency test for atomic redemption (INV-08) and the printable export at creation time (INV-14). From stage 3.9: the inactive account created with each invitation, activation by registration, merge into a signed-in account without `vip`, revoking the last open invitation of a never-activated account, cleanup of revoked and replaced invitations, and the migration of v1.0.2 data. |
| PHO, MOD | Integration, E2E, Manual | Uploads closed by default, opened and closed separately by the admin, upload links show a notice while closed (PHO-18). Composer with "Upload snapshot" (disabled without a photo) and "Upload keepsake" (photo, photo + text, text only); text length limits; keepsake page; printable keepsake book PDF including photos. Fixture images in JPEG, PNG and HEIC, plus oversized and invalid files. Worker queue processed in tests. Anonymous upload via upload link: revoked or expired token rejected, token grants nothing else. Swipe moderation via Playwright touch emulation and arrow keys, undo, rejected list. Real-device camera check is manual. |
| MAP | Unit, Integration, E2E | World packages as test fixtures built by a script, including broken ones: every validator rule, the unchanged world after a refused import, rollback to the previous package, the door scene and the avatar editor assets from the package (MAP-16). Zappaloo CI tests the validator and preview behavior, not world export; the asset-producing repository validates its generated package with `zappaloo validate` (MAP-17). The local package preview watches the selected archive, reloads valid replacements and retains the last valid snapshot on read or validation errors. Import validation accepts image-local `occlusion` polylines and rejects malformed guides, non-zero tileset offsets, non-bottom tile-object alignment and scaling. Dynamic actor depth is verified against guide lines (GAME-19). Preview package workflows (MAP-18), missing portal targets and warnings for presets that point to a missing page, content item or minigame (MAP-08), portal properties from Tiled, wander areas, rollback, and refreshed graphics are also tested. |
| DATA | Integration | Migrations run from an empty DB and from the previous schema version with data. The activity card (DATA-05): listed actions appear newest first, limited to 5, names resolved, excluded actions (login, role changes) never appear, deleted guests show no name, admin role required. |
| CFG | Unit, Integration | CFG-01: two fresh installations of the same build shaped differently through the admin API alone (name, theme package, pages, program items), each serving its own; a check that the source holds no event-specific names outside the example event and the tests. CFG-04: two installations with their own data folders share nothing, every event-related record carries `event1`, no second event can be created. Setup validation (time zone, language, empty name) as unit tests. Setup from an empty database, later edits of name, time zone and language, `event seed-example` and its refusal on a set-up installation as integration tests; the setup form and the "not set up yet" page as E2E. Feature toggles and runtime settings changes checked in UI and API. |
| THM | Unit, Integration, E2E | Theme packages built by a script in the tests. One broken package per validator rule (archive size, links and `..`, unknown files and fields, format version, icon sizes, font type and count, unreferenced and missing fonts, colour format, contrast). The active theme unchanged after a refused import. Import, themed pages without sign-in, fonts and icons served, manifest colours, return to the default, audit entries. The countdown in the `display` font, and in the heading font without one. The committed JSON Schemas equal the ones generated from the platform's schemas (theme and world), and the example theme and the test world pass them; `zappaloo validate` with a valid, a refused and a warned package, its exit codes and `--json` (THM-07, MAP-17). |
| OPS | Deployment smoke, Unit, Manual | Deployment test (`npm run test:deploy`, in CI after the image build): the real bundle (`compose.yaml`, `deploy.sh`) with the real image in Docker – staging without backup, HTTPS through Caddy with its local CA, data kept across redeployments and restarts, prod release-tag rule, pre-deploy backup, failed deployment and rollback with `--restore`, Server-Sent Events through Caddy without buffering (OPS-01, OPS-02, OPS-04, OPS-15, OPS-16); staging restored from the latest full backup in `backups/` (database and files replaced, no restore without caught mail, `--no-restore`) and torn down with `--teardown` (OPS-05, OPS-13); full backup and restore as CLI tests (unit-level, with refusals and invalid archives, OPS-05); only Caddy's ports (and Mailpit's on staging) published, HTTP→HTTPS redirect keeping a non-standard port (OPS-03, OPS-01). Release rules (candidate numbering, only the latest candidate, no reused tags) as unit tests, and the release notes (changelog sorted from commit messages, install and update commands) and the deployment bundle as unit tests against a temporary git repository (OPS-19), and the structure of the release workflows (OPS-10, OPS-11, OPS-12). Image smoke test of `GET /api/version` (OPS-08); version determination and release-workflow checks (SemVer, candidate numbering, "only the latest candidate") as unit-tested scripts (OPS-08, OPS-10, OPS-11). See 6.1 for the manual part. |
| SEC | Unit, Integration, E2E | CSRF, rate limits and schema validation per endpoint group. Markdown sanitising, noindex headers and `robots.txt`, privacy notice without sign-in. Shutdown flow with fake timers: notice email, export, deletion. |
| PERF | Load | See open decision 6.2. |

## 5. Not yet implemented

All active requirements are listed here until their stage is delivered. Shrink this list as stages are completed. The requirement report treats every ID listed here as "not yet implemented" and does not require a passing test for it. Withdrawn requirements (ACC-02, ACS-01 – ACS-03, ACS-08, GB-01 – GB-04, INV-13, INV-15 – INV-19, MAP-07, MAP-11, MP-01 – MP-06, OPS-07, OPS-09, PERF-02, PHO-04, PRES-03, PRES-11, ROLE-02, ROLE-10, SCR-03, SCR-06, WEB-08) are not listed, and the report ignores them.

| Prefix | IDs | Count |
|---|---|---|
| GAME | GAME-31 – GAME-41 | 11 |
| MAP | MAP-20, MAP-21 | 2 |
| PRES | PRES-01, PRES-02, PRES-04 – PRES-06, PRES-08 – PRES-10, PRES-12 – PRES-15 | 12 |
| HUNT | HUNT-01 – HUNT-07 | 7 |
| MG | MG-01 – MG-13 | 13 |
| WEB | WEB-05, WEB-06 | 2 |
| RSVP | RSVP-21 – RSVP-24 | 4 |
| LANG | LANG-03 | 1 |
| ROLE | ROLE-11 | 1 |
| SCR | SCR-01, SCR-02, SCR-04, SCR-05, SCR-07 | 5 |
| CNT | CNT-02, CNT-03, CNT-08 | 3 |
| ACS | ACS-04 | 1 |
| PHO | PHO-01 – PHO-03, PHO-05 – PHO-19 | 18 |
| MOD | MOD-01 – MOD-05 | 5 |
| OPS | OPS-13 | 1 |
| SEC | SEC-04, SEC-06 – SEC-08 | 4 |
| PERF | PERF-01, PERF-03, PERF-04 | 3 |
| **Total** | | **95** |

The stage each requirement belongs to is listed in `sw-architecture.md`, section 28.

**Partially implemented** (decided 2026-11-10). These requirements count as implemented from stage 2 on, because their mechanism exists and is tested, but parts of them belong to features of later stages. Each part is a "Follow-up from stage 2" line of the story that builds the feature in its epic file (`backlog/epics/`), and that step adds tests tagged with the ID:

- ACS-05: the treasure-hunt condition (step 8d); the admin page for manual releases, with the step that stores access conditions (step 8d, HUNT-05; pages carry none in stage 4, decided 2026-11-13).
- ACS-07: server checks for protected game areas (step 8d; stage 5 checks only sign-in, the open platform and guest access, decided 2026-11-17), contribution upload (7b), moderation (7c), minigame start and result submission (8b).
- PRES-07 (tagged in `frontend/src/avatar/avatar.test.tsx`): the accompanying persons' figures, chosen by the VIP in the avatar editor, are done in step 5h; their seats and the table finder come with their own steps.
- AVA-04: the player's own figure in the game is done in step 5h; the wandering figures of the other guests come with stage 6.
- GAME-06 and MAP-15 (from step 5f on, decided 2026-11-17): the action `minigame` (stage 8; a preset `minigame` is reported at import and does nothing, and the admin cannot assign it). A content page is linked as a page and runs from step 5f; the action `dialog` comes with step 6d (dialogues moved there on 2026-11-17), and until then the game shows a short note.
- GAME-13 and GAME-14 (from step 5i on, decided 2026-11-17): the step "Say hello" (profile photo, greeting, "How I know the couple"; stage 6) and the button "Hochladen" (stage 7).
- CNT-02 (from stage 4 on, decided 2026-11-13): dialogues and NPC texts (5d), photo albums (7d). Unlock conditions are covered by ACS-05.
- CNT-03 (from stage 4 on): the reference from a game-world object by `contentId` (5d).
- ROLE-06: the capabilities in use: `editWebsiteContent` (4a), `moderateContributions` (7c). Until then only test routes use them.
- ROLE-07: every step that adds an administration function guards it with the admin role and adds a `[ROLE-07]` test that a user without it is refused. The admin pages of stage 2 are built in step 2h; each later admin page adds its own `[ROLE-07]` test.

**Withdrawn** (decided 2026-11-17). MAP-12, MAP-13 and MAP-14 (the template map set, its decoration layers and its import) are withdrawn: no template world will be shipped. They are not tested.

**Not yet tested** (decided 2026-11-11). These requirements are implemented and their automated tests pass, but the check in a real environment that completes them has not been done. They stay on this list until it has been done and recorded in the manual test protocol. The requirement report does not read this list; it is kept by hand.

- **GAME-27** (added 2026-11-17, story 5.1a): checked on an iPhone 16 Pro in Safari (60 fps, recorded 2026-11-17). Still open: the installed app on iOS, Android Chrome and a desktop browser, with the diagnostics overlay (`Frame rate and canvas` in the game preview, or `?debug=frames`); each goes into the manual test protocol as a row for GAME-27.

Cleared on 2026-11-13 and filled again since: PWA-01 – PWA-05, LIC-03 and OPS-02 were checked on prod and are recorded as `pass` rows in [manual-test-protocol.md](manual-test-protocol.md). OPS-02 and OPS-12 (tag ruleset, recorded the same day) left the "not yet implemented" list.

**When a requirement is added here:** the entry names the check, where and when it is done. Once the check is recorded as a `pass` row in the manual test protocol, the entry is deleted, and the requirement leaves the "not yet implemented" list if it was kept there for this check.

## 6. Verification beyond CI, and open decisions

### 6.1 Verifying requirements that can't be fully automated in CI (decided)

These requirements need a production environment, real devices or real time to verify completely:

- OPS-02 (Let's Encrypt and live updates on the production host, at the Release 1 go-live), OPS-05 (restore drill with a real full backup)
- OPS-12 (tag ruleset in the GitHub repository settings), OPS-10 and OPS-11 (first real release candidate and promotion), OPS-13 (staging on the LAN restored from the off-site backup, mail caught, volume deleted afterwards), OPS-14 (image cleanup run), OPS-15 and OPS-16 (deployment to prod and a rollback drill with `deploy.sh`)
- PHO-03 (camera capture on real iOS and Android devices)
- PWA-01 – PWA-05 (add to home screen on real iOS and Android devices with a release candidate on staging: manifest and icons through Caddy, icon, name, no browser bars, safe areas, install prompt and hint, sign-in after install; step 3.5e), LIC-03 (the source link and the license page on prod; step 3.5f)
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

## 8. Testing efficiency policy (decided 2026-11-17)

The objective is to minimize test execution time while maintaining software quality and sufficient confidence. The policy applies to everyone who runs tests in this repository: the developer, Claude and any subagent. CI is the exception: it always runs everything (`npm run check`, section 2).

### 8.1 General rules

1. Never run the entire test suite after every code change.
2. Always prefer targeted tests covering the modified functionality.
3. Never rerun tests that have already passed unless relevant source code, test code, dependencies or configuration have changed.
4. Batch related code changes before running tests.
5. Avoid running identical tests concurrently across multiple agents.
6. Do not run tests simply to reconfirm previously established results.

### 8.2 Before running tests

1. Inspect the current changes with `git diff`.
2. Identify the modified files and the affected components.
3. Identify the tests relevant to those changes.
4. Determine the smallest meaningful test subset.
5. Prefer existing test commands that support filtering or test selection.

### 8.3 Execution strategy

In this priority:

1. Targeted unit tests for the modified functionality.
2. Relevant integration tests, if component interactions are affected.
3. Static analysis, linting and type checking, as appropriate.
4. Broader regression tests only when justified by the scope or the risk of the change.

### 8.4 When a test fails

1. Analyze the failure before executing anything again.
2. Identify whether the current changes caused it.
3. Fix the underlying issue.
4. Rerun only the failed test and the tests affected by the fix.
5. Do not rerun previously passing unrelated tests.

### 8.5 The full test suite

Run the complete suite only when:

- the user explicitly requests it;
- the changes affect shared infrastructure or cross-cutting functionality;
- the changes involve dependencies or configurations with broad impact;
- targeted testing cannot provide sufficient confidence;
- it is required for a release or for CI validation (including the requirement report, which reads the results of a complete Vitest and Playwright run).

### 8.6 Multi-agent coordination

- Avoid duplicate test execution across agents.
- Reuse the results of another agent when they apply to the exact same code state.
- Designate one agent as responsible for final verification.
- Do not assume that test results remain valid after relevant source changes.

### 8.7 Completion report

At the end of a task, report the tests executed, the tests passed and failed, the tests skipped and why, and the remaining verification risks. Never claim that tests passed that were not executed.

### 8.8 Flaky end-to-end tests (decided 2026-11-18)

A test that fails now and then without a change in the code is **flaky**. It is tracked here and, in a local run, kept apart from the full run, so that a run is not red because of the load of the machine. CI still runs every e2e test.

- **Marking.** A flaky test names itself with `@flaky` at the end of its title: `test("[ABC-01] does something @flaky", …)`. Playwright's `grep` finds it by that text, and the requirement report reads it from the title.
- **Runs.** Locally, `npm run test:e2e` leaves the flaky tests out, and `npm run test:e2e:flaky` runs only them, with two retries, into `reports/playwright-flaky.json` and `playwright-report-flaky/`. **CI runs all e2e tests in one run** (`CI` set, two retries), flaky ones included, and its result is the verdict.
- **Requirement report.** It reads `reports/playwright.json` and, when it exists, `reports/playwright-flaky.json`. A flaky test counts like any other test: its results are results. Without the file of the flaky run the report prints a notice. A complete verdict for a requirement needs the full run (`CI=1 npm run test:e2e`) or both local runs.
- **Tracking.** Every `@flaky` test has a row in the table below, and every row has a test (a test in `scripts/req-report/spec-consistency.test.ts` checks this). A row says since when the test is flaky and what was seen. When the cause is fixed, the tag and the row are removed in the same commit.
- **New tests.** A new e2e test that fails in a full run without a change in the code is first re-run alone. When it passes alone and fails under load, it gets the tag and a row. The tag is not a place to hide a test that fails for a reason.

| File | Test | Projects seen | Since | Symptom |
|---|---|---|---|---|
| `e2e/rsvp.spec.ts` | a guest answers the RSVP once for the invited program items; the admin sees it and changes it | mobile-ios | 2026-11-18 | Timed out on the first attempt, passed on the retry. |
| `e2e/skeleton.spec.ts` | the server started with the example event and serves it with its toggles | mobile-ios | 2026-11-18 | Saw `platformOpen: true` instead of the fresh state on the first attempt, passed on the retry. Probably another test (the platform opening) running in parallel on the same installation. |

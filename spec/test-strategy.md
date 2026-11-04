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
| Load | open (see section 6) | Concurrent players and uploads against the target VPS configuration | Before each production event |
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
| RSVP | Integration, E2E | Event parts per invitation; accompanying-person requests with avatar and RSVP filled in by the VIP, admin approval, no login possible, deletion together with the VIP; deadline, overview totals, CSV export, reminder email via the test mail sink. |
| WEB | Component, E2E | E2E on desktop and mobile viewports. WEB-01 with the game bundle blocked. "Now / next" with fake timers across entry boundaries and the event timezone; schedule change visible immediately; "Go there". |
| CNT, LANG | Unit, Integration, E2E | The same content item appears on the website page and in a game-world dialogue. Markdown editing and preview via E2E. Language keys in the content model, and no hard-coded UI strings (lint check). |
| ACC, AVA | Integration, Component, E2E | SMTP is replaced by a local test mail sink. Covers verified and unverified paths, and the admin reset link. |
| ROLE, ACS, GRP | Unit, Integration, E2E | Full combination matrix of the three roles as table-driven tests. Server enforcement tested per endpoint and per map load. Every page and endpoint without sign-in is rejected, except the allowed list (ACS-09). |
| INV | Integration, E2E | Includes a concurrency test for atomic redemption (INV-08) and the printable export at creation time (INV-14).  |
| PHO, MOD | Integration, E2E, Manual | Composer with "Upload snapshot" (disabled without a photo) and "Upload keepsake" (photo, photo + text, text only); text length limits; keepsake page; printable keepsake book PDF including photos. Fixture images in JPEG, PNG and HEIC, plus oversized and invalid files. Worker queue processed in tests. Anonymous upload via upload link: revoked or expired token rejected, token grants nothing else. Swipe moderation via Playwright touch emulation and arrow keys, undo, rejected list. Real-device camera check is manual. |
| MAP | Unit, Integration, E2E | Test maps exported from Tiled live in test fixtures, including invalid ones. Import validation, warnings for missing portal targets, portal properties from Tiled, `eventPart` and wander areas, rollback, new version used on next map entry with refreshed graphics. |
| DATA | Integration | Migrations run from an empty DB and from the previous schema version with data. |
| CFG | Unit, Integration | Valid and invalid `event.json` fixtures. Feature toggles and runtime settings changes checked in UI and API. |
| OPS | Deployment smoke, Manual | See open decision 6.1. |
| SEC | Unit, Integration, E2E | CSRF, rate limits and schema validation per endpoint group. Markdown sanitising, noindex headers and `robots.txt`, privacy notice without sign-in. Shutdown flow with fake timers: notice email, export, deletion. |
| PERF | Load | See open decision 6.2. |

## 5. Not yet implemented

All active requirements are listed here until their stage is delivered. Shrink this list as stages are completed. The requirement report treats every ID listed here as "not yet implemented" and does not require a passing test for it. Withdrawn requirements (ACC-02, ACS-01 – ACS-03, ACS-08, GB-01 – GB-04, INV-13, INV-15 – INV-19, MAP-07, MAP-11, MP-01 – MP-06, PERF-02, PHO-04, PRES-03, PRES-11, ROLE-02, ROLE-10, SCR-03, SCR-06) are not listed, and the report ignores them.

| Prefix | IDs | Count |
|---|---|---|
| GAME | GAME-01 – GAME-14 | 14 |
| PRES | PRES-01, PRES-02, PRES-04 – PRES-10, PRES-12 – PRES-15 | 13 |
| HUNT | HUNT-01 – HUNT-07 | 7 |
| MG | MG-01 – MG-13 | 13 |
| WEB | WEB-01 – WEB-08 | 8 |
| LANG | LANG-01, LANG-02 | 2 |
| SCR | SCR-01, SCR-02, SCR-04, SCR-05 | 4 |
| CNT | CNT-01 – CNT-05 | 5 |
| ACC | ACC-01, ACC-03 – ACC-13 | 12 |
| AVA | AVA-01 – AVA-04 | 4 |
| RSVP | RSVP-01 – RSVP-09 | 9 |
| ROLE | ROLE-01, ROLE-03 – ROLE-09 | 8 |
| INV | INV-01 – INV-12, INV-14 | 13 |
| ACS | ACS-04 – ACS-07, ACS-09 | 5 |
| GRP | GRP-01, GRP-02 | 2 |
| PHO | PHO-01 – PHO-03, PHO-05 – PHO-17 | 16 |
| MOD | MOD-01 – MOD-05 | 5 |
| MAP | MAP-01 – MAP-06, MAP-08 – MAP-10, MAP-12 – MAP-14 | 12 |
| DATA | DATA-01 – DATA-04 | 4 |
| CFG | CFG-01 – CFG-05 | 5 |
| OPS | OPS-01 – OPS-07 | 7 |
| SEC | SEC-01 – SEC-10 | 10 |
| PERF | PERF-01, PERF-03, PERF-04 | 3 |
| **Total** | | **181** |

The stage each requirement belongs to is listed in `sw-architecture.md`, section 28.

## 6. Verification beyond CI, and open decisions

### 6.1 Verifying requirements that can't be fully automated in CI (decided)

These requirements need a production environment, real devices or real time to verify completely:

- OPS-02 (Let's Encrypt in production), OPS-03 (firewall on the VPS), OPS-05 (off-site backup and restore), OPS-07 (deployment to the VPS)
- PHO-03 (camera capture on real iOS and Android devices)
- PERF-01 (load test on the target VPS)

Decision:

- Everything that can run in CI is automated with Playwright and tagged with the requirement ID: local Compose stack, WebKit/Chromium mobile emulation including touch and swipe, scripted backup and restore against a temporary volume.
- The remaining real-environment checks are manual tests, recorded in a manual test protocol (`spec/manual-test-protocol.md`) that the requirement report reads as an extra result source. Each record has requirement ID, date, tester, environment and result.

### 6.2 Load test tool (PERF-01) — open

Options:

1. **(Recommended)** k6: HTTP load for website, game asset loading and API, plus a scenario for a burst of photo uploads.
2. Artillery.

## 7. Release checklist (before each production event)

Organisational items that are not software requirements:

- Privacy policy written and legal requirements reviewed (sw-architecture.md, section 24).
- Load test executed on the production VPS and result recorded (PERF-01).
- Backup restore drill done (OPS-05).
- Photo upload checked on at least one current iOS device and one current Android device (PHO-03).
- Emails (verification, password reset, shutdown notice) arrive through the production SMTP account and aren't marked as spam (sender domain SPF/DKIM set up).
- Printed invitation QR codes tested against production: redemption works and the account becomes VIP.
- Venue QR codes printed and checked against the production URLs.
- Treasure hunt codes printed, each scanned once on production, and the test finds reset.
- Event screen tested on the venue projector, with the screen link created and revoked after the event.
- Before shutdown: shutdown date set, notice sent, export taken and handed to the hosts.

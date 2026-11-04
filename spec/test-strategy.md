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
| Integration | Vitest | Backend modules against a real SQLite database (temporary file per test run), HTTP API through the real server, and Colyseus rooms through an in-process test server | CI, every push |
| End-to-end | Playwright | Full stack in the browser: website flows, game world, multiplayer with several browser contexts, photo upload. Desktop and mobile viewports (Chromium, WebKit) | CI, every push |
| Deployment smoke | Playwright / shell scripts | Docker Compose stack started in CI: reverse proxy, WebSocket upgrade, persistence across container restart | CI, every push (local TLS); production checks per release |
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
| GAME | Unit, E2E | Object type interpretation, movement and collision logic, tap-to-move pathfinding as unit tests. Keyboard and tap control, portals and interaction via E2E with the test hook. |
| MP | Integration, E2E | Colyseus room tests for join/leave/sync and position validation (too fast, through walls, out of bounds → corrected). E2E with two browser contexts on the same map. |
| MG | Unit, Integration, E2E | Plausibility profiles as unit tests. Attempt IDs, API validation and storage as integration tests. Scene start/return as E2E. |
| WEB | Component, E2E | E2E on desktop and mobile viewports. WEB-01 with the game bundle blocked. |
| CNT, LANG | Unit, Integration, E2E | The same content item appears on the website page and in a game-world dialogue. Markdown editing and preview via E2E. Language keys in the content model, and no hard-coded UI strings (lint check). |
| ACC, AVA | Integration, Component, E2E | SMTP is replaced by a local test mail sink. Covers verified and unverified paths, and the admin reset link. |
| ROLE, ACS, GRP | Unit, Integration | Full role-combination matrix as table-driven tests. Server enforcement tested per endpoint and per room join. |
| INV | Integration | Includes a concurrency test for atomic redemption (INV-08) and the printable export at creation time (INV-14). |
| PHO, GB | Integration, E2E, Manual | Fixture images in JPEG, PNG and HEIC, plus oversized and invalid files. Worker queue processed in tests. Guestbook moderation flow. Real-device camera check is manual. |
| MAP | Unit, Integration, E2E | Test maps exported from Tiled live in test fixtures, including invalid ones. Import validation, portal target assignment, dangling-target detection, rollback and re-import with players online. |
| DATA | Integration | Migrations run from an empty DB and from the previous schema version with data. |
| CFG | Unit, Integration | Valid and invalid `event.json` fixtures. Feature toggles and runtime settings changes checked in UI and API. |
| OPS | Deployment smoke, Manual | See open decision 6.1. |
| SEC | Unit, Integration, E2E | CSRF, rate limits and schema validation per endpoint group. Markdown sanitising, noindex headers and `robots.txt`, privacy notice without sign-in. Shutdown flow with fake timers: notice email, export, deletion. |
| PERF | Load | See open decision 6.2. |

## 5. Not yet implemented

All active requirements are listed here until their stage is delivered. Shrink this list as stages are completed. The requirement report treats every ID listed here as "not yet implemented" and does not require a passing test for it. Withdrawn requirements (ROLE-10, PHO-04) are not listed, and the report ignores them.

| Prefix | IDs | Count |
|---|---|---|
| GAME | GAME-01 – GAME-11 | 11 |
| MP | MP-01 – MP-06 | 6 |
| MG | MG-01 – MG-11 | 11 |
| WEB | WEB-01 – WEB-06 | 6 |
| LANG | LANG-01 – LANG-02 | 2 |
| CNT | CNT-01 – CNT-05 | 5 |
| ACC | ACC-01 – ACC-12 | 12 |
| AVA | AVA-01 – AVA-04 | 4 |
| ROLE | ROLE-01 – ROLE-09 | 9 |
| INV | INV-01 – INV-14 | 14 |
| ACS | ACS-01 – ACS-08 | 8 |
| GRP | GRP-01 – GRP-02 | 2 |
| PHO | PHO-01 – PHO-03, PHO-05 – PHO-13 | 12 |
| GB | GB-01 – GB-04 | 4 |
| MAP | MAP-01 – MAP-11 | 11 |
| DATA | DATA-01 – DATA-04 | 4 |
| CFG | CFG-01 – CFG-05 | 5 |
| OPS | OPS-01 – OPS-07 | 7 |
| SEC | SEC-01 – SEC-10 | 10 |
| PERF | PERF-01 – PERF-03 | 3 |
| **Total** | | **146** |

The stage each requirement belongs to is listed in `sw-architecture.md`, section 28.

## 6. Open decisions

These points must be decided before the affected requirements are implemented.

### 6.1 Verifying requirements that can't be fully automated in CI

These requirements need a production environment, real devices or real time to verify completely:

- OPS-02 (Let's Encrypt in production), OPS-03 (firewall on the VPS), OPS-05 (off-site backup and restore), OPS-07 (deployment to the VPS)
- PHO-03 (camera capture on real iOS and Android devices)
- PERF-01 (load test on the target VPS)

Options:

1. **(Recommended)** Automate what is possible in CI (local Compose stack, WebKit/Chromium mobile emulation, scripted backup and restore against a temporary volume) and tag those tests with the ID. Keep the remaining real-environment checks in a manual test protocol (`spec/manual-test-protocol.md`) that the requirement report reads as an extra result source. Each record has a date, tester and result.
2. Count only automated tests. The requirements stay "partially verified", and the release checklist covers the remainder.

### 6.2 Load test tool (PERF-01)

Options:

1. **(Recommended)** `@colyseus/loadtest` for simulated players, combined with a small script for concurrent photo uploads.
2. k6 with a WebSocket script.
3. Artillery.

## 7. Release checklist (before each production event)

Organisational items that are not software requirements:

- Privacy policy written and legal requirements reviewed (sw-architecture.md, section 24).
- Load test executed on the production VPS and result recorded (PERF-01).
- Backup restore drill done (OPS-05).
- Photo upload checked on at least one current iOS device and one current Android device (PHO-03).
- Emails (verification, password reset, shutdown notice) arrive through the production SMTP account and aren't marked as spam (sender domain SPF/DKIM set up).
- Printed invitation QR codes tested against production: redemption works and the account becomes VIP.
- Venue QR codes printed and checked against the production URLs.
- Before shutdown: shutdown date set, notice sent, export taken and handed to the hosts.

# Zappaloo – Implementation Plan

This plan breaks the stages of [sw-architecture.md](sw-architecture.md), section 28, into steps. It lists what must be decided or provided before each stage, and it collects a status report after every completed stage.

## 1. How we work

- One stage at a time, on a branch `feature/stage-<n>` (or `feature/stage-<n>-<text>`) that the project owner creates. Claude never commits and never creates or switches branches (see CLAUDE.md).
- **Before a stage starts:** the preconditions listed for the stage are settled, and the steps below are confirmed or adjusted with the project owner.
- **Each step** ends with a short summary: what changed, tests and their results, anything open. The project owner reviews and commits before the next step starts.
- **Each completed stage** ends with a status report (section 4), appended to section 5 of this document and shown in the conversation.
- Every step adds tests tagged with the requirement IDs it implements, and removes those IDs from the "not yet implemented" list in [test-strategy.md](test-strategy.md). The requirement report must pass.
- If a step shows that the spec is wrong or incomplete, Claude proposes a spec change before deviating.

## 2. Releases

| Release | After stage | What guests get |
|---|---|---|
| **Release 1 (early)** | 3 | Redeem invitation, answer the RSVP, waiting page with the door scene. The platform is closed. |
| **Opening** | 6 | The admin opens the platform: website, game world, wandering figures, speech bubbles, table finder. |
| **Event-ready** | 9 | Contributions, photo wall, moderation, minigames, treasure hunt; load test passed and release checklist done. |
| **After the event** | 10 | Export, shutdown notice and deletion (mandatory, ready before the shutdown date). |

Each release goes into production. From Release 1 on, real guest data is stored, so backups (stage 1) and the privacy notice (stage 3) are in place before Release 1.

## 3. Stages and steps

### Overview

| Stage | Content | Release | Status |
|---|---|---|---|
| 1 | Walking skeleton and deployment | 1 | next |
| 2 | Accounts, roles and access | 1 | open |
| 3 | RSVP and waiting page | 1 | open |
| 4 | Content and website | Opening | open |
| 5 | Game world and map importer | Opening | open |
| 6 | Living world | Opening | open |
| 7 | Contributions and event screen | Event-ready | open |
| 8 | Minigames, treasure hunt and highscores | Event-ready | open |
| 9 | Event readiness | Event-ready | open |
| 10 | After the event | After the event | open |

### Stage 1 – Walking Skeleton and Deployment

**Before the stage starts:**
- Decide the backend framework and the database access library. *Decided 2026-11-04: Fastify, and Drizzle ORM on SQLite (sw-architecture.md 15.1).*
- LAN server (x86-64) with Docker for staging. *Needed from step 1d.*
- *Hosting is out of scope (2026-11-04, sw-architecture.md 21): the operator provides the hosts, the domain and the off-site backup storage. Stage 1 needs only a host for staging.*
- CI/CD adapted from the project owner's definitions (2026-11-04): version scheme, release candidates and promotion, GHCR, `deploy.sh` with rollback, staging on the LAN (sw-architecture.md 23, OPS-08–16).

**Steps:**

**1a – Monorepo and tooling.** npm workspaces `frontend`, `backend`, `shared`; TypeScript, ESLint, Prettier, Vitest and Playwright configured; the requirement report (`npm run req-report`) reads the spec, the "not yet implemented" list and the test results.
Requirements: none (foundation for all later steps).

**1b – Backend and frontend skeleton.** Backend with a health endpoint and schema validation of all inputs; SQLite with versioned migrations; React app with routing and the i18n framework; Phaser mounted with an empty scene; `robots.txt` and `X-Robots-Tag: noindex`; CLI with `version` and `migrate`.
Requirements: DATA-01, DATA-04, LANG-01, SEC-03, SEC-10, OPS-17.

**1c – Continuous integration and versioned images.** `ci.yml` on every pull request and push to `main`: lint and format check, type checks, tests, end-to-end tests, requirement report, migration check; version determination; application image (Dockerfile) built with version and commit, smoke-tested via `GET /api/version`, pushed to GHCR from `main`; `cleanup-images.yml`; local `build-image.sh`. The project owner enables branch protection on `main` (sw-architecture.md 23.1, 23.2).
Requirements: OPS-06, OPS-08, OPS-14.

**1d – Containers and staging.** Compose file with the application and Caddy; persistent volumes; `deploy.sh` (pull, secrets, prod pre-deploy backup, version-checked health check) and the deployment bundle; CLI `backup` and `restore`; `deploy.sh --restore` for rollbacks, verified by the deployment test; first deployment of a `main` image to staging on the LAN, with an empty database and HTTPS from Caddy's local CA (sw-architecture.md 23.4–23.8).
Requirements: OPS-01, OPS-04, OPS-15, OPS-16, OPS-18.

**1e – Releases.** `release-candidate.yml` and `promote.yml` with unit-tested release rules; tag ruleset for `v*` against moving and deleting (set up by the project owner; enforced only once the repository is public, see the open points in README.md); SSE heartbeat endpoint, checked through Caddy by the deployment test; only Caddy's ports published, checked by the deployment test; staging next to prod on other ports with the HTTP→HTTPS redirect keeping the port; first release candidate built and deployed to staging (sw-architecture.md 17.1, 21.2, 21.3, 23.3).
Requirements: OPS-03, OPS-10, OPS-11, OPS-12.

**1f – Backup and restore tools.** Full backup of an environment (database and files in the data volume) and its scripted restore; staging deploys restore a prod backup provided by the operator, with mail caught and the volume deleted after verification; runbook listing everything to back up. Scheduling and off-site storage are the operator's (sw-architecture.md 22.2).
Requirements: OPS-05, OPS-13.

### Stage 2 – Accounts, Roles and Access

**Before the stage starts:**
- SMTP account at Infomaniak for the proof of concept (Mailpit is used in development).

**Steps:**

**2a – Event bootstrap and settings.** `events/<slug>/` directory read and validated at startup; event with `eventId` on all event-related records; feature toggles and settings changeable at runtime; audit log.
Requirements: CFG-02, CFG-03, CFG-05, DATA-02, DATA-03.

**2b – Accounts and sessions.** Login and logout, long-lived server-side sessions, password hashing, CSRF protection, rate limiting, profile, accounts created by an admin; CLI `create-admin` and `reset-password`.
Requirements: ACC-01, ACC-04, ACC-05, ACC-06, ACC-08, ACC-13, ACC-14, ACC-15, SEC-01, SEC-02.

**2c – Email and account self-service.** SMTP sending; optional email verification; password reset for verified addresses only; admin one-time reset link; users delete their own account. Deleting one's own contributions is added to the tests in stage 7.
Requirements: ACC-03, ACC-09, ACC-10, ACC-11, ACC-12.

**2d – Roles, capabilities and guest groups.** Roles `vip`, `staff`, `admin` per event and combinable; staff capabilities; guest groups.
Requirements: ROLE-01, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07, ROLE-08, ROLE-09, GRP-01, GRP-02.

**2e – Invitations.** Personal invitation tokens (stored as hashes), redemption creating an account or adding `vip`, atomic redemption, statuses, expiry, revoke and regenerate, direct admin promotion, printable export with QR codes.
Requirements: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10, INV-11, INV-12, INV-14, ACC-07.

**2f – Access control.** Sign-in required everywhere except the allowed pages; access conditions combined with AND/OR; server-side enforcement on every request. Conditions that depend on later features (treasure hunt) are added in their stage.
Requirements: ACS-05, ACS-06, ACS-07, ACS-09.

### Stage 3 – RSVP and Waiting Page (completes Release 1)

**Before the stage starts:**
- The project owner draws the door scene for the waiting page (ACS-12).
- Event parts, menu options and the RSVP deadline of the first event are known, at least as test data.

**Steps:**

**3a – RSVP.** Event parts and invitations per part; RSVP with menu choice and allergies; deadline; admin overview with totals and CSV export; reminder email; song wish; allergy data visible only to admins.
Requirements: RSVP-01, RSVP-02, RSVP-03, RSVP-04, RSVP-05, RSVP-06, RSVP-07, SEC-11.

**3b – Accompanying persons.** VIP requests an accompanying person with name and RSVP; admin approves or rejects; no login; deleted together with the VIP.
Requirements: RSVP-08, RSVP-09.

**3c – Closed platform and waiting page.** Platform closed by default; waiting page with the door scene, texts by RSVP status with placeholders, editable texts, countdown; staff and admins have full access.
Requirements: ACS-10, ACS-11, ACS-12, ACS-13.

**3d – Opening and privacy notice.** Admin switch to open the platform with the "door is open" email; privacy notice reachable from every page.
Requirements: ACS-14, SEC-09.

**3e – Release 1 go-live.** First release promoted and deployed to production on the operator's host; Let's Encrypt and live updates through Caddy checked there (manual test protocol); invitation print export checked end to end, privacy notice reviewed, manual checks from the release checklist that apply to Release 1.
Requirements: OPS-02.

### Stage 4 – Content and Website

**Before the stage starts:**
- Texts for the first event's pages (at least drafts).

**Steps:**

**4a – Content model and editing.** Central content base with language keys; content items referenced from website and game; Markdown editing with preview; sanitised rendering.
Requirements: CNT-01, CNT-02, CNT-03, CNT-04, CNT-05, LANG-02, SEC-05.

**4b – Website.** Website pages, configurable per event, responsive, usable without the game; generic platform core with one event per installation.
Requirements: WEB-01, WEB-02, WEB-03, WEB-04, CFG-01, CFG-04.

**4c – Schedule and "now / next".** Structured schedule; current and next entry on the start page. The Programme button above the game follows in stage 5.
Requirements: WEB-07.

### Stage 5 – Game World and Map Importer

**Before the stage starts:**
- The project owner provides a first map (or a template map) and its tileset, drawn in Tiled.

**Steps:**

**5a – Phaser foundation.** Top-down rendering, tile and object layers, portals between maps.
Requirements: GAME-01, GAME-03, MAP-02.

**5b – Map importer.** Import of Tiled JSON with tilesets at runtime, validation, warnings for missing portal targets, versions with rollback, refreshed graphics on next map entry.
Requirements: MAP-01, MAP-04, MAP-05, MAP-06, MAP-08, MAP-09, MAP-10.

**5c – Movement and controls.** Smooth movement with map collisions, arrow keys on desktop, tap-to-move with pathfinding on touch devices, suitable for all screen sizes.
Requirements: GAME-02, GAME-07, GAME-09, GAME-10.

**5d – Objects and overlays.** Object types and their properties; dialogues, information items, easter eggs; website pages as overlays above the paused game; "Go there" from the schedule.
Requirements: GAME-04, GAME-05, GAME-06, GAME-08, GAME-11, MAP-03, WEB-08.

**5e – Avatars and entering the game.** Avatar editor; landing in the game after sign-in; guided first entry; button bar with RSVP badge and "now / next"; first map playable within 5 seconds over 4G.
Requirements: AVA-01, AVA-02, AVA-03, GAME-12, GAME-13, GAME-14, PERF-04.

**5f – Template map set.** Church, garden, banquet hall and party area with decoration on separate layers; maps created from templates in the importer.
Requirements: MAP-12, MAP-13, MAP-14.

### Stage 6 – Living World (completes the Opening)

**Before the stage starts:**
- Seating plan of the first event, at least as test data.

**Steps:**

**6a – Wandering figures.** Figures of attending guests in the wander areas of the maps of their event parts; own avatar instead of own figure; hiding; simulated per device.
Requirements: PRES-01, PRES-02, PRES-04, PRES-08, AVA-04.

**6b – Profiles and speech bubble.** Profile photo, greeting, "How I know the couple" with relation list; speech bubble opening for the nearest figure; admin can remove profile data.
Requirements: PRES-09, PRES-10, PRES-13, PRES-14, PRES-15.

**6c – Seating plan and table finder.** Tables and seats, default seats for accompanying persons, admin override, table finder with tablemates, visibility date.
Requirements: PRES-05, PRES-06, PRES-07, PRES-12.

### Stage 7 – Contributions and Event Screen

**Before the stage starts:**
- Venue locations for the QR codes and their albums.

**Steps:**

**7a – Upload pipeline.** Upload in the mobile browser with camera capture; type and size checks; JPEG, PNG and HEIC; conversion, compression and thumbnails in a worker queue; files on persistent storage.
Requirements: PHO-03, PHO-06, PHO-07, PHO-09, PHO-13, PERF-03.

**7b – Snapshots, keepsakes and upload links.** Composer with "Upload snapshot" and "Upload keepsake"; QR codes per location; anonymous upload links with optional name; rate limits; upload switches for the admin.
Requirements: PHO-01, PHO-02, PHO-05, PHO-08, PHO-14, PHO-15, PHO-18, ACS-04.

**7c – Moderation.** One queue, swipe view, live counter, undo, rejected list.
Requirements: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05, PHO-11.

**7d – Gallery and keepsakes.** Gallery by album and location with scheduled or manual release; keepsake page; printable keepsake book.
Requirements: PHO-10, PHO-12, PHO-16, PHO-17, WEB-06.

**7e – Event screen.** Full-screen panels with rotation, photo wall with captions over Server-Sent Events, read-only screen link.
Requirements: SCR-01, SCR-02, SCR-04.

### Stage 8 – Minigames, Treasure Hunt and Highscores

**Before the stage starts:**
- Decide which minigames ship with the platform for the first event (at least the couple quiz) and provide the quiz questions.

**Steps:**

**8a – Minigame framework.** Minigames as Phaser scenes with pause and resume; data passed to and from the minigame through the minigame API; generic result storage; registry by `minigameId`.
Requirements: MG-01, MG-02, MG-03, MG-04, MG-05, MG-06, MG-07, MG-11.

**8b – Anti-cheat and highscores.** Attempt IDs, plausibility profiles, server-side quiz checks; central highscores; leaderboards on the website and live on the event screen.
Requirements: MG-08, MG-09, MG-10, WEB-05, SCR-05.

**8c – Couple quiz on smartphones.** The first minigame, playable with touch, startable directly from a website page or a QR code.
Requirements: MG-12, MG-13.

**8d – Treasure hunt.** Hunt items with printable QR codes, collecting, collected items in profile and game, unlock condition, ranking, time window.
Requirements: HUNT-01, HUNT-02, HUNT-03, HUNT-04, HUNT-05, HUNT-06, HUNT-07.

### Stage 9 – Event Readiness (completes Event-ready)

**Before the stage starts:**
- Decide the load test tool (proposal: k6), see test-strategy.md 6.2.
- Stages 1–8 are deployed to production.

**Steps:**

**9a – Load test.** Load test on the production host with at least 50 concurrent users and a burst of uploads; findings fixed or accepted.
Requirements: PERF-01.

**9b – Release checklist.** All manual checks from test-strategy.md, section 7, before the event: devices, emails, QR codes, event screen on the venue projector, legal review of the privacy notice.
Requirements: none (release).

### Stage 10 – After the Event

**Before the stage starts:**
- Shutdown date agreed with the hosts. Stage 10 must be finished before that date.

**Steps:**

**10a – Export, shutdown and deletion.** Export of all contributions; shutdown date with notice email; automatic deletion of all personal data; data minimisation reviewed. Mandatory, because the privacy notice promises the deletion.
Requirements: SEC-04, SEC-06, SEC-07, SEC-08.


## 4. Status report template

After each completed stage, Claude appends a report with this structure to section 5 and shows it in the conversation:

```markdown
### Stage <n> – <title> (<date>)

**Summary:** one or two sentences on what guests or hosts can do now.

**Steps:** <step> – done / changed / moved, one line each.

**Requirements:** <implemented in this stage> of <planned for this stage>, all with passing tests (requirement report). Overall: <implemented> of <active> requirements.

**Tests:** unit / integration / end-to-end counts and results; manual checks done.

**Spec changes and deviations:** what changed in the spec during the stage and why.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | … | done / next / open |

**Remaining requirements by stage:** stage → number of requirements (from the requirement report).

**Waiting on the project owner:** decisions, art, content or access needed for the next stage.

**Risks and notes:** anything that could affect the next stages or the event date.
```

## 5. Status reports

No stage completed yet.

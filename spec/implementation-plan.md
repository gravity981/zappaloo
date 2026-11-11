# Zappaloo – Implementation Plan

This plan breaks the stages of [sw-architecture.md](sw-architecture.md), section 28, into steps. It lists what must be decided or provided before each stage, and it collects a status report after every completed stage.

## 1. How we work

- One stage at a time, on a branch `feature/stage-<n>` (or `feature/stage-<n>-<text>`) that the project owner creates. Claude never commits and never creates or switches branches (see CLAUDE.md).
- **Before a stage starts:** the preconditions listed for the stage are settled, and the steps below are confirmed or adjusted with the project owner.
- **Each step** ends with a short summary: what changed, tests and their results, anything open. The project owner reviews and commits before the next step starts.
- **Frontend steps follow the UX mocks** in [mocks/](mocks/README.md) (decided 2026-11-10): a screen shown there is built from its layout, flow and texts; deviations are proposed first and then applied to the mock.
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
| 1 | Walking skeleton and deployment | 1 | done |
| 2 | Accounts, roles and access | 1 | done |
| 3 | RSVP and waiting page | 1 | next |
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
Requirements: OPS-03, OPS-10, OPS-11, OPS-12, OPS-19 (added 2026-11-10: release notes with changelog and install/update commands, deployment bundle as one archive).

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

**2g – Review fixes** (added 2026-11-10 after the stage review). Sign-in and CSRF checks also for percent-encoded paths; admin API for feature toggles and settings (`PATCH /api/admin/event`); deployment bundle ready for prod mail (`secrets/smtp_password`, `EVENT_SLUG` without default, links without the default port); password must not equal the username; open setup and reset links voided by a password or email change; per-address limits count only failures; codes and tokens kept out of the logs, `Referrer-Policy`; audit log with ids only; cleanup of expired sessions and links; frontend handles ended sessions and lost connections, email verification with a button; migrations squashed into one before the first release with a database; partially implemented requirements tied to later steps (test-strategy.md 5).
Requirements: none new (strengthens CFG-05, SEC-01, SEC-02, ACC-03, ACC-06, ACC-11, ACC-12, INV-02, INV-05, ACS-07 and ACS-09).

**2h – Admin area** (added 2026-11-10, built from the admin mocks in [mocks/](mocks/README.md)). Admin shell at `/admin` (header with the platform state and "Zur Website", side navigation on desktop, scrollable entries on phones); the navigation lists only the pages that exist, and later steps add theirs. Übersicht (platform state, upload switches), Einladungen in the mock's layout, Konten & Rollen (accounts with role chips, a detail panel per account for staff capabilities, groups and a reset link, "Konto anlegen" with the setup link, guest groups with a panel for renaming, deleting and members), Einstellungen (feature switches). Opening the platform stays with 3c/3d; manual releases get their page with the first feature that stores conditions.
Requirements: none new (the pages for ACC-08, ACC-10, ROLE-01, ROLE-06, ROLE-07, ROLE-09, GRP-01, CFG-05, INV-01, INV-04, INV-05).

**2i – Event setup in the admin area** (added 2026-11-11, replaces the bootstrap from `events/<slug>/`, 19.3.1). `EVENT_SLUG`, `EVENTS_DIR`, the event folder and `event.json` are removed; the first start creates the event record with the fixed id `event1`; setup form (name, time zone, default language) as the first content of the admin area, with a UX mock; `PATCH /api/admin/event` also takes name, time zone and language; "not set up yet" page for other users and `409 setup_incomplete` for feature routes; CLI `event seed-example`; `theme.json` and static graphics move to `$DATA_DIR/events/event1/` (the folder is named by the event id, as backup `--full` already covers `events/`); deployment bundle, runbook, deploy tests, e2e tests (global setup seeds, one test runs the real setup) and release notes lose the slug. Migration check: the database schema may change (event row without name), squashed into the one migration as long as no release holds a database.
Requirements: CFG-02 (replaced), CFG-05 (reworded), CFG-06, CFG-07.

### Stage 3 – RSVP and Waiting Page (completes Release 1)

**Before the stage starts:**
- The project owner draws the door scene for the waiting page (ACS-12).
- Event parts (name, time, place, which part has the meal), menu options and the RSVP deadline of the first event are known, at least as test data.
- The decisions below (plan review of 2026-11-11) are written into sw-architecture.md (7.4.1, 10.4, 24, ACS-13), test-strategy.md and the mocks (questions 49–56 in `zappaloo-mocks.html` and mocks/README.md).

**Decisions from the plan review (2026-11-11):**
- **Countdown optional** (ACS-13 changes): the opening date stays a setting of its own (used by `{openingDate}`); a separate switch "Countdown auf der Warteseite zeigen" (default off) decides whether the countdown appears. The countdown disappears when it reaches zero; the text stays.
- **Re-closing:** the admin can close the platform again ("Wieder schliessen", no email).
- **Menu tied to one part** (RSVP-03): the admin marks the event part that has the meal (e.g. Dinner); the menu is asked only for persons attending that part. One menu list for everyone, children's menu included (the mock's two different lists become one).
- **Admin changes an RSVP** (RSVP-04): the "Allergien" card in Rückmeldungen becomes a guest table (name, status, parts, menu, song; allergies as a column with the lock "nur Admins"); a row opens the RSVP wizard in admin mode, without the deadline.
- **Approved companions** (RSVP-09): the VIP changes their attendance, menu and allergies in the wizard like their own, until the deadline, without a new approval. Only pending requests can be withdrawn; the name of an approved companion is changed by the admin.
- **Invited parts of admin-created VIPs** (RSVP-02): the account panel shows "Eingeladen zu" chips for accounts with `vip`; a new account is invited to all parts.
- **Waiting-page texts** are edited in Einstellungen only; the "Warteseite" chip leaves the Inhalte mock.
- **Event parts** are created in stage 3 (Einstellungen › Rückmeldung: name, time, place, meal part), not in stage 4 as sw-architecture.md 19.3.1 says; stage 4 builds the programme on top of them.
- **Privacy notice** (SEC-09): Claude drafts a German default (data kept, purposes, allergies as health data per SEC-11, deletion at shutdown); the admin edits it as Markdown in Einstellungen; public page `/datenschutz`. The mock gets the page and a "Datenschutz" link on the waiting page, the RSVP wizard and the admin area (the waiting-page mock has none today).

**Steps:**

**3a – RSVP.** Mock screens: `rsvp-parts`, `rsvp-people`, `rsvp-companion` (song only; the companion card comes in 3b), `rsvp-done` (before and after the deadline), `admin-rsvp`, `admin-invitations`, `admin-users` (account panel), `admin-settings` (card Rückmeldung), `admin-home` (KPI Rückmeldungen).
- Event parts, meal part, menus and deadline in Einstellungen › Rückmeldung.
- Invited parts per invitation: "Eingeladen zu" chips at batch creation, "Teile" column, editable per row (UX decision 31); "Eingeladen zu" in the account panel for admin-created VIPs.
- Three-step wizard (attendance → food → song), deadline shown up front, declining every part skips to the summary; summary page, read-only after the deadline; no confirmation email (UX decision 12).
- Rückmeldungen (new nav entry): totals per part (yes / no), menus of the meal part, guest table with the admin-only allergy column, song wishes, CSV export, "Erinnern (n)" reminder email to guests without an answer who have a verified address; a row opens the wizard in admin mode.
- Übersicht: KPI "Rückmeldungen x / y, n ohne Antwort", and the card "Zuletzt" (decided 2026-11-11, DATA-05): the latest 5 audit-log entries about guests and about settings and content, names resolved on display, no logins or role changes. 3a audits RSVP answers and changes and event-part and RSVP-setting changes; 3b adds companion requests and decisions, 3c and 3d the waiting-page texts, opening and the privacy notice; invitations created and redeemed are already audited.
Requirements: RSVP-01, RSVP-02, RSVP-03, RSVP-04, RSVP-05, RSVP-06, RSVP-07, SEC-11, DATA-05 (added 2026-11-11).

**3b – Accompanying persons.** Mock screens: `rsvp-companion` (overview and request form), `rsvp-people` (one card per person), `rsvp-done`, `admin-rsvp` (requests card), `admin-home` (KPI Begleitpersonen, nav badge).
- Request form: name, optional note, attendance for the VIP's own parts, menu, allergies with the lock note; the avatar comes later (PRES-07).
- Status tags pending / approved / rejected; "Bearbeiten" and "Zurückziehen" while pending; approved companions are edited in the wizard (see decisions); the hint about a separate invitation for people with their own phone.
- Admin approves or rejects in Rückmeldungen; approved companions count in totals, menus and the guest table; no login; deleted together with the VIP.
Requirements: RSVP-08, RSVP-09, RSVP-10 (added 2026-11-10).

**3c – Closed platform and waiting page.** Mock screens: `waiting` (three states), `admin-settings` (opening date and countdown switch in the card "Plattform öffnen", card Warteseite-Texte).
- Platform closed by default; guests without `staff` or `admin` reach only the waiting page, the RSVP wizard, the profile (without the website navigation, back to the waiting page) and the public pages; enforced on the server too.
- Waiting page: full-screen door scene (default scene shipped, replaceable per event in `$DATA_DIR/events/event1/`), gap tap for a bigger glimpse; top bar with the event name, Profil and Abmelden; card with the optional countdown, the text by RSVP status with `{name}`, `{waitingCount}`, `{openingDate}`, and "Rückmeldung geben" / "Rückmeldung ändern".
- Einstellungen: opening date, countdown switch, the three editable texts with their defaults.
Requirements: ACS-10, ACS-11, ACS-12, ACS-13.

**3d – Opening and privacy notice.** Mock screens: `admin-settings` (card "Plattform öffnen"), `admin-home` (KPI Plattform with "Öffnen …"), `login` and the waiting page (link Datenschutz), a new privacy notice screen.
- "Jetzt öffnen" with the optional "Die Tür ist offen" email to guests with a verified address (the count in the label counts them); "Wieder schliessen" without email.
- Privacy notice page `/datenschutz`, reachable without sign-in and linked from every page; German default text, editable in Einstellungen.
Requirements: ACS-14, SEC-09.

**3e – Sign-in by email** (added 2026-11-10). The login accepts a verified email address as well as the username; an address can be verified by one account only (`409 email_taken`).
Requirements: ACC-16.

**3f – Release 1 go-live.** First release promoted and deployed to production on the operator's host; Let's Encrypt and live updates through Caddy checked there (manual test protocol); invitation print export checked end to end, privacy notice reviewed, manual checks from the release checklist that apply to Release 1.
Requirements: OPS-02.

### Stage 4 – Content and Website

**Before the stage starts:**
- Texts for the first event's pages (at least drafts).

**Steps:**

**4a – Content model and editing.** Central content base with language keys; content items referenced from website and game; Markdown editing with preview; sanitised rendering.
Requirements: CNT-01, CNT-02, CNT-03, CNT-04, CNT-05, LANG-02, SEC-05.
Follow-up from stage 2: the content routes use `requireCapability("editWebsiteContent")` and get `[ROLE-06]` tests. If content items carry access conditions, the admin page for manual releases (ACS-05, sw-architecture.md 8.3) comes with this step.

**4b – Website.** Website pages, configurable per event, responsive, usable without the game; generic platform core with one event per installation.
Requirements: WEB-01, WEB-02, WEB-03, WEB-04, CFG-01, CFG-04.

**4c – Schedule and "now / next".** Structured schedule; current and next entry on the start page (the game world shows no "now / next", decided 2026-11-10); the programme shows only the parts the guest is invited to.
Requirements: WEB-07, WEB-09.

### Stage 5 – Game World and Map Importer

**Before the stage starts:**
- The project owner provides a first map (or a template map) and its tileset, drawn in Tiled.

**Steps:**

**5a – Phaser foundation.** Top-down rendering, tile and object layers, portals between maps.
Requirements: GAME-01, GAME-03, MAP-02.

**5b – Map importer.** Import of Tiled JSON with tilesets at runtime, validation, warnings for missing portal targets, versions with rollback, refreshed graphics on next map entry.
Requirements: MAP-01, MAP-04, MAP-05, MAP-06, MAP-08, MAP-09, MAP-10.
Follow-up from stage 2: map loading and protected game areas checked on the server, with `[ACS-07]` tests. The admin page for manual releases (ACS-05, sw-architecture.md 8.3), unless 4a built it.

**5c – Movement and controls.** Smooth movement with map collisions, arrow keys on desktop, tap-to-move with pathfinding on touch devices, suitable for all screen sizes.
Requirements: GAME-02, GAME-07, GAME-09, GAME-10.

**5d – Objects and overlays.** Object types `portal`, `clickable`, `decoration` and their properties; clickable objects that sparkle, walking to an object's approach point and running its action (page overlay, content item, dialogue, minigame), Enter or Space on desktop; portals as wobbling arrows; easter eggs; website pages as overlays above the paused game; "Go there" from the schedule; admin view "Spielwelt" to assign the actions per map.
Requirements: GAME-04, GAME-05, GAME-06, GAME-08, GAME-11, GAME-15, GAME-16, MAP-03, MAP-15, WEB-08.

**5e – Avatars and entering the game.** Avatar editor; landing in the game after sign-in; guided first entry with the hint about sparkling objects; button bar at the top with RSVP badge; own avatar opens the profile; first map playable within 5 seconds over 4G.
Requirements: AVA-01, AVA-02, AVA-03, GAME-12, GAME-13, GAME-14, GAME-17, GAME-18, PERF-04.

**5f – Template map set.** Church, garden, banquet hall and party area with decoration on separate layers; maps created from templates in the importer.
Requirements: MAP-12, MAP-13, MAP-14.

### Stage 6 – Living World (completes the Opening)

**Before the stage starts:**
- Seating plan of the first event, at least as test data.

**Steps:**

**6a – Wandering figures.** Figures of attending guests in the wander areas of the maps of their event parts; own avatar instead of own figure; simulated per device.
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
Follow-up from stage 2: contribution upload checked on the server, with `[ACS-07]` tests.

**7c – Moderation.** One queue, swipe view, live counter, undo, rejected list.
Requirements: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05, PHO-11.
Follow-up from stage 2: moderation uses `requireCapability("moderateContributions")`, with `[ROLE-06]` and `[ACS-07]` tests.

**7d – Gallery and keepsakes.** Gallery by album and location with scheduled or manual release; photo viewer with full-resolution download; keepsake page; printable keepsake book.
Requirements: PHO-10, PHO-12, PHO-16, PHO-17, PHO-19, WEB-06.

**7e – Event screen.** Full-screen panels with rotation, photo wall with captions over Server-Sent Events, read-only screen link, upload QR code shown now and then.
Requirements: SCR-01, SCR-02, SCR-04, SCR-07.

### Stage 8 – Minigames, Treasure Hunt and Highscores

**Before the stage starts:**
- Decide which minigames ship with the platform for the first event (at least the couple quiz) and provide the quiz questions.

**Steps:**

**8a – Minigame framework.** Minigames as Phaser scenes with pause and resume; data passed to and from the minigame through the minigame API; generic result storage; registry by `minigameId`.
Requirements: MG-01, MG-02, MG-03, MG-04, MG-05, MG-06, MG-07, MG-11.

**8b – Anti-cheat and highscores.** Attempt IDs, plausibility profiles, server-side quiz checks; central highscores; leaderboards on the website and live on the event screen.
Requirements: MG-08, MG-09, MG-10, WEB-05, SCR-05.
Follow-up from stage 2: minigame start and result submission checked on the server, with `[ACS-07]` tests.

**8c – Couple quiz on smartphones.** The first minigame, playable with touch, startable directly from a website page or a QR code.
Requirements: MG-12, MG-13.

**8d – Treasure hunt.** Hunt items with printable QR codes, collecting, collected items in profile and game, unlock condition, ranking, time window.
Requirements: HUNT-01, HUNT-02, HUNT-03, HUNT-04, HUNT-05, HUNT-06, HUNT-07.
Follow-up from stage 2: the treasure-hunt leaf of the access conditions, with `[ACS-05]` tests.

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

### Stage 1 – Walking Skeleton and Deployment (2026-11-10)

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

### Stage 2 – Accounts, Roles and Access (2026-11-10)

**Summary:** Guests can redeem a personal invitation (code or link) and sign in; users manage their profile, verify their email, reset a forgotten password and delete their account. Admins work in an admin area (Übersicht, Einladungen, Konten & Rollen, Einstellungen): they create invitations and print the cards, create accounts and hand over setup and reset links, change roles, staff capabilities and guest groups, and switch features and uploads. Manual releases have an API; their page comes with the first feature that uses them. The whole platform needs a sign-in, and every request is checked on the server.

**Steps:** 2a Event bootstrap and settings – done. 2b Accounts and sessions – done. 2c Email and account self-service – done. 2d Roles, capabilities and guest groups – done (API only). 2e Invitations – done, with the invitation page and a minimal admin page that prints the cards. 2f Access control – done. 2g Review fixes – added after the stage review and done (see spec changes). 2h Admin area – added after the mock review and done.

**Requirements:** 48 of 48 planned for this stage have passing automated tests (requirement report). Overall: 67 of 200 active requirements implemented. The report still shows 7 of them red (ACC-05, ACC-14, CFG-02, SEC-01, OPS-05, OPS-15, OPS-16) because of the deployment test, see risks. ACS-05, ACS-07, ROLE-06 and ROLE-07 are partially implemented: their remaining parts are tied to later steps (test-strategy.md 5).

**Tests:** 332 Vitest results (backend 198, frontend 49, shared 9, scripts and infrastructure 76), all passing; 40 Playwright results (10 tests on 4 browser profiles), all passing. The deployment test (16 tests against the real image, one added in 2g) could not be run, see risks. Manual checks: none new; the printed invitation cards should be checked once on a real printer or PDF (INV-14).

**Spec changes and deviations:**
- The decisions are written into sw-architecture.md: 7.1.1 (mail, verification, reset, deleting an account, roles, capabilities, groups), 9.6.1 (invitations) and 11.1.1 (sign-in everywhere, access conditions, manual releases).
- The invitation code has 6 characters and is protected by a global limit of 100 failed attempts per hour (decision record in README.md).
- `GET /api/event` needs a sign-in; the deployment test now reads the event with the CLI.
- The admin pages named for this stage were missing after 2f (only a minimal invitation page existed); step 2h builds them from the admin mocks (sw-architecture.md 8.3, mocks/README.md). The account and group panels are not in the original mocks; they were decided on 2026-11-10 and added to the mock. Manual releases get their page with the first feature that stores access conditions (follow-up on 4a and 5b).
- Step 2g, after the stage review (all written into sw-architecture.md 7.1.1, 9.6.1, 11.1.1, 19.3.1, 23.5 and 23.8):
  - Security: percent-encoded paths (`/%61pi/event`) passed the sign-in and CSRF checks; both now use the matched route or the decoded path. Invitation codes and link tokens are kept out of the request log, and responses carry `Referrer-Policy: same-origin`.
  - CFG-05: the admin API for features and settings (`PATCH /api/admin/event`) was missing; added. The frontend reloads the event when the page becomes visible.
  - Prod setup: `secrets/smtp_password` is passed as a Compose secret (a login without it stops the start and `deploy.sh`); `.env.example` leaves `EVENT_SLUG` empty; links use only the origin of `PUBLIC_URL`, so printed cards show no `:443`.
  - Accounts: a password must not equal the username (it was specified but not checked); using a link or changing the password or email voids the other open setup and reset links (decided 2026-11-10); the limits per client address count only failed attempts, so guests sharing the venue's Wi-Fi do not block each other (decided 2026-11-10); reset mails are counted per mail, not per link; the audit log holds ids only (it kept usernames and guest names); expired sessions and used links are deleted daily.
  - Invitations: an expired code can no longer be revoked (as specified); a code collision draws a new code; regenerating refuses a past expiry.
  - Robustness: transactions take the write lock when they begin, so the CLI next to the running server waits instead of failing with "database is locked" (it made the end-to-end tests flaky); the frontend shows the login page when the session ended elsewhere and an error on a lost connection; email verification needs a click, so link scanners cannot use the link up; a full restore of an archive without `events/` keeps the private event.
  - Data model: the six migrations of this stage were squashed into one (nothing with a database was released yet); roles, capabilities and group members now reference their membership, and group members the group's own event.
  - Tests: weak tests replaced (the ACC-06 timing check, the INV-08 guard), tests added for encoded paths, `TRUST_PROXY`, the new limits and the voided links.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | next |
| 4 | Content and website | open |
| 5 | Game world and map importer | open |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage:** stage 1 → 2 (OPS-12, OPS-13: manual checks); 3 → 17; 4 → 14; 5 → 31; 6 → 14; 7 → 28; 8 → 22; 9 → 1; 10 → 4. In total 133 of 200 active.

**Waiting on the project owner:**
- Run `npm run test:deploy` on a machine where Docker works (see risks) and send me the result, or tell me to proceed.
- For stage 3: draw the door scene for the waiting page (ACS-12) and provide the event parts, menu options and RSVP deadline (at least as test data).
- Infomaniak SMTP account (the bundle now takes its password in `secrets/smtp_password`).
- Recreate the dev database once: the squashed migration does not apply on top of the six old ones (`docker volume rm zappaloo-data-dev`, or delete `/var/lib/zappaloo/zappaloo.db*`, then restart the backend).
- Decide whether guest-group conditions should refer to the group by id instead of by name (see risks).

**Risks and notes:**
- In this devcontainer Docker loses the output of every command that runs longer than about 0.3 seconds (`docker run`, `docker exec`), so the image smoke test (`npm run build:image`: the image builds, the smoke test fails on `zappaloo version` printing nothing) and `npm run test:deploy` cannot be trusted here. The deploy results in `reports/` date from before this stage and also show failures. The deployment test has not run against the stage-2 image; it needs one run in a working Docker setup before the next release candidate.
- Group conditions name the group (11.1.1): renaming a group closes what was protected with the old name, and a new group with the old name opens it to others. Nothing stores conditions yet; to decide before the first feature does (stage 4 or 5).
- Five failed logins lock that one username for 15 minutes, also the admin's; anyone who knows a username can do that on purpose. Kept as specified (decided 2026-11-10): it caps the guesses per account from any number of addresses. The lock is in memory, so a restart of the app also ends it.
- Redemption can be blocked for an hour by anyone who fails 100 times on purpose (accepted, see the decision record); the admin can hand a code over.

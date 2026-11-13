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
| **Release 1 (early)** | 3.5 | Redeem invitation, answer the RSVP, waiting page with the door scene, add the site to the home screen as an app. The platform is closed. |
| Release 1 updates | 3.9 | Findings from the pilot on prod: one RSVP answer for all program items, "Begleitperson hinzufügen" without approval, person types; invited guests on the guest list before they redeem. |
| **Opening** | 6 | The admin opens the platform: website, game world, wandering figures, speech bubbles, table finder. |
| **Event-ready** | 9 | Contributions, photo wall, moderation, minigames, treasure hunt; load test passed and release checklist done. |
| **After the event** | 10 | Export, shutdown notice and deletion (mandatory, ready before the shutdown date). |

Each release goes into production. From Release 1 on, real guest data is stored, so backups (stage 1), the privacy notice (stage 3) and the installable app (stage 3.5) are in place before Release 1.

## 3. Stages and steps

### Overview

| Stage | Content | Release | Status |
|---|---|---|---|
| 1 | Walking skeleton and deployment | 1 | done |
| 2 | Accounts, roles and access | 1 | done |
| 3 | RSVP and waiting page | – | done |
| 3.5 | Installable app (home screen icon, no browser chrome) | 1 | done |
| 3.9 | Findings from the Release 1 pilot | 1 (updates) | next |
| 4 | Content and website | Opening | open |
| 5 | Game world and world importer | Opening | open |
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

### Stage 3 – RSVP and Waiting Page

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
Requirements: ACS-14, SEC-09, SEC-05 (the Markdown renderer, added to this line on 2026-11-13).

**3e – Sign-in by email** (added 2026-11-10). The login accepts a verified email address as well as the username; an address can be verified by one account only (`409 email_taken`).
Requirements: ACC-16.

**3g – Guest pages in the mock style** (added 2026-11-11 after an audit of Release 1 against the mocks; built before the go-live; the pages without a mock are drawn in 3g and built in 3h). Every page a guest sees before the opening is built from its mock (layout, flow, texts, UX decisions in mocks/README.md); until now only the waiting page, the RSVP content and the admin area follow the mocks, the pages of stage 2 are plain forms.
- **Shared look:** one stylesheet with the mock's neutral tokens (colours, type, spacing, buttons, fields, cards, tags) for the guest-facing pages, so stage 4's `theme.json` replaces values in one place; the RSVP wizard and the waiting page use it instead of borrowing the admin look. Two shells from the mock: `bare` (brand header with event name and date, one column, "Datenschutz" link below) and `flow` (close button, title, step counter and progress bar, sticky action bar).
- **Pages and their mock screens:**
  - `/login` → `login` (field "Benutzername oder E-Mail" with its hint, "Passwort vergessen?", card "Noch kein Konto? Einladung einlösen", Datenschutz link).
  - `/invite` → `invite-code` (code field, QR tip, "Schon ein Konto? Anmelden").
  - `/invite/:code` → `invite-register` with its variants: valid code (greeting by guest name, invitation card with the code), already redeemed, expired / revoked / replaced, and the signed-in user without `vip` who only redeems.
  - `/forgot-password` → `forgot` (form, "Schau in dein Postfach" after submitting, hint about the hosts' reset link).
  - `/datenschutz` → `privacy` (bare shell, Markdown text styled like the mock's `m-md`, "Zurück").
  - `/rsvp` and `/admin/rsvp/guests/:id` → `rsvp-parts`, `rsvp-people`, `rsvp-companion`, `rsvp-done` in the flow shell (the admin mode keeps the notice).
  - `/profile` → `profile`, the account part for Release 1 (username, email with verification tag and "Bestätigen", "Passwort ändern", "Abmelden", "Konto löschen" with a second step); the person switcher, photo, greeting, figure, finds and contributions come with their features. For restricted guests the header has no website navigation and a way back to the waiting page (decided 2026-11-11).
  - `/set-password/:token`, `/verify-email/:token`, the 404 page and the "not set up yet" page (mock `admin-setup`, variant "everyone else"): the first three have no mock yet; Claude draws them into `zappaloo-mocks.html` first (setup link and reset link variants with the finished state, verification success and failure, not found) and the project owner confirms them before they are built.
- **Differences between the mock and the built forms to settle before building** (the requirement wins and the mock is fixed, CLAUDE.md): the registration form (mock: display name, username suggested from the guest name, password, optional email, no repeated password; built: username, display name, password and a repeat; UX decision 45 first proposed the email as required when redeeming; decided: optional, no repeated password, mocks/README.md decisions 2, 45 and 57) and the sign-in field text before 3e makes email sign-in work.
- Tests: the existing component tests keep their requirement IDs and follow the new texts; end-to-end tests use the texts from `common.json`; a test per page checks the Datenschutz link (SEC-09) and a narrow-viewport run checks that nothing is cut off (iPhone and Pixel profiles).
Requirements: none new.
Re-verified (requirements of earlier steps, not planned here again): ACC-01, ACC-03, ACC-04, ACC-07, ACC-09, INV-03, INV-04, INV-07, SEC-09, RSVP-01 and the other requirements of these pages.

**3h – Set-password, confirm-email and not-found pages** (added 2026-11-11). Built from the three mock screens drawn in 3g (`set-password` with setup, reset, saved and invalid-link variants; `verify-email` with ready, confirmed, invalid and address-taken variants; `not-found`) after the project owner has confirmed them; UX decision 57 (one password field with an eye button, no repeated field) applies to the set-password page. The pages sit in the `bare` frame already; this step gives them their content and styling and updates their tests.
Requirements: none new.
Re-verified: ACC-03, ACC-08, ACC-09, ACC-10, ACC-14, ACC-15, ACC-16.

**3i – Fixes from the stage-3 review** (added 2026-11-11, before 3f). Answers stay in line with the invitation whichever way it changes (invitation row, account panel, deleted part), a part added later is not answered yet, and a lost last yes resets to "ohne Antwort"; revoking `vip` deletes the RSVP and companions after a second click (sw-architecture.md 7.4.1). The closed-platform list matches whole route names and a test walks every route (10.4); the platform opens only through its own route; one reminder round per event every 10 minutes; one login lockout per account (7.1.1); the Markdown renderer removes forms, styles and images from other sites (SEC-05). Also: stale companion edits in the wizard, missing styles, the badge and the waiting page read counts instead of the whole overview, the "Zuletzt" card lists invited-part changes, the mock's "Konto anlegen" has no part chips (UX decision 53), and the tests 3g asked for (Datenschutz link on every page, phone widths, the door glimpse).
Requirements: none new.
Re-verified: RSVP-02, RSVP-05, RSVP-07, RSVP-09, RSVP-10, ACS-10, ACS-12, ACS-14, ACC-16, SEC-02, SEC-09, SEC-11, DATA-05.

**3f – Release 1 go-live** moved to stage 3.5 (step 3.5f, decided 2026-11-11): Release 1 now includes the installable app.

### Stage 3.5 – Installable App (completes Release 1)

Added 2026-11-11. Guests add the site to the home screen of iOS and Android with the event's icon and open it like a native app, without browser bars (sw-architecture.md 19.5, PWA-01 – PWA-05). Numbered 3.5 so that stages 4–10 keep their numbers. Branch `feature/stage-3.5` (CLAUDE.md compares the stage number exactly, so `stage-3` does not match).

**Before the stage starts:**
- Stage 3 is complete (3a – 3e, 3g, 3h committed).
- The project owner provides the event's icons (19.5: `icon-192.png`, `icon-512.png`, optional `icon-maskable-512.png`, `apple-touch-icon.png`), or accepts the built-in default icon for Release 1.
- To confirm with the project owner: icons are supplied as finished PNGs (no image processing, no new dependency); the manifest colours are neutral defaults until `theme.json` exists (stage 4); no service worker, so no offline cache (19.5).

**Steps:**

**3.5a – Manifest and icons.** `GET /manifest.webmanifest` (public, also while the platform is closed, outside `/api`) with the event's name, `display: "standalone"`, `start_url` and `scope` `/`, language, colours and icons; `GET /app-icons/<file>` serves the event's icons from `$DATA_DIR/events/event1/icons/` with validation (PNG, exact size) and a built-in default set when a file is missing or invalid. Both routes are reachable through Caddy (deployment test). Tests: manifest content, icon fallback, access while closed and without sign-in.
Requirements: PWA-01, PWA-02.

**3.5b – Page head and safe areas.** `index.html` gets `apple-touch-icon`, `theme-color`, the iOS app title, `apple-mobile-web-app-capable`, the status bar style and `viewport-fit=cover`; the guest shells (`bare`, `flow`), the waiting page with its door scene, the profile and the admin area respect `env(safe-area-inset-*)`; in standalone mode every page offers a way back, because there is no browser back button. Playwright checks the tags and, with standalone display mode emulated, that no content sits under the insets.
Requirements: PWA-03, PWA-04.

**3.5c – Install hint.** UX mock first (screens `install` and `waiting` variant "Install hint", card "App" in `profile`; UX decision 60, confirmed 2026-11-11), then the build: the strip on the waiting page (hidden with × on this device), the card in the profile and the page `/install`, only in a mobile browser and never in the installed app; on Android a button that triggers the browser's install prompt (the browser menu steps without one), on iOS the steps of the Share menu; a note that the app asks for the password once more (iOS keeps separate storage for it).
Requirements: PWA-05.

**3.5d – Footer with copyright and license notice** (added 2026-11-11, sw-architecture.md 19.6). UX mock first (the footer on `login`, `waiting`, `profile` and the admin area; card "Fusszeile" in `admin-settings`; the `/license` page), decision in mocks/README.md. Then: copyright line in the database with a default of `© <year> <event name>`, edited in Einstellungen and audited without the text; `GET /api/site` gains `copyright` and `sourceUrl`; the footer shows the line, the AGPL-3.0 sentence (language keys) and "Source code" / "License" below "Datenschutz · Version"; public page `/license` with the `LICENSE` file, copied into the image; `SOURCE_URL` in the deployment bundle's `.env`, the runbook and the deployment test. The repository must be public before the go-live (open point "Make the repository public", OPS-12), otherwise the "Source code" link leads nowhere.
Requirements: LIC-01, LIC-02, LIC-03.

**3.5e – Device check** with the first release candidate on staging (decided 2026-11-11). Manual test protocol on real devices (test-strategy.md, section 6.1): iOS Safari and Android Chrome add the site, show the event's icon and name, open without browser bars; sign-in after the install; safe areas on a device with a notch.
Also: manifest and icons through Caddy on staging (the deployment test). The result is recorded in the manual test protocol; until then PWA-01 – PWA-05 are on the "not yet tested" list in test-strategy.md, section 5.
Requirements: PWA-01 – PWA-05 (verified on staging and on devices).

**3.5f – Release 1 go-live** (after 3.5a – 3.5e; formerly 3f). First release promoted and deployed to production on the operator's host; Let's Encrypt and live updates through Caddy checked there (manual test protocol); invitation print export checked end to end, privacy notice reviewed, home screen install checked on the production host, manual checks from the release checklist that apply to Release 1.
Checked with the released version on prod (decided 2026-11-11): LIC-03 and OPS-02 stay on the "not yet tested" list until then. When Release 1 works on prod and stage 4 starts, the lists are cleared (test-strategy.md, section 5).
Requirements: OPS-02, LIC-03 (verified on prod).

### Stage 3.9 – Findings from the Release 1 Pilot

Added 2026-11-12 after running v1.0.2 on prod. The decisions are in sw-architecture.md 7.1.2, 7.4.2, 8.3 and 9.6.1 and in mocks/README.md. Numbered 3.9 so that stages 4–10 keep their numbers. Branch `feature/stage-3.9`. Each step can go to prod as a Release 1 update. Prod holds real guest data, so every migration is checked against a copy of the prod backup on staging before it is promoted.

**Before the stage starts:**
- Stage 3.5 is complete and merged; `feature/stage-3.9` starts from it (done 2026-11-12).
- The decisions of 2026-11-12 are written into the spec (this plan, 7.1.2, 7.4.2).
- *Decided 2026-11-12:* with approval off, the guest removes an added accompanying person until the deadline, and the admin removes one in Rückmeldungen at any time (7.4.2, step 3.9c).
- *Decided 2026-11-12:* a blocked user gets the same "Benutzername oder Passwort falsch" as for a wrong password (7.1.2, step 3.9e).

**Steps:**

**3.9a – Fixes from the pilot.** Rückmeldungen no longer moves sideways on a swipe on iOS and Android: its tables scroll inside their own box (checked for every admin page at phone width). The account panel shows the "Eingeladen zu" chips for every account with `vip`, also when it has `staff` or `admin` and right after "Konto anlegen". The footer reads "Datenschutz · Version x.y.z" (19.6). Tests: a Playwright run at phone width that a horizontal swipe does not scroll any admin page. A component test for the chips with combined roles. The footer text.
Requirements: none new.
Re-verified: RSVP-02, RSVP-05, SEC-09, OPS-08.

**3.9b – Program item instead of part.** "Programmpunkt" in every text (i18n keys, mocks, e-mails, CSV headers), `programItem` in code, `/program-items` in the API, tables and columns renamed by a Drizzle migration (`event_parts` → `program_items`, `membership_parts`, `invitation_parts`, the `part_id` columns). Audit action names of existing entries are migrated too, so "Zuletzt" still reads them. No behaviour changes.
Requirements: none new.
Re-verified: RSVP-01 – RSVP-10, DATA-05 and the migration check against the latest release's schema.

**3.9c – RSVP settings.** Mock first: `rsvp-parts` with one answer per person, `admin-settings` card Rückmeldung with the two switches, `rsvp-companion` with "Begleitperson hinzufügen" with and without approval. Then: switch "Pro Programmpunkt zusagen" (off by default), one answer stored for every invited program item, program items added later take the existing answer. (The planned warning about mixed answers when switching was dropped while building: the setting has one short sentence.) Switch "Begleitpersonen bestätigen" (off by default), switching off approves pending requests after a confirmation, badge and tile only with approval on. Texts "hinzufügen". The guest removes an added person until the deadline (approval off), the admin removes one in Rückmeldungen. The migration sets both switches to their defaults, so pending requests on prod are approved by the update.
Requirements: RSVP-11, RSVP-12. RSVP-01, RSVP-08, RSVP-09, RSVP-10 (reworded).

**3.9d – Every invited person has an account.** Mock first: `invite-register` (activates the account, variant for a signed-in account without `vip`: "zu deinem Konto hinzufügen"), `profile` (the confirmation of "Konto löschen" says what stays), `admin-invitations` (revoke with "Widerrufen und Gast entfernen"), `admin-rsvp` (inactive guests as "ohne Antwort"). Then: `users.status` and a nullable username. Creating an invitation creates its inactive account (`invitations.user_id`, program items on the membership only). Registration activates it. Merge into a signed-in account without `vip`. Revoking the last open invitation of a never-activated account deletes it (INV-20). Deleting an account deletes its invitations. A guest's own deletion keeps the guest-list entry as inactive. Inactive accounts cannot sign in and get no reminder. New default privacy text. The migration of existing data (7.1.2). Tests include the concurrency test of redemption (INV-08) with the account, the merge, the migration on a database with v1.0.2 data, and the sign-in refusal of inactive accounts.
Requirements: ACC-17, INV-20.
Re-verified: ACC-01, ACC-07, ACC-09, ACC-12, INV-03, INV-07, INV-08, INV-10, RSVP-07, RSVP-09, SEC-09.

**3.9e – Konten & Rollen and Einladungen.** Mock first: `admin-users` (columns Benutzername | Name | Status | Rollen | Fähigkeiten, filter chips, panels for inactive, active and blocked accounts, "Konto anlegen" with program item chips), `admin-invitations` ("Aufräumen (n)"). Then: the table and filters, panel per state with locked roles while inactive, block and unblock (sessions and links end), "Konto löschen" for admins, "Konto anlegen" creates an inactive account and requires program items with `vip`, "Aufräumen" deletes revoked and replaced invitations.
Requirements: ACC-18, ACC-19, ACC-20, INV-21, INV-22 (INV-22 added 2026-11-13: deleting a redeemed invitation whose account is gone, with "Löschen" in the actions column of Einladungen, beside "Neu erzeugen" and "Widerrufen"; second click "Endgültig löschen").
Re-verified: ACC-08, ACC-10, ACC-14, ROLE-01, ROLE-09.

**3.9f – Person types.** Mock first: `admin-invitations` (type per batch, one letter per row), `admin-users` (type in the panel), `rsvp-companion` (type chips, required), `rsvp-people` (optional menu for a child), `admin-rsvp` (totals by type, column "Typ"). Then: `person_type` on memberships and companions (adult for existing data), the menu rule takes the type, totals, guest table and CSV by type.
Requirements: RSVP-13, RSVP-14, RSVP-15.
Re-verified: RSVP-03, RSVP-05.

**3.9h – Fixes from the stage-3.9 review** (added 2026-11-12, before 3.9g). A guest whose card was replaced before the update can be deleted and uninvited (an old replaced code no longer blocks it). The single bar "Übersicht" counts persons instead of the first program item (`personTotals`), with the text "42 ja (37 Erwachsene, 5 Kinder) · 3 nein". The merge takes over the person type and survives a shared group. A blocked account gets no reset mail, no link from an admin and no reminder, and a session counts only for an active account. An inactive account an admin created gets "Neuen Einrichtungslink erstellen". A child's menu can be left open again. Smaller fixes in Rückmeldungen, Konten & Rollen, Einladungen (column order as in the mock, no double requests) and the invitation page. Tests: API and component tests for each fix, a Playwright flow for blocking, deleting, revoking with removal and "Aufräumen", one for the merge, and the guest's answer page in the phone-width check.

**3.9g – Update on prod.** Image build and deployment test. Staging restored from the latest prod backup and updated, so the migrations run on real data (OPS-13). Release candidate, promotion and deployment to prod with the pre-deploy backup. Manual checks on a phone (swipe, RSVP with one answer, adding a companion, redeeming a card for a pre-created account). The admin copies the new "Löschen" paragraph into the privacy notice on prod (7.1.2), because an edited notice keeps its text. Status report for stage 3.9.
Requirements: none new.

### Stage 4 – Content and Website

Replanned 2026-11-13 after a review of the plan against stages 3 to 3.9 and a clearer picture of "event configuration and content" (sw-architecture.md 19.1.1). Branch `feature/stage-4`.

**Before the stage starts:**
- Stage 3.9 is complete, and step 3.9g (update on prod) is done. The "not yet tested" list in test-strategy.md, section 5, is cleared (done 2026-11-13: the device and prod checks of stage 3.5 are recorded in the manual test protocol).
- The project owner confirms the proposals below.
- Texts for the first event's pages (at least drafts) and a theme package for the first event (icons, colours, fonts). Both are needed for the Opening, not for building the steps. The steps use test data.

**Decisions from the plan review (2026-11-13):**
- **Four channels** shape an event: the admin area, the theme package, the world package and the feature data (19.1.1). Copying an event to another installation is out of scope.
- **Pages start empty.** A fresh installation has no content pages, and nothing is seeded (WEB-02 reworded).
- **No access conditions on pages** in stage 4. The page for manual releases (ACS-05) moves to step 5b.
- **Images are uploaded** in the editor (CNT-06). A map on a page is an uploaded picture with the link "In Google Maps öffnen". Nothing is embedded from Google.
- **Places** are their own records (CNT-07), edited in Inhalte. Program items and pages refer to them.
- **The program items are the schedule** (WEB-07 reworded). They stay in Einstellungen and gain an optional end time. The content editor has no "Programm" entry.
- **Navigation shows only what exists.** The tabs Hochladen and Erinnerungen and the cards for seating, quiz and the game world come with their stages.
- **Privacy notice, waiting-page texts and footer line** stay in Einstellungen, outside the content base.
- **Theme package** (19.7, THM-01 – THM-05): app icons, `theme.json` and fonts come as one `tar.gz` that an admin imports. The format is versioned, a validator checks it, and only whole packages are applied. The admin can return to the default theme. There is no download. The app icons leave the data volume folder (PWA-02 reworded).
- **World package** (14.4, stage 5): the map importer becomes a world importer. One package holds maps, tilesets, objects, the door scene and the avatar editor assets, all or nothing. Dialogues and NPC texts are edited in the browser. The view "Spielwelt" keeps assigning the actions.
- **CNT-02 and CNT-03 are partially implemented** after stage 4 (test-strategy.md, section 5). Dialogues, NPC texts and the reference from a game object follow in step 5d, albums in step 7d.
- **SEC-05** was delivered with the privacy notice (steps 3d and 3i) and leaves the "not yet implemented" list. Stage 4 reuses the renderer.
- **CFG-01 and CFG-04 get tests** (step 4f).

**Proposals to confirm before the stage starts** (written into the spec as proposed):
- The fields of `theme.json` and the validator's limits (19.7): seven colours, two optional fonts, WOFF2 only, 10 MB per package, a contrast check.
- The theme changes the website and the guest pages. The admin area keeps its neutral look.
- Content images: JPEG, PNG and WebP up to 10 MB, stored as uploaded, without resizing in stage 4 (6.2).
- A page lists its places as cards next to the text (6.2).
- The date in the header of the public pages (UX decision 58) is the day of the earliest program item.
- After the update that brings step 4e, prod shows the default app icon until a theme package is imported. The project owner imports one right after the update.

**Steps:**

**4a – Content base and editor.** Mock first: `admin-content` (page list with order and "In «Mehr» sichtbar", title, Markdown with preview, "Veröffentlichen", the start page text, no "Programm" entry).
- Pages with slug, title, a text per language key, visibility and position. The start page text. API for reading (signed-in users) and editing.
- Editing needs the admin role or `staff` with `editWebsiteContent`. The admin area gets the entry "Inhalte", which such a staff member also reaches.
- Changes are audited with ids only and appear on the card "Zuletzt".
- The existing Markdown renderer (SEC-05) shows the preview and the pages.
Requirements: CNT-01, CNT-02, CNT-03, CNT-04, CNT-05, LANG-02.
Follow-up from stage 2: the content routes use `requireCapability("editWebsiteContent")` and get `[ROLE-06]` and `[ROLE-07]` tests.
Re-verified: SEC-05, DATA-05.

**4b – Images and places.** Mock first: the image button and image list in `admin-content`, a places list and form in Inhalte, the place card on `info`.
- Image upload with the checks of 6.2 (type by content, size). Images are stored in `$DATA_DIR/events/event1/content/` and served to signed-in users. The renderer accepts images of the installation and still removes others.
- Places with name, address, Google Maps link and map image. A page lists places.
- Program items refer to a place. A migration turns the existing place texts into places. It is tried with a copy of the prod backup on staging, like the migrations of stage 3.9. Einstellungen › Rückmeldung picks the place from the list.
Requirements: CNT-06, CNT-07.
Re-verified: RSVP-01, RSVP-05 (the place of a program item), SEC-05.

**4c – Website.** Mock screens: `home` (variant "Before the event"), `info`, `more`.
- The website frame: bottom tab bar on phones and top navigation on desktop, with Start, Programm and Mehr. Later stages add their tabs.
- Start page with the welcome text, the RSVP card and shortcuts to the pages. Content page `/p/<slug>`. "Mehr" with the visible pages in the admin's order, the profile, Verwaltung and Inhalte for those who may use them, Datenschutz and Abmelden.
- Until stage 5, a signed-in user of an open platform lands on the start page. Restricted guests of a closed platform still see only the waiting page. The new routes join the closed-platform list and its test that walks every route (10.4).
- No part of the website loads Phaser. The pages work at phone, tablet and desktop widths.
Requirements: WEB-01, WEB-02, WEB-03, WEB-04.
Re-verified: ACS-10, SEC-09.

**4d – Programme and "now / next".** Mock screens: `programme` (all three variants), `home` (variant "Event day"), `admin-settings` (card Rückmeldung with the end time).
- Program items gain an optional end time.
- The programme page shows the program items the guest is invited to as a timeline, with the line that says so. On the event day past entries are greyed out and the current one is marked.
- The start page shows the current and the next program item on the event day, in the event's time zone. A change by the admin shows at once. "Hingehen" follows in step 5d (WEB-08).
- The header of the public pages shows the event's date.
Requirements: WEB-07, WEB-09.

**4e – Theme package.** Mock first: card "Design" in `admin-settings` (active theme, import, findings of a refused package, "Standard-Design verwenden").
- Import with the validator of 19.7, all or nothing. The return to the default theme. Audit entries.
- The guest stylesheet reads its colours and fonts from the theme. `GET /api/site` carries the theme. Fonts are served from the installation.
- The app icons and the manifest colours come from the theme. The folder `icons/` in the data volume is no longer read.
- An example theme package in the repository, built by a script, for dev, tests and as a template for the project owner. The runbook describes the package.
- Tests: one per validator rule with a broken package, the unchanged theme after a refused import, the import and the return to the default end to end.
Requirements: THM-01, THM-02, THM-03, THM-04, THM-05.
Re-verified: PWA-01, PWA-02, PWA-03.

**4f – Generic core and stage report.**
- CFG-01: a test shapes two fresh installations of the same build differently (name, theme package, pages, program items) through the admin API alone and checks that each serves its own. A check that the source holds no event-specific names or texts outside the example event and the tests.
- CFG-04: tests that two installations with their own data folders share nothing, that every event-related record carries `event1`, and that no second event can be created.
- Status report for stage 4.
Requirements: CFG-01, CFG-04.

### Stage 5 – Game World and World Importer

**Before the stage starts:**
- The layout of the world package is defined and confirmed (sw-architecture.md 14.4): maps, tilesets, objects, door scene, avatar editor assets, format version.
- The project owner provides a first world package (or the template world), with maps drawn in Tiled.

**Steps:**

**5a – Phaser foundation.** Top-down rendering, tile and object layers, portals between maps.
Requirements: GAME-01, GAME-03, MAP-02.

**5b – World importer** (replanned 2026-11-13). Import of a whole world package at runtime (maps as Tiled JSON, tilesets, objects, door scene, avatar editor assets), validation of the whole package, warnings for presets that point to missing pages, content items or minigames, the previous package kept for a rollback, refreshed graphics on the next map entry. The waiting page takes its door scene from the world package.
Requirements: MAP-01, MAP-04, MAP-05, MAP-06, MAP-08, MAP-09, MAP-10, MAP-16.
Follow-up from stage 2: map loading and protected game areas checked on the server, with `[ACS-07]` tests. The admin page for manual releases (ACS-05, sw-architecture.md 8.3).
Re-verified: ACS-12.

**5c – Movement and controls.** Smooth movement with map collisions, arrow keys on desktop, tap-to-move with pathfinding on touch devices, suitable for all screen sizes.
Requirements: GAME-02, GAME-07, GAME-09, GAME-10.

**5d – Objects and overlays.** Object types `portal`, `clickable`, `decoration` and their properties; clickable objects that sparkle, walking to an object's approach point and running its action (page overlay, content item, dialogue, minigame), Enter or Space on desktop; portals as wobbling arrows; easter eggs; website pages as overlays above the paused game; "Go there" from the schedule; admin view "Spielwelt" to assign the actions per map.
Requirements: GAME-04, GAME-05, GAME-06, GAME-08, GAME-11, GAME-15, GAME-16, MAP-03, MAP-15, WEB-08.
Follow-up from stage 4: dialogues and NPC texts as content items edited in Inhalte, and a game object that shows a content item by `contentId`, with `[CNT-02]` and `[CNT-03]` tests.

**5e – Avatars and entering the game.** Avatar editor with the assets of the world package; landing in the game after sign-in; guided first entry with the hint about sparkling objects; button bar at the top with RSVP badge; own avatar opens the profile; first map playable within 5 seconds over 4G.
Requirements: AVA-01, AVA-02, AVA-03, GAME-12, GAME-13, GAME-14, GAME-17, GAME-18, PERF-04.

**5f – Template world.** Church, garden, banquet hall and party area with decoration on separate layers, shipped as a world package that the admin imports in the world importer.
Requirements: MAP-12, MAP-13, MAP-14.

### Stage 6 – Living World (completes the Opening)

**Before the stage starts:**
- Seating plan of the first event, at least as test data.

**Steps:**

**6a – Wandering figures.** Figures of attending guests in the wander areas of the maps of their program items; own avatar instead of own figure; simulated per device.
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
Follow-up from stage 4: albums as part of the content base, with a `[CNT-02]` test.

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

### Stage 3 – RSVP and Waiting Page (2026-11-12, written after the stage)

**Summary:** Guests redeem their card, answer the RSVP with accompanying persons, menu, allergies and song wish, and wait at the door scene until the hosts open the platform. Admins manage program items, menus and the deadline, follow the answers in Rückmeldungen (guest table, CSV, reminders), open and close the platform and edit the privacy notice. Guests sign in with a username or a verified email address, and every Release 1 page follows the mocks.

**Steps:** 3a RSVP – done. 3b Accompanying persons – done. 3c Closed platform and waiting page – done. 3d Opening and privacy notice – done. 3e Sign-in by email – done. 3g Guest pages in the mock style – done (added). 3h Set-password, confirm-email and not-found pages – done (added). 3i Fixes from the stage-3 review – done (added). 3f Release 1 go-live – moved to stage 3.5 (3.5f).

**Requirements:** 19 of 19 planned for this stage (RSVP-01 – RSVP-10, ACS-10 – ACS-14, ACC-16, SEC-09, SEC-11, DATA-05), all with passing tests (requirement report). Overall: 96 of 232 active requirements (stage 3.9 adds 11 on 2026-11-12).

**Tests:** see the report of stage 3.5 (one test run on 2026-11-12 covers both stages). No manual checks belong to stage 3; the go-live checks moved to 3.5f.

**Spec changes and deviations:** plan review against the mocks (countdown optional, closing again, menu tied to the meal item, admin changes through the guest table, approved companions editable by their VIP, invited program items for admin-made VIPs, privacy notice page); sign-in by email (ACC-16, step 3e); the guest pages built from the mocks (3g, 3h); answers follow invitation changes and revoking `vip` deletes the RSVP (3i, 7.4.1); the go-live moved to stage 3.5 because Release 1 includes the installable app.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | next |
| 4 – 10 | Opening, Event-ready, After the event | open |

**Remaining requirements by stage:** see the report of stage 3.5.

**Waiting on the project owner:** see the report of stage 3.5.

**Risks and notes:** none beyond the report of stage 3.5.

### Stage 3.5 – Installable App (2026-11-12, written after the stage)

**Summary:** Guests add the site to the home screen of iOS and Android and open it full screen with the event's icon and name; a hint in the mobile browser shows how. Every page with the footer carries the admin's copyright line, the AGPL-3.0 sentence and links to the source code and the license. Release 1 runs on prod (v1.0.2).

**Steps:** 3.5a Manifest and icons – done. 3.5b Page head and safe areas – done. 3.5c Install hint – done. 3.5d Footer with copyright and license notice – done. 3.5e Device check and 3.5f Release 1 go-live – done on prod (v1.0.2), but not recorded in the manual test protocol yet. Fixes after the go-live: staging starts without a mail password, pages no longer zoom in on a focused field, the guest table keeps its edit button in its own column, an email link opened while signed in no longer reports an expired session.

**Requirements:** 8 of 8 planned for this stage (PWA-01 – PWA-05, LIC-01 – LIC-03) with passing automated tests. PWA-01 – PWA-05, LIC-03 and OPS-02 stay on the "not yet tested" list (test-strategy.md, section 5) until the device and prod checks are recorded. Overall: 96 of 232 active requirements, all with passing tests; 136 not yet implemented.

**Tests:** 2026-11-12 on `feature/stage-3.9` (spec changes only since v1.0.2): Vitest 632 tests in 63 files passed (651 results in the report, 603 tagged); Playwright 67 passed and 17 skipped by design (tests that run on one browser profile only), none failed; requirement report OK. Manual: OPS-05 only (2026-11-10); the device checks of 3.5e and the prod checks of 3.5f have no rows yet.

**Spec changes and deviations:** footer with copyright and license notice added to the stage (19.6, LIC-01 – LIC-03); the device check runs with the first release candidate on staging, the prod checks with the released version; the go-live (formerly 3f) is step 3.5f. After the go-live the pilot produced stage 3.9 (2026-11-12).

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | next |
| 4 | Content and website | open |
| 5 | Game world and map importer | open |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (requirement report; it counts stages 3.5 and 3.9 under stage 3): stage 1 → 2 (OPS-12, OPS-13: manual checks); 3 → 12 (OPS-02 and the 11 of stage 3.9); 4 → 15; 5 → 36; 6 → 14; 7 → 30; 8 → 22; 9 → 1; 10 → 4. In total 136 of 232 active.

**Waiting on the project owner:**
- Record the checks of 3.5e (iPhone and Android: icon, name, no browser bars, safe areas, sign-in after install, hint) and 3.5f (Let's Encrypt and live updates on prod, the source link of a public repository) as rows in the manual test protocol; then OPS-02 leaves the "not yet implemented" list and the "not yet tested" list is cleared (a precondition of stage 4).
- Before step 3.9c reaches prod: decide pending companion requests on prod if they should be reviewed, because the update approves all pending ones (approval off by default).

**Risks and notes:**
- Prod holds real guest data and stage 3.9 changes the schema in several steps (rename, accounts per invitation, person types); each migration is tried on staging with a copy of the latest prod backup before promotion (3.9g).
- The requirement report's stage table reads whole stage numbers only, so stages 3.5 and 3.9 appear under stage 3.

### Stage 3.9 – Findings from the Release 1 Pilot (2026-11-12, written after the code steps)

**Summary:** Guests answer the RSVP once for all their program items and add companions without waiting for approval. Every invited person is on the guest list from the moment the invitation is created. Admins see the state of each account, can block and delete accounts, clean up old invitations and give every person a type. The update to prod (step 3.9g) is still to do and needs the project owner.

**Steps:** 3.9a Fixes from the pilot (phone swipe, footer) – done. 3.9b Program item instead of part – done. 3.9c RSVP settings – done. 3.9d Every invited person has an account – done. 3.9e Konten & Rollen and Einladungen – done. 3.9f Person types – done. 3.9h Fixes from the stage review – done. Review rounds between the steps changed texts and layout (see below). 3.9g Update on prod – the image builds and the app starts healthy with all 12 migrations. The smoke test and 9 of 19 deployment tests cannot pass in this devcontainer (see risks). Staging restore with a prod backup, release candidate, prod deployment, phone checks and the privacy paragraph wait for the project owner.

**Requirements:** 11 of 11 planned for this stage (ACC-17 – ACC-20, INV-20, INV-21, RSVP-11 – RSVP-15) with passing tests. RSVP-01 and RSVP-08 – RSVP-10 are reworded and re-verified. Overall: 107 of 232 active requirements, all with passing Vitest and Playwright tests. 125 are not yet implemented.

**Tests:** 2026-11-12 on `feature/stage-3.9`: Vitest 696 tests passed (715 results in the report, 667 tagged). Playwright 74 passed and 22 skipped by design, none failed (numbers after the review fixes of step 3.9h). The requirement report is OK without the deployment results. With them it reports 11 requirements as failed, because 9 deployment tests fail in this devcontainer (see risks). Migration check OK for all 12 migrations, including tests with data for 0008 (rename), 0009 (RSVP settings), 0010 (accounts per invitation) and 0011 (person types). Deployment test: 10 of 19 passed. The 9 failures show empty output from `docker run` and `docker compose exec` in this devcontainer. An image built from the commit before stage 3.9 behaves the same, so the cause is not this stage. Manual: OPS-05 only.

**Spec changes and deviations:** The decisions are in 7.1.2, 7.4.2 and 8.3 of sw-architecture.md and in the UX decisions of the mocks. Changes made while building:
- The warning about mixed answers next to "Pro Programmpunkt zusagen" is gone. The setting has one short sentence.
- The RSVP uses "Ja" and "Nein" for the one answer. Step 3 has no instructions around the companions and the song.
- Roles are locked only for inactive accounts that have an invitation. An account an admin created keeps its roles editable.
- Revoking the code of a guest who never registered removes the guest, so the status "Widerrufen" survives only on old data.
- A child who left the menu open is not counted in the menu totals. There is no type baby.
- The stage review (step 3.9h) found that a guest whose card was replaced before the update could not be deleted or uninvited, and that the single bar "Übersicht" showed the first program item only. Both are fixed. The review's decisions are in 7.1.2 and 7.4.2: a blocked account gets no mail and no new link, an inactive account an admin created gets a new setup link, a promoted guest who deletes the account stays on the guest list.
- The migrations now run with foreign keys off and are checked afterwards, because SQLite rebuilds the users table to make the username optional.
- Texts use short, full sentences without semicolons. This holds for German texts and English notes alike. Older parts of the spec outside stage 3.9 still contain semicolons.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | next (3.9g) |
| 4 | Content and website | open |
| 5 | Game world and map importer | open |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (requirement report, stages 3.5 and 3.9 count under stage 3): stage 1 → 2 (OPS-12, OPS-13: manual checks). Stage 3 → 1 (OPS-02). Stage 4 → 15. Stage 5 → 36. Stage 6 → 14. Stage 7 → 30. Stage 8 → 22. Stage 9 → 1. Stage 10 → 4. In total 125 of 232 active.

**Waiting on the project owner:**
- Update prod with Release 1 update (step 3.9g). Restore the latest prod backup on staging and update it, so the migrations run on real data. Then promote a release candidate and deploy to prod with the pre-deploy backup.
- The update approves all pending companion requests on prod, because approval is off by default. Review them first if needed.
- Check on a phone after the update: no sideways swipe, RSVP with one answer, adding a companion, redeeming a card for a pre-created account.
- Copy the new paragraph "Löschen" of the default privacy text into the notice on prod, because an edited notice keeps its text: "Du kannst dein Konto jederzeit im Profil löschen. Deine Rückmeldung (mit Begleitpersonen und Allergien) bleibt für die Organisation bei den Gastgebern. Wenn du sie auch gelöscht haben willst, schreib ihnen. Nach dem Fest löschen wir alle persönlichen Daten."
- Record the device checks of 3.5e and 3.5f in the manual test protocol. This clears OPS-02 and the "not yet tested" list, which is a precondition of stage 4.

**Risks and notes:**
- Migration 0010 rebuilds the users table. The migrator now runs with foreign keys off and checks them afterwards. A violation cannot be rolled back at that point, so the pre-deploy backup is the safety net. Try it on staging with the prod backup first.
- In this devcontainer, foreground `docker run` and `docker compose exec` lose the output of our CLI. The smoke test of the image and 9 deployment tests fail because of it, also on the commit before stage 3.9. Detached containers work. Run the image build and the deployment test on the CI runner or another machine before the release candidate.
- The requirement report's stage table reads whole stage numbers only, so stages 3.5 and 3.9 appear under stage 3.

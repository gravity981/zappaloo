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
| 3.9 | Findings from the Release 1 pilot | 1 (updates) | done |
| 4 | Content and website | Opening | done |
| 5 | Game world and world importer | Opening | done except 5l (review findings), next |
| 6 | Living world | Opening | open (after 5l) |
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
- Stage 3.9 is complete, and step 3.9g (update on prod) is done (confirmed by the project owner on 2026-11-13). The "not yet tested" list in test-strategy.md, section 5, is cleared (done 2026-11-13: the device and prod checks of stage 3.5 are recorded in the manual test protocol).
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
- **World package** (14.4, stage 5): the map importer becomes a world importer. One package holds maps, tilesets, objects, the door scene and the avatar editor assets, all or nothing. Dialogues and NPC texts are edited in the browser. The view "Erlebniswelt" keeps assigning the actions.
- **CNT-02 and CNT-03 are partially implemented** after stage 4 (test-strategy.md, section 5). Dialogues and NPC texts follow in step 6d (moved from 5g on 2026-11-17), the reference from a game object to a content page in step 5f (as a page in the overlay), albums in step 7d.
- **SEC-05** was delivered with the privacy notice (steps 3d and 3i) and leaves the "not yet implemented" list. Stage 4 reuses the renderer.
- **CFG-01 and CFG-04 get tests** (step 4f).
- **Start page with a fixed layout** (decided 2026-11-13, during step 4b; sw-architecture.md 5.6, WEB-10, WEB-11, THM-06). The `home` mock showed a countdown card that the plan had left out. Before the event day the start page shows the hero image, the welcome text, the countdown card, the RSVP card and the shortcuts. On the event day it shows "now / next", the feature cards and the shortcuts. The hosts edit the hero image (uncropped, with an alt text), the welcome text and the countdown switch (default on) in the editor of the start page in Inhalte. The countdown counts the days to the first program item and uses the theme's new `display` font, or the heading font without one, not a pixel font. Considered and rejected: elements such as a countdown placed inside the Markdown text, and pages built from blocks.

**Proposals to confirm before the stage starts** (written into the spec as proposed):
- The fields of `theme.json` and the validator's limits (19.7): seven colours, three optional fonts (`display` added 2026-11-13), WOFF2 only, 10 MB per package, a contrast check.
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

**4c – Website.** Mock screens: `home` (variant "Before the event"), `info`, `more`, `admin-content` (variant "Edit start page").
- The website frame: bottom tab bar on phones and top navigation on desktop, with Start, Programm and Mehr. Later stages add their tabs.
- Start page in its fixed layout before the event day (5.6): the hero image, the welcome text, the countdown card, the RSVP card and the shortcuts ("Programm" and the first three pages visible in "Mehr"). The editor of the start page in Inhalte gains the hero image (picked from its images, alt text, "Entfernen") and the switch "Countdown auf der Startseite zeigen" (default on). An image that is the hero image cannot be removed. The countdown is tested with fake timers across midnight in the event's time zone, without program items and with the switch off. Content page `/p/<slug>`. "Mehr" with the visible pages in the admin's order, the profile, Verwaltung and Inhalte for those who may use them, Datenschutz and Abmelden.
- Until stage 5, a signed-in user of an open platform lands on the start page. Restricted guests of a closed platform still see only the waiting page. The new routes join the closed-platform list and its test that walks every route (10.4).
- No part of the website loads Phaser. The pages work at phone, tablet and desktop widths.
Requirements: WEB-01, WEB-02, WEB-03, WEB-04, WEB-10 (before the event day), WEB-11.
Re-verified: ACS-10, SEC-09, CNT-06.

**4d – Programme and "now / next".** Mock screens: `programme` (all three variants), `home` (variant "Event day"), `admin-settings` (card Rückmeldung with the end time).
- Program items gain an optional end time.
- The programme page shows the program items the guest is invited to as a timeline, with the line that says so. On the event day past entries are greyed out and the current one is marked.
- The start page switches to its event-day layout from the start of the day of the first program item (5.6): "now / next" on top, then the shortcuts. The hero image, the welcome text, the countdown and the RSVP card are not shown. "now / next" shows the current and the next program item, in the event's time zone. A change by the admin shows at once. "Hingehen" follows in step 5d (WEB-08).
- The header of the public pages shows the event's date.
- Decided while building 4d (proposed, to confirm): "now" is the latest entry that has started and has not ended (an entry without an end lasts until the next one starts); "next" is the first entry after now. The event day is the calendar day of the first program item in the event's time zone. The start page shortcuts lead to "Programm" first, then to the pages under "Mehr". The mock admin card shows the end time in the list (the mock had no end time).
Requirements: WEB-07, WEB-09, WEB-10 (the event day).

**4e – Theme package.** Split into smaller steps, each committed on its own (decided 2026-11-14; sw-architecture.md 19.7).
Requirements: THM-01, THM-02, THM-03, THM-04, THM-05, THM-06.
Re-verified: PWA-01, PWA-02, PWA-03.
- **4e-1 – Mock.** Card "Design" in `admin-settings`: active theme, import, reset with a second click, findings of a refused package. Done in the mock (no code).
- **4e-2 – Validator.** The package reader (gzip and tar, limits, paths), `manifest.json` and `theme.json` checks, PNG sizes, WOFF2 signature, contrast. Returns all findings. One test per validator rule with a broken package. No storage, no routes.
- **4e-3 – Import and return.** `POST /api/admin/theme` and `DELETE /api/admin/theme`, the table of the active theme (migration), the folder per import, audit entries `theme.import` and `theme.reset` on the card "Zuletzt". A refused package leaves the active theme unchanged. Tests for the import, the return and the unchanged theme after a refusal.
- **4e-4 – Serving.** `GET /api/site` carries the theme; fonts are served under `/theme/fonts/<file>` without sign-in; the guest pages apply the colours and the font faces (the admin area keeps its neutral look); the countdown uses `display` (THM-06).
- **4e-5 – Icons and manifest.** App icons and manifest colours come from the active theme, or from the defaults when there is none. The folder `icons/` in the data volume is no longer read (PWA-02).
- **4e-6 – Card in the admin area.** The card "Design" as in the mock: state, import with findings, reset with a second click.
- **4e-7 – Example and runbook.** A script builds the example package in the repository; the runbook (infrastructure/deploy/README.md) describes the package; an end-to-end test imports the example and returns to the default.

**4f – Generic core and stage report.**
- CFG-01: a test shapes two fresh installations of the same build differently (name, theme package, pages, program items) through the admin API alone and checks that each serves its own. A check that the source holds no event-specific names or texts outside the example event and the tests.
- CFG-04: tests that two installations with their own data folders share nothing, that every event-related record carries `event1`, and that no second event can be created.
- Status report for stage 4.
Requirements: CFG-01, CFG-04.

### Stage 5 – Game World and World Importer

Refined 2026-11-14 with the project owner, before the stage started. Branch `feature/stage-5`. Changed 2026-11-15 to world format 2 (isometric maps, complete figures; see "Format version 2" below); from step 5d.1 on, branch `feature/stage-5-world-v2`.

**Before the stage starts:**
- The layout of the world package is defined and confirmed (sw-architecture.md 14.4). A draft was agreed on 2026-11-14 (below); step 5a writes it into the spec.
- A first world package of the project owner, with maps drawn in Tiled, is needed for the Opening, not for building the steps. Steps 5b to 5k use a test world that a script generates.

**Decisions from the plan review (2026-11-14):**
- **Importer first, then the engine.** The validator, the import and the admin card come before the rendering. The engine is built against the generated test world.
- **Maps are not linked to program items** (changed 2026-11-14 in step 5a, replacing the link in "Erlebniswelt" first agreed): the game world and the schedule are different things. The Tiled map property `programItem` is dropped (MAP-03, 14.2). Each guest's figure walks on one map, picked at random and kept for that guest (PRES-02, 3.6, stage 6). WEB-08 ("Hingehen" from the programme) is withdrawn.
- **Dialogues** belong to the game world. Admins edit them in "Erlebniswelt", tab "Dialoge", not in Inhalte. A dialogue cannot be deleted while an object shows it; its id can be changed (decided 2026-11-14, mock Q63, Q64).
- **Only admins** use "Erlebniswelt" (import, rollback, object actions, dialogues; decided 2026-11-14).
- **No locked maps or zones in stage 5.** Objects with `type = protected` are accepted by the validator and do nothing yet. ACS-07 for maps means: sign-in and an open platform are checked when the world is served. The admin page for manual releases (ACS-05) moves to the first feature that stores access conditions, the treasure hunt (HUNT-05, stage 8).
- ~~**Avatar assets** are layered sprite sheets per part (body, hair, clothing, accessory), drawn in greyscale and tinted from the palettes named in `avatar/avatar.json`.~~ Replaced 2026-11-15 by complete figures (format version 2, below).
- **Partially implemented after stage 5** (test-strategy.md, section 5): GAME-13 without the step "Say hello" (profile photo, greeting, "How I know the couple"), which follows in stage 6; GAME-14 without "Hochladen", which follows in stage 7; GAME-06 without the minigame action, which follows in stage 8. Until then "Erlebniswelt" offers no minigame, and a preset `action = minigame` is reported as a warning.
- **Actions of a clickable object:** `page` opens a full overlay, either a built-in page (`programme`, `rsvp`, `profile`; later stages add theirs) or a content page as `p/<slug>`. ~~`content` shows the text of the content page named by `contentId` (its slug) in a small reading panel, e.g. for a sign.~~ A content page is linked as a page and opens as `p/<slug>` (step 5f, decided 2026-11-17). ~~`dialog` shows a dialogue: a new kind of content item with an NPC name and lines the guest taps through, edited in "Erlebniswelt" and referenced by `contentId`.~~ The action `dialog` comes with step 6d (decided 2026-11-17).
- **Without an active world or with guest access disabled,** a signed-in guest of an open platform lands on the website and has no guest entry point to the Erlebniswelt; the door scene still comes from the data volume (10.4).
- **Guest access** (MAP-19): the admin controls it in Erlebniswelt › Welt & Import. It is enabled automatically on the first successful world import. Disabling it hides guest entry points and blocks direct guest navigation and world-serving routes without removing the active package or the admin's management access.
- **Where a player enters:** the last map is remembered on the device. Otherwise, and when that map no longer exists, the player enters the start map at its spawn point `start`. A portal leads to its `targetSpawn`.

~~**Draft layout of the world package, format version 1** (agreed 2026-11-14; the complete layout, rules and limits are in sw-architecture.md 14.4 since step 5a):~~ Struck through 2026-11-17: format version 1 was never released as a format of its own, and format version 2 replaces it (sw-architecture.md 14.4). The text below is the history of that draft.

```text
world.tar.gz
  manifest.json   { "kind": "zappaloo-world", "formatVersion": 1, "name", "startMap", "tileSize": 16 }
  maps/<id>.json  Tiled JSON: orthogonal, tilesets embedded, at least the spawn point "start"
  tilesets/*.png
  avatar/avatar.json, avatar/*.png
  door/door.json, door/door.png, door/door-glimpse.png   optional, the format of 10.4
```

- Tile layers are drawn in order; layers whose name starts with `above` are drawn over the avatars.
- Collisions come from the tile layer `collision` (every tile blocks) and from optional rectangles with `type = collision`.
- Object types: `spawn`, `portal`, `clickable`, `decoration`, `seat`, `wander`, `protected`.
- Limits around 40 MB packed and 100 MB unpacked; fixed in step 5a.

**Format version 2** (decided 2026-11-15 with the project owner; replaces format version 1, which shipped only in `v1.3.0-rc.1` and never in a final release). The world project drew a first **prototype world**: isometric, with complete figures made in PixelLab instead of tinted parts. Its package and the world project's notes were the reference for step 5d.1: the package (`.tar.gz`) and the notes (`.md`) in the local, ignored `world/` folder. The native-first rendering contract below is authoritative and supersedes the earlier prototype alignment, scaling, offset and occlusion choices.

- **Only version 2.** The platform reads `formatVersion: 2` only. Format version 1 and its avatar parts are removed from code, schemas and spec, not kept alongside.
- **Isometric only.** Maps have `orientation = isometric`; orthogonal maps are refused. The manifest names `tileWidth` and `tileHeight` instead of `tileSize` (the prototype: 64 × 32), and every map and sheet tileset uses them.
- **Maps.**
  - Group layers are allowed and read recursively, in the order of the file.
  - Image-collection tilesets (one PNG per tile, tile ids with gaps, a size per tile) are allowed next to sheet tilesets. Every image is a PNG in `tilesets/`, named relative to the map.
  - The native-first rendering contract uses bottom-aligned, natural-size tile objects and zero tileset offsets. Scaling, other alignments and non-zero offsets are refused (finalized in step 5e.6).
  - A hidden layer is not drawn, but its gameplay objects still apply (the prototype's border layer is hidden in Tiled).
- **Collisions.**
  - The tile layer `collision` stays: every tile blocks.
  - Objects with `type = collision` may be rectangles or polygons.
  - Collision polygons drawn on a tile image in Tiled's collision editor (objects named `collision` in the tile's `objectgroup`) block too. They translate with each placed tile object.
  - New type **`border`**: a closed polygon whose outline blocks in both directions; its inside stays walkable.
- **Draw order.** The standard Ground → Props → Foreground layer order puts ground behind depth-sorted props and actors, and foreground tile layers over both. Objects sort by their bottom edge and actors by their feet; an image-local `occlusion` polyline places an actor behind or in front of an intact object at its authored front edge. This replaces the rule for tile layers named `above…`. New requirement GAME-19.
- **Properties.**
  - Properties on tiles in the tilesets are ignored (the world project uses `category`, `symbol`, `text`, `direction`, `name`).
  - The map property `cameraZoom` is fixed at 2 and is not read from the map (decided 2026-11-15 with the project owner).
  - Other unknown properties stay warnings (e.g. the prototype's `previewFormat`).
- **Names** stay required for spawn points, portals and clickable objects (1–40 characters of `a–z 0–9 -`), because the assignments in "Erlebniswelt" are keyed by name.
- **Portals.**
  - Targets stay in Tiled (`targetMap`, `targetSpawn`). MAP-07 stays withdrawn.
  - Changed 2026-11-16: a portal is a tile object (its arrow, which floats); its trigger area is the polygon `trigger` in the tile's object group, like the collision polygons of buildings. Walking into it takes the player through; tapping it walks the player into it. The former property `marker` is gone.
  - A portal without `targetMap` and `targetSpawn` is a warning and does nothing, so a world with one map imports. A target that is given but missing in the package stays an error (MAP-06).
- **Figures instead of avatar parts.** The avatar editor only chooses a complete figure. There is no skin colour, hairstyle, clothing, colour or template anymore.
  - `avatar/figures.json`: `{ "figures": [{ "id", "label"?, "metadata" }] }`. `id` is 1–40 characters of `a–z 0–9 -`, unique. `label` is optional and is the name the editor shows; without it, the editor shows no name. `metadata` is the path of the figure's PixelLab metadata, relative to `figures.json`.
  - The **PixelLab metadata** (`metadata.json`) and its frames are included unchanged; frame paths are relative to the figure's folder. The validator relies only on: the first entry of `states`; its `character.size` (`width`, `height`); `frames.rotations` with `south`, `west`, `east` and `north`; `frames.animations.walking` with the same four directions and the same number of frames each (1–16). Every listed frame is a PNG of exactly that size inside the figure's folder. All other fields are ignored, which is an exception to the rule that unknown fields are refused.
  - Every PNG in `avatar/` is named by a figure's metadata.
  - Game side, not in the package: the rotation image is the standing pose, the walk frames play in the order listed at 8 frames per second, and the figure faces the nearest of its four directions on screen.
  - The stored avatar is `{ "figure": "<id>" }`; an id that the active world no longer has falls back to the first figure. Companions choose a figure the same way.
  - The limits: at most 50 figures per world (decided 2026-11-15); the frame size and the tile size are proposed in step 5d.1 and await the project owner's confirmation.
- **Limits.** At most **3000 files** per package (was 500). The other limits stay: 40 MB packed, 100 MB unpacked, 5 MB per JSON file, 8 MB and 4096 × 4096 pixels per PNG.
- **Door scene** unchanged (`door/`, optional).

**Steps:**

**5a – Spec and mocks** (no code). Done.
- Section 14.4 gets the layout of format version 1: files, fields of `manifest.json` and `avatar.json`, the Tiled rules, the validator's rules and limits.
- Mocks: `admin-world` tab "Karten & Import" becomes "Welt & Import", the importer of one whole package (active world with name, import time, maps and start map; import with findings and warnings; rollback). A tab "Dialoge" in `admin-world`. The game bar without "Hochladen". The first entry with the avatar step only. "Hingehen" removed (WEB-08 withdrawn).

**5b – Validator and test world.** Done 2026-11-14 (decisions of the step in sw-architecture.md 14.4).
- The package reader (gzip and tar, limits, paths; shared with the theme package), `manifest.json`, the Tiled checks per map (format, orientation, embedded tilesets, referenced images, layers, spawn points), portal targets inside the package, the door scene, the avatar assets. Returns all findings. One test per validator rule with a broken package.
- A script builds the test world (two or three maps with generated placeholder tiles, avatar parts and objects of every type) for the tests and for development.
- Checking a package outside the platform (decided 2026-11-14; 19.7, 14.4): JSON Schemas generated from the Zod schemas, theme first, then world (manifest, avatar, maps), committed in `schemas/` with a test that fails when they differ; attached to every release. The CLI command `zappaloo validate <file>` for both kinds of package, with `--json` and exit code 0 or 1, tested with the test world and the example theme.
Requirements: MAP-06, MAP-16, MAP-17, THM-07.

**5c – Import, rollback and serving.** Done 2026-11-14 (decisions of the step in sw-architecture.md 14.4).
- Import and rollback routes, the table of the active and the previous world (migration), a folder per import, audit entries on the card "Zuletzt". A refused package leaves the active world unchanged.
- Warnings for presets that point to a missing page or content item, and for minigame presets.
- The world (manifest, maps, tilesets, avatar assets) is served with a version in the URL, so a new world is loaded on the next map entry. Sign-in and an open platform are checked.
- The waiting page takes its door scene from the active world; without one, from the data volume.
Requirements: MAP-01, MAP-04, MAP-08, MAP-09, MAP-10.
Follow-up from stage 2: map loading checked on the server, with `[ACS-07]` tests.
Re-verified: ACS-12.

**5d – Erlebniswelt › Welt & Import.** Done 2026-11-14: the page with the import tab only (Objekte & Portale came with 5f; the tab Dialoge comes with 6d), no template-world import action, per-map counts in the admin status. Resolved 2026-11-17: the mock's map names come from the optional map property `name` (14.4). Mock screen: `admin-world` (variant "import").
- The admin card: the active world with its maps, import with findings and warnings, rollback to the previous world, admins only.
Requirements: MAP-05.

**5d.1 – World format 2.** Done 2026-11-15 (inserted 2026-11-15; details below 5d). The decisions are in sw-architecture.md 14.4 ("Decisions of step 5d.1"); the frame and tile-size limits await the project owner's confirmation. Mock screens: `onboard-avatar`, `admin-world` (variant "import"). Branch `feature/stage-5-world-v2`. Implements the decisions in "Format version 2" above; replaces what 5a–5d built for format version 1. No rendering yet (5e).
- **Spec** (sw-architecture.md):
  - 14.1, 14.2, 14.4 and 14.5 rewritten for format version 2: layout, manifest, map rules, object types (with `border`), collisions, portal triggers, figures with the PixelLab metadata, validator rules, errors and warnings, limits. The final native rendering contract is recorded in 5e.6.
  - 7.3: the avatar editor chooses a complete figure.
  - Section 3 says the world is isometric.
  - Fix two contradictions found 2026-11-14: 4.1 starts a minigame through a *portal* (it is a clickable object, as in 14.2 and MG-11), and 14.2 says dialogues are edited in *Inhalte* (they are edited in "Erlebniswelt", as in 14.4).
  - Requirements reworded, marked "(reworded 2026-11-15)": AVA-01, AVA-02 (figure), MAP-02 (group layers, image collections, polygons, `border`), MAP-03 (properties, `cameraZoom`), MAP-16 (figures instead of avatar editor assets), GAME-02 (polygon collisions, borders), GAME-05, GAME-15 and GAME-16 (portal trigger areas and arrows). GAME-19's native layer-depth convention is finalized in 5e.6.
- **Mocks:** `onboard-avatar` becomes a figure picker: a grid of the figures with their labels, a walking preview of the chosen one, a tab for the guest and each approved companion. `admin-world` shows the tile size as width × height. UX decisions in `spec/mocks/README.md`.
- **Code:**
  - `shared`: the package definition `world-v1.ts` becomes `world-v2.ts`; `WORLD_FORMAT_VERSIONS = [2]`; the manifest, figure and map schemas and the limits in `shared/src/world.ts`; `GET /api/world` returns tile width and height and the figures.
  - `backend/src/world/`: the map checks (`maps.ts`: isometric, group layers, image collections, bottom alignment and natural-size tile objects, zero offsets, collision and trigger guides, `border`, polygon `collision`, portals and optional targets, `cameraZoom`, tile properties ignored), `avatar.ts` replaced by the figure checks, the limits, `summary.ts`, the import and the storage of the figure list (the column `world_packages.avatar` holds it; a migration only if the column is renamed).
  - Serving: the avatar files sit in a folder per figure; `backend/src/api/world.ts` serves only flat folders today.
  - The test world generator (`backend/src/world/build.ts`): an isometric world of two maps with group layers, a sheet and an image-collection tileset, tile collision polygons, a `border`, a portal with a trigger area, a portal without a target, and two figures in the PixelLab layout with generated frames.
  - `npm run schemas` regenerates the JSON Schemas and the format document; `zappaloo validate` reads format 2.
  - The admin page (`frontend/src/admin/AdminWorldPage.tsx`) and its tests show tile width × height.
- **Ask the project owner before building:** what happens to a format-1 world already imported in a dev or staging installation (recommendation: a migration removes format-1 rows, the admin imports again); the range and default of `cameraZoom`; the limits for figures.
- **Tests:** one validator test per new or changed rule with a broken package; the tests of MAP-06, MAP-16 and MAP-17 rewritten for format 2. Run `npm run cli -- validate world/<package>.tar.gz` on the prototype and list its findings in the step report. The original prototype is expected to be refused: its manifest has `tileSize` instead of `tileWidth` and `tileHeight`, `figures.json` has no labels (allowed, but worth noting), and its portal is an unnamed tile object without a trigger area. These findings go back to the world project; the platform does not loosen its rules for them.
Requirements: MAP-06, MAP-16, MAP-17 (re-verified with format 2).

**5e – Shared game engine and world-package integration. Done (2026-11-17).**

The project owner confirms that the world renders correctly and that the world-integration risks and acceptance criteria formerly listed under 5e.1–5e.8 are resolved. Those substeps and their acceptance gates are retired; the requirement-tagged automated tests remain regression coverage.

- The application and standalone preview load world packages through the shared `game-engine/` workspace.
- The engine renders package maps, layers and objects; handles depth, collision, movement, pathfinding and portals; and exposes the development guides needed to inspect world behavior.
- The standalone preview validates uploaded or locally watched packages. Invalid replacements preserve the last working preview.

Requirements: GAME-01, GAME-02, GAME-03, GAME-07, GAME-09, GAME-10, GAME-19, GAME-20, MAP-02, MAP-06, MAP-16, MAP-17, MAP-18.
Exit: the shared engine and world-package integration are accepted; step 5f may begin. Step 9c (moved from 5j on 2026-11-17) owns the sign-in-to-playable loading budget.

**5f – Objects and overlays. Done (2026-11-17).** Decisions: sw-architecture.md 14.4 "Decisions of step 5f". Mock screens: `game`, `game-overlay`, `admin-world` (variant "objects").
- Object types `portal`, `clickable`, `decoration` and the properties of 14.2. Clickable objects sparkle along their edges at random (small sparkles, up to five at a time) and a shine passes over them now and then; a portal's arrow floats up and down above a shadow, like a boat on waves, and glows. A click or tap on a clickable object walks to the approach point and runs the action; a tap on a portal walks into its trigger area; Enter or Space activates the object in front of the avatar. Easter eggs.
- Pages as overlays above the paused game; closing returns to the same position; links inside stay in the overlay.
- Erlebniswelt › Objekte & Portale: assign each clickable object's action per map (page including content pages, none; dialogues in 6d); portals read-only.
Requirements: GAME-04, GAME-05, GAME-06 (without minigames), GAME-08, GAME-11, GAME-15, GAME-16, MAP-03, MAP-15.

**5g – Dropped (decided 2026-11-17).** Dialogues moved to step 6d, and a content page is linked to a clickable object as a page (`p/<slug>`) that opens in the page overlay of 5f, so there is no separate content action and no reading panel. CNT-03 is covered by 5f for content pages; its dialogue part completes in 6d.

**5h – Avatar editor.** Done 2026-11-17. Mock screen: `onboard-avatar`. Decisions: sw-architecture.md 14.4 ("Decisions of step 5h").
- The world package: a mandatory `tier` and a mandatory `type` per figure (breaking change of format version 2), checked by the validator, in the JSON Schema and the test world.
- The editor chooses first the kind (male, female, child, other; only kinds with a figure the user may choose), then a figure of that kind: a grid with labels, a walking preview, and "Zufällig" within the kind. Tabs for the guest and each approved companion; "Weiter" waits until every person has a figure.
- The tiers decide which figures a user may choose (vip tier1, staff tier2, admin tier3, companions tier1), checked on the server.
- The chosen figure is stored with the membership (companions with their record); the fallback to the first figure the person may choose.
- The same editor is reached from the profile. The game shows the player's own avatar.
Requirements: AVA-01, AVA-02, AVA-03.

**5i – Entering the game.** Done 2026-11-17. Decisions: sw-architecture.md 14.4 "Decisions of step 5i". Mock screens: `game`, `onboard-avatar`, `home`.
- With an active world, a signed-in user of an open platform lands in the game; direct links open their target. "Website" in the bar returns to the website; "Erlebniswelt betreten" on the start page.
- The guided first entry: avatar (also for companions), the RSVP in an overlay if not answered, then free play.
- The bar at the top with Programm, Rückmeldung (badge while the RSVP is open) and Website. The hint "Tippe auf Dinge, die funkeln" until the first object is used. The own avatar opens the profile.
- Size (added 2026-11-17): the game fills a phone's viewport and is a centred window of at most 1280 × 800 pixels on a wide screen.
Requirements: GAME-12, GAME-13 (without "Say hello"), GAME-14 (without "Hochladen"), GAME-17, GAME-18, GAME-21.

**5j – Moved to step 9c (decided 2026-11-17).** The loading-time test and the size budget wait until a release shows whether the game works at all on devices. PERF-04 stays on the "not yet implemented" list until then.

**5k – Erlebniswelt access and stage report. Done (2026-11-17).** Decisions: sw-architecture.md 14.4 "Decisions of step 5k".
- Do not create or ship a template world.
- Add an admin switch in Erlebniswelt › Welt & Import to disable or re-enable guest access. Guest access starts enabled on the first successful world import. When disabled, guest entry points and direct guest navigation are unavailable and guest world-serving routes are blocked; the active package and admin management remain available.
- Status report for stage 5.
Requirements: MAP-19.

**5l – Review findings (added 2026-11-17).** A review of stage 5 (completeness, consistency, code quality, design decisions, security) after the status report. The world-package contract itself stands; this step fixes the defects found around it. Work packages 5l.1 – 5l.9 can be done and committed one by one, in this order. Line numbers refer to commit `dff93cc` and may have moved; find the place by the function or text named.

*How to work on this step (for whoever implements it):*
- The rules of CLAUDE.md apply: branch `feature/stage-5-world-v2`, clean working tree before each package, no commits (the project owner commits), stop after each package with a short summary.
- Tests: run only the tests of the files you changed (`npx vitest run <path>`, `npx playwright test e2e/<file> --project=desktop-chromium -g "<ID>"`), then `npm run lint` and `npm run typecheck`. The full suites and `npm run req-report` run once, in 5l.9.
- Every new test names its requirement IDs in the title (given per package below).
- Do not change the world-package format beyond what a package says. If a fix seems to need a format or UX change not described here, stop and ask.
- Never read, quote or commit anything from the ignored `world/` folder.

*Decisions of the review (2026-11-17, with the project owner):*
1. **Object actions survive an import.** An import no longer deletes the assigned actions (`world_object_actions`) of objects the new package lacks; they stay, are reported as unmatched, and apply again after a rollback or when a later package has the object again (5l.6).
2. **Figure fallback for staff and admins.** When a user's role tiers give no figure (e.g. a staff-only user in a world without `tier2` figures), the user chooses from `tier1` (5l.6).
3. **Direct links from emails stay as they are.** `/rsvp` is a full-screen page outside the website layout and does not set the website flag; finishing the RSVP opened from the reminder email (`<url>/rsvp`) therefore leads into the game, like any arrival at `/`. Written into 14.4 "Decisions of step 5i" (5l.8).
4. **Confirmed:** "Erlebniswelt betreten" also shows on the event-day start page (above the shortcuts); staff reach the world while guest access is off, like admins. The "Confirm" entries in the stage 5 report are closed (5l.8).

**5l.1 – Path traversal in the world file route (security, high).**
- *Problem:* `GET /api/world/:importId/*` reads any `.json` or `.png` the server process can read. `SERVED_FILE` (`backend/src/world/service.ts:90`) allows `..` as a folder name in the avatar branch (`[A-Za-z0-9._-]+\/`), and `file()` (`service.ts:378`) does `readFileSync(join(this.directory, importId, path))`, which resolves the `..`. Fastify passes raw `../` and the encodings `..%2F`, `%2e%2e/`, `%2e%2e%2f` through to the wildcard parameter. Any signed-in guest knows the import id (`version` of `GET /api/world`). Introduced in stage 5 (on `main` the avatar branch allowed one segment only).
- *Fix (all three):*
  - In `file()`, return `undefined` unless `isSafePath(path)` (`backend/src/packages/archive.ts:49`) is true.
  - In `file()`, compute `root = resolve(this.directory, importId)` and `full = resolve(root, path)`; return `undefined` unless `full.startsWith(root + sep)`.
  - In `SERVED_FILE`, let every avatar path segment start with a letter or digit: `[A-Za-z0-9][A-Za-z0-9._-]*`.
- *Tests* (`backend/src/api/world.test.ts`, title `[ACS-07][MAP-10] …`): `GET /api/world/<version>/avatar/..%2F..%2F<x>.json` and `…/avatar/%2e%2e%2f%2e%2e%2fmanifest.json` answer 404, while a real figure frame still answers 200. (`app.inject` normalises a raw `../` before routing, so only encoded forms can be tested this way.) A unit test of `WorldService.file()` with `avatar/../../manifest.json` returning `undefined`.
- *Done when:* the tests pass; no other world route changed.
- *Suggested commit message:* `fix: Serve only the files of the world package from the world file route`

**5l.2 – Validator: sheet tilesets with per-tile data; served file names (contract, medium).**
- *Problem A:* `checkTilesets` in `backend/src/world/maps.ts:540` treats every tileset with a `tiles` array as an image collection. Tiled writes `tiles` into a normal sheet tileset as soon as one tile has a property, class, probability, animation or collision shape, so a valid sheet is refused with misleading findings ("tile 1 has the image undefined", "the tile id 1 is in no tileset"). The engine has the same branch (`game-engine/src/map-model.ts:148`, `tileSources`). 14.2 says properties on tiles are ignored.
- *Fix A:*
  - Validator and engine: a tileset is an image collection when it has no `image` and has `tiles`; a tileset with an `image` is a sheet, whether or not it has `tiles`.
  - For a sheet, per-tile properties, class, probability and animation are ignored (no finding).
  - A sheet tile with guides (`objectgroup` objects named `collision`, `trigger` or `occlusion`) is refused with `map_guide`: "guides on a tile of a sheet tileset are not supported; put the tile in an image-collection tileset". The engine reads guides only from collection tiles; ignoring them silently would make walls walkable. (Recommendation of the review; the project owner may change it to a warning.)
  - Remove the then-dead condition `tileset.image === undefined` in `checkTileGuides` (`maps.ts:756`) only if it really became dead.
- *Problem B:* collection tiles may omit `imagewidth`/`imageheight`. The validator measures the PNG, the engine falls back to the tileset's `tilewidth`/`tileheight` (`map-model.ts:158`), so both can disagree.
- *Fix B:* refuse a collection tile without `imagewidth` and `imageheight` (`map_tileset`), and refuse it when they differ from the PNG's real size. Tiled always writes them, so real packages are not affected.
- *Problem C:* the package layout accepts any character in figure frame paths (`shared/src/packages/world-v2.ts`, `avatar/{figure}/{frame}.png`), but `SERVED_FILE` only serves `[A-Za-z0-9._-]`. A frame named `frame 0.png` imports and then answers 404 in the game. A figure frame may also name a non-PNG file in its folder (`backend/src/world/figures.ts:165`: when `images.get(path)` is undefined, no check runs).
- *Fix C:*
  - Export one segment pattern from `shared/src/world.ts` (e.g. `WORLD_FILE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`) and use it in `SERVED_FILE` (5l.1) and in the figure checks.
  - Refuse a frame path with another segment, or not ending in `.png`, with `figure_frame`.
- *Tests* (`backend/src/world/validate.test.ts`, one test per rule with a broken or edge package, titles `[MAP-06][MAP-16] …`):
  - a sheet tileset with `tiles: [{ id: 1, properties: [...] }]` is accepted;
  - a sheet tile with a `collision` guide is refused with `map_guide`;
  - a collection tile without `imagewidth` is refused;
  - a frame `frame 0.png` is refused;
  - a frame `metadata.json` is refused.
  - In `game-engine/src/map-model.test.ts` (`[GAME-20] …`), a sheet with per-tile properties resolves its tiles from the sheet.
- *After the change:* `npm run schemas` (if a schema or the format document changes) and `npm run build:test-world` still work; `scripts/schemas/schemas.test.ts` passes.
- *Suggested commit message:* `fix: Accept sheet tilesets with tile properties from Tiled`

**5l.3 – Game engine: pause before the scene runs; keys outside the game (high).**
- *Problem A:* `setGamePaused` (`game-engine/src/engine.ts:56`) does nothing while the scene does not exist yet or is still loading. `GameCanvas` (`frontend/src/game/GameCanvas.tsx:115`) calls it right after `createGame` and never again unless `paused` changes. On the guided first entry the RSVP overlay opens before the game has started, so the game runs under the overlay: keys go to the game, the avatar walks, and Enter can activate an object behind the form.
- *Fix A:* the engine remembers the wanted state.
  - `setGamePaused` stores it in the game registry (a new key next to `ENGINE_CONFIG_REGISTRY_KEY` in `host.ts`) and applies it at once only when the scene is running (`scene.sys.isActive()` or `scene.sys.isPaused()`).
  - `WorldScene.create()` reads the stored state at its end and calls `setPaused(true)` when it is set. This also covers a restart of the scene after a portal.
- *Problem B:* Phaser's global key capture (`GameScene.ts:712–727`; `createCursorKeys`, `addKey`) calls `preventDefault` for the arrow keys, W/A/S/D, Space and Enter on the whole window. While the game runs, Enter and Space on a focused button of the game bar do nothing, and in the game preview typing a path into the input loses every w, a, s, d and space.
- *Fix B:*
  - Add a helper `isTypingTarget(element)` in the engine: true for `input`, `textarea`, `select`, `button`, `a[href]`, `[contenteditable]`.
  - Create the keys without capture (`addKey(code, false)`; build the four arrow keys with `addKey` instead of `createCursorKeys`).
  - Register one `keydown` listener on `window` that calls `preventDefault` for the arrow keys and Space only when the scene is running and `document.activeElement` is not a typing target (so the page does not scroll).
  - In `update`, ignore movement and activation keys while `document.activeElement` is a typing target.
  - Remove the listener on scene SHUTDOWN.
  - `setPaused` no longer needs to switch the global capture; keep `resetKeys()`.
- *Problem C:* closing an overlay with Enter on its close button can open the object again in the same keystroke: the overlay closes synchronously, the game resumes, and Phaser sees Enter "just down" on the next frame (`GameScene.ts:299`).
- *Fix C:* in `setPaused(false)` call `resetKeys()` after `resume()` and ignore the activation keys until they have been released once (a flag cleared on the key's `up` event).
- *Tests:*
  - `game-engine/src/*.test.ts` (`[GAME-11] …`): unit test of the stored pause state (call before the scene exists, then the scene's `create` applies it). If Phaser cannot be booted in Vitest, extract the decision into a pure function and test that.
  - `[GAME-09] …`: unit test of `isTypingTarget`.
  - `e2e/game-world.spec.ts` (`[GAME-11][GAME-13] …`): on the first entry with an open RSVP, type "wasd" into the RSVP's first text field; the field holds the text and the player's position (test hook) is unchanged.
  - `[GAME-11] …`: open an object with Enter, close the overlay with Enter on "Schliessen"; the overlay stays closed.
- *Suggested commit message:* `fix: Keep the game paused under the first RSVP and let keys reach buttons and fields`

**5l.4 – Game engine: tap-to-move and walking (high/medium).**
- *Problem A:* tap-to-move ignores borders and thin collision shapes that lie between cell centres. `#tapTo` and `#walkToObject` (`GameScene.ts:743–790`) build a `Grid` whose `walkable(cell)` only tests the player's ellipse at the cell centre; `findPath` (`game-engine/src/pathfinding.ts:78`) never tests the step between two cells. A border drawn along tile edges (the way Tiled snaps it) lies about 14 px from both neighbouring centres on a 64 × 32 tile, while the ellipse radii are 6.4 × 3.2 px, so the path crosses it. The avatar then stops or slides at the border, and a pending object action never runs.
- *Fix A:*
  - Add an optional `passable?: (from: Cell, to: Cell) => boolean` to `Grid`; `findPath` skips a neighbour when `passable` returns false (also for the goal cell).
  - Move the grid construction of `#tapTo` and `#walkToObject` into one function in a new module `game-engine/src/navigation.ts`, e.g. `navigationGrid(map)`:
    - `walkable` is cached per cell for the map;
    - `passable(a, b)` is `clearLine(map.obstacles, centreOf(a), centreOf(b), size.width, 2)` (`game-engine/src/collision.ts:117`).
  - In both callers, before walking, check the segment from the player's position to the first waypoint and from the last cell's centre to the final goal (approach point or portal centre) with `clearLine`. If the first segment is blocked, put the centre of the start cell first; if the last one is blocked, do not walk.
- *Problem B:* a blocked walk can jitter forever. `stepPosition` slides along an obstacle, so `moved` stays true and the path is never cleared (`GameScene.ts:319–325`). Also `walking` only looks at `move.x`.
- *Fix B:*
  - `const walking = !keysHeld && (move.x !== 0 || move.y !== 0);`
  - Add a small pure helper in `game-engine/src/movement.ts` that tracks the distance to the current waypoint: when it has not shrunk by at least 1 px within 500 ms of walking, the walk is stuck. Then clear `#path` and `#pending`.
- *Problem C:* the tap target of a portal is `polygonCentre` (`geometry.ts:110`), the centre of the bounding box. For a concave trigger it can lie outside the polygon.
- *Fix C:* when the centre is outside, use the polygon point that is closest to the centre and inside: the centroid of the triangle of the first vertex and the two neighbouring vertices that lies inside, or else the midpoint of the first edge moved 1 px inwards. Any point inside the trigger is fine.
- *Tests* (`game-engine/src/pathfinding.test.ts`, `navigation.test.ts`, `movement.test.ts`; titles `[GAME-10] …`, `[GAME-02][GAME-10] …`, `[GAME-16] …`):
  - a border along the edge between two cells is never crossed, and the path goes round it;
  - a thin collision rectangle between two cell centres is not crossed;
  - with `passable` blocking every edge out of the start, `findPath` returns `undefined`;
  - the stuck helper reports stuck after 500 ms without progress and not while the distance shrinks;
  - the tap target of an L-shaped trigger lies inside it.
- *Suggested commit message:* `fix: Walk around borders and fences when tapping, and stop when the way is blocked`

**5l.5 – Page overlay (medium).**
- *Problem A:* links written in the Markdown of a content page leave the game. `ContentPage` renders through `renderMarkdown` (`frontend/src/app/markdown.ts`), which outputs plain `<a href>`; the overlay's `MemoryRouter` only handles router links. A link to `/programme` reloads the browser at `/programme`, and the game and its position are lost; a link to another site replaces the game tab. This breaks UX decision 18 and the 5f overlay decision.
- *Fix A:* in `GameOverlay.tsx`, a click handler on the overlay's host element:
  - for a click on an `a[href]` (no modifier key, primary button) whose URL has the app's origin, call `preventDefault` and navigate the overlay's router to the path. The router's `navigate` reaches the handler through a small component inside the `MemoryRouter` that hands `useNavigate()` out by a ref.
  - Paths the overlay does not know show its "not found" page, as today.
  - For a foreign URL, open it with `window.open(url, "_blank", "noopener,noreferrer")` and call `preventDefault`.
- *Problem B:* the overlay creates its own `SessionProvider` and `EventProvider` (`GameOverlay.tsx:57`). Signing out in the overlay's profile only clears the overlay's session, and `ProfilePage` then redirects to `/login`, which the overlay does not know ("page not found"). A changed display name does not reach the app until reload, and each open fetches `/api/session` and `/api/event` again.
- *Fix B:*
  - Read the app's session and event in `GameOverlay` (`useSession()`, `useEvent()`, and the setter context of `frontend/src/app/event.ts`). Render them into the overlay root with `SessionContext.Provider` / `EventContext.Provider` / `SetEventContext.Provider` instead of new providers.
  - Add an overlay route `login` that closes the overlay and navigates the app's router to `/login` (pass a callback `onLeave(path)` from `GamePage`).
- *Problem C:* `OverlayPage` (`GameOverlay.tsx:52`) creates a new React root on the same `<div>` while the old root's unmount is still pending in a `setTimeout`. This happens under StrictMode on every open, and when `page` changes while the overlay is open.
- *Fix C:*
  - Create the root once per mounted `OverlayPage` (in a ref, in a mount effect) and call `root.render(...)` in a second effect whenever page, session or event change. Unmount the deferred root on unmount only.
  - Give `<OverlayPage key={page} …>` so a new page gets a fresh host element.
- *Problem D (accessibility):* the dialog has no focus management.
  - Focus does not move into the sheet on open, Tab reaches the game bar behind it, and focus is not restored on close.
  - Escape is a window listener (`GameOverlay.tsx:87`), so it closes the overlay even while an RSVP field or a `<select>` is in use, and the wizard's input is lost.
- *Fix D:*
  - On open, focus the sheet's heading or close button.
  - Set `inert` on the game window (`.game-window`) while an overlay is open.
  - On close, return focus to the element that had it.
  - Escape closes the overlay only when `event.target` is not an `input`, `textarea` or `select` and `event.defaultPrevented` is false.
- *Problem E (CSS):* the inner `<div className="guest">` inside the overlay root gets `min-height: 100dvh` from `.guest` (`frontend/src/app/ui.css:789`), so every overlay page is at least a screen tall.
- *Fix E:* drop the wrapper `<div className="guest">` (the sheet already has `.guest`) or give it `min-height: 0`. Also give the phone sheet `padding-bottom: env(safe-area-inset-bottom)`, and make the game window rule two-class (`.game-window.guest`), so it does not depend on the order of the stylesheets.
- *Tests* (`frontend/src/game/overlay.test.tsx`, titles `[GAME-11] …`):
  - a Markdown link `[x](/programme)` in a content page opens the programme inside the overlay, and `window.location` is unchanged;
  - a foreign link calls `window.open`;
  - signing out in the overlay closes it and leads to `/login`;
  - the overlay uses the app's session (no second `/api/session` request);
  - focus moves into the sheet and back on close;
  - Escape in a text field does not close the overlay.
  - Render the overlay test once inside `<StrictMode>` and assert no console error.
- *Suggested commit message:* `fix: Keep links, sign-out and keyboard focus inside the page overlay of the game`

**5l.6 – Decisions 1 and 2, and import robustness (medium).**
- *Decision 1, object actions survive an import:*
  - In `importPackage` (`backend/src/world/service.ts:417`), do not delete the rows of objects the new package lacks.
  - Instead delete only rows whose object is in neither the new package nor the world that becomes the previous one (the current active world), so a rollback finds its actions again.
  - Rename the warning code `action_dropped` to `action_unmatched` (`shared/src/packages/codes.ts`, the rule in `shared/src/packages/world-v2.ts:480`, `service.ts:438`, `backend/src/api/world.test.ts:486`) with the message "the object no longer exists; its assigned action is kept and applies again if the object returns".
  - Update 14.4 "Assigned actions" (sw-architecture.md, the bullet starting "**Assigned actions** (MAP-15)") to match.
  - Run `npm run schemas` and keep the regenerated format document.
- *Decision 2, figure fallback:*
  - In `AvatarService` (`backend/src/world/avatar.ts`), when the figures allowed by `tiersOf(user.roles)` are empty, use the `tier1` figures for the user, in every path: the list for "me" (line ~101), the effective figure, and the check on `PUT` (line ~137).
  - Companions stay on `tier1`.
  - Write the rule into 14.4 "Decisions of step 5h" and into 7.3.
  - Remove the unused `figureOf` (`avatar.ts:95`) if nothing uses it.
- *Import robustness:*
  - Imports and rollbacks run one at a time: a promise chain (mutex) in `WorldService` around `importPackage` and `rollback`.
  - Decide which folder to delete from the row the import's transaction actually deletes (read the `previous` row inside the transaction), not from the value read before the files were written (`service.ts:449`, `:511`).
  - `octal()` in `backend/src/packages/archive.ts:38` throws `TarError` instead of `Error`, so a broken tar header answers 422 with `not_tar` instead of 500 (also for the theme package).
  - `GET /api/world` re-reads and re-parses every map on every request (`#overridesOf` → `#objectsOf`, `service.ts:230–250`). Cache the result of `#objectsOf` per `importId` in a `Map` on the service (the files of an import never change).
- *Tests* (`backend/src/api/world.test.ts`, `backend/src/api/avatar.test.ts`, `backend/src/packages/check.test.ts`):
  - `[MAP-09][MAP-15]` import a package without an assigned object, then roll back: the action applies again;
  - `[MAP-15]` the warning `action_unmatched` lists it;
  - `[AVA-01][AVA-02]` a staff-only user in a world without `tier2` figures gets the `tier1` figures and may choose one; a vip-only user still cannot choose a `tier2` figure;
  - `[MAP-09]` an import started while a rollback runs leaves both worlds' folders intact (call both without awaiting the first);
  - `[MAP-06]` a tar with a non-octal size field answers 422.
- *Suggested commit message:* `feat: Keep object actions across imports so a rollback restores them, and give staff a figure in every world`

**5l.7 – Smaller fixes (low).** Each with a unit test where the behaviour is testable; titles with the requirement ID given.
- `game-engine/src/GameScene.ts:172` – the guide graphics (depth 1 000 000–1 000 003) are hidden under foreground layers (depth ≥ 1 001 000). Put the guides at 2 000 000 and above. `[MAP-18]`
- `GameScene.ts:432` – on a map without visible tile objects, `Math.min()` of an empty list is `Infinity`, and every tile layer, foreground included, is drawn below the player. When there are no tile objects, treat the first tile layer after the last ground layer as the actor layer order (or: all layers after the first object layer are foreground). `[GAME-19]`
- `GameScene.ts:538` – props get depth `feetY + index / 1000`; from the 500th object the tie-break leaves the actor's ±0.5 slot. Use `index / (objects.length + 1) * 0.25`. `[GAME-19]`
- `GameScene.ts:977–1011` – a shine interrupted by a map change leaves its canvas texture `shine:N` in the texture manager. Remove the shine textures on scene SHUTDOWN. `[GAME-15]`
- `GameScene.ts:115` – the own-avatar hit box is the whole sprite frame. Use the figure's opaque bounds or a box of half the frame width around the feet. `[GAME-18]`
- `game-preview/src/App.tsx:106–295` – overlapping loads can show an older package after a newer one. Number each load and drop the result of any load that is not the latest. `[MAP-18]`
- `game-preview/src/server/package-store.ts:260` – the TTL expires the current local snapshot while `status()` still advertises it. Never expire the current snapshot. `[MAP-18]`
- `game-preview` dev server – bind to `127.0.0.1` instead of `0.0.0.0` (`game-preview/package.json` script `dev`, `vite.config.ts`). Make `POST /__game-preview/api/local-package/start` require `Content-Type: application/json`, and refuse it when the `Origin` header is not the preview's own. `[MAP-18]`
- `backend/src/api/world.ts:193` – add `X-Content-Type-Options: nosniff` to served world files, like `content.ts:274`. `[MAP-10]`
- `frontend/src/avatar/figure-art.ts:47` – the figure-art cache key is the fixed string `"world"`, so a new import in the same tab keeps the old art. Key it by the world's `version`. `[AVA-01]`
- `frontend/src/avatar/AvatarEditor.tsx` (each item `[AVA-01]`):
  - `choose` (line ~69) – ignore a choice while a `PUT` is in flight.
  - Line ~54 – a failed `PUT` (e.g. `403 figure_not_allowed`) shows an error next to the grid and keeps the editor, instead of replacing it with "Die Figuren konnten nicht geladen werden".
  - Line ~164 – a figure without a label shows no name (`{figure.label}` only when set), as the UX decision says.
- `frontend/src/game/world-data.ts:21` and `frontend/src/avatar/figure-art.ts:27` – fetch maps and figure metadata in parallel (`Promise.all`). `[GAME-07]`
- `frontend/src/pages/GamePage.tsx:85` – when "Weiter" is pressed before the RSVP state is known, wait for it (disable "Weiter" while `rsvpOpen === undefined` and the RSVP feature is on). Fix the ineffective wait in `frontend/src/game/entry.test.tsx:167`. `[GAME-13]`
- `frontend/src/admin/AdminWorldObjects.tsx:92–106` – disable the select while its `PUT` runs, and use the list the `PUT` answers instead of a second `GET`. Encode the path segments with `encodeURIComponent` (names are `a–z 0–9 -` today; this only hardens). `[MAP-15]`
- `frontend/src/game/GameBar.tsx` / `GameOverlay.tsx`: give "II PAUSIERT" `aria-hidden="true"`, and move the badge's `role="status"` out of the button so the button's name stays "Rückmeldung". `[GAME-14]`
- `backend/src/world/maps.ts:91` – portals accept `label` and `approach`, which neither 14.2 nor the engine uses. Drop them from `PROPERTIES.portal`, so they are reported as `property_unknown` warnings. `[MAP-03]`
- `backend/src/world/validate.ts:108,113` – use `WORLD_LIMITS` in the "larger than 5 MB / 8 MB" messages instead of literals. `[MAP-06]`
- Test hygiene:
  - `e2e/skeleton.spec.ts` "[GAME-12] the game route mounts Phaser…" passes on three different outcomes. Make it assert one outcome, or drop the ID from its title.
  - `e2e/game-world.spec.ts:137–141` – replace the 40 s `toPass` tap retry with a wait for a stable view (two equal camera positions from the test hook), then one tap.
  - Fix the requirement tags that do not match what the test checks:
    - `validate.test.ts:1108` `[MAP-08]` → `[MAP-06]`;
    - `game-engine/src/world-data.test.ts:7` drop `[AVA-02]`;
    - the two `[GAME-02]` animation tests → `[AVA-04]`, and list AVA-04 as partially implemented, see 5l.8;
    - `geometry.test.ts:69` `[GAME-03]` → `[GAME-16]`.

**5l.8 – Spec and documents (no code).**
- `game-engine/README.md` (rendering contract, last bullet) and `game-preview/README.md` (last paragraph) describe a circular footprint centred one radius above the sprite's bottom-centre. Replace with GAME-02's rule: the logical position is the visible feet; each frame is drawn 3 px left and 10 px down from it; the footprint is an ellipse centred 2 px left of the feet with radii 0.1 and 0.05 tile widths. Replace the example path `/workspaces/hz-event-assets/world.tar.gz` in `game-preview/README.md` with `/path/to/world.tar.gz`.
- `spec/sw-architecture.md`:
  - `avatar/avatar.json` → `avatar/figures.json` (the paragraphs on JSON Schemas and `$schema`, around lines 1763 and 1788);
  - remove the duplicated "Door scene" paragraph (around 1736/1738);
  - "the sheet a whole number of frames" → "exactly `frames × frameWidth` wide" (around 1750);
  - remove "from stage 5, optionally the map that represents the place" (around 606) and "optional map" in WEB-07 (around 634), since maps are not linked to program items;
  - remove "Template map set" from section 28 stage 5 (around 3063), the "Template maps" row of section 27 (around 2963) and the sentence in section 29 (around 3148), since MAP-12 – MAP-14 are withdrawn;
  - MAP-08: "a missing page or minigame" → "a missing page, content page, dialogue or minigame";
  - AVA-03: "composed from prepared pixel-art assets" → "chosen from prepared pixel-art figures"; MAP-04, MAP-17: "avatar editor assets" / "avatar definition" → "figures" (mark each "(reworded 2026-11-17)");
  - 14.4: the statement that format version 1 "never shipped in a final release" – v1.3.0 contained it; say that installations that imported a format-1 world lose it with migration `0021` and import again;
  - add decisions 1 – 4 of 5l to the "Decisions of step" bullets they belong to (5f "Assigned actions", 5h, 5i, 5k), and the 5l.2 rule for sheet tiles to the map rules of 14.4;
  - close or list as open the "Decisions of step 5b/5c (for the project owner to confirm)" headings (around 1786, 1797).
- `spec/implementation-plan.md`:
  - line 353 (plan-review decision "Actions of a clickable object"): strike through the `content` reading panel and the stage-5 `dialog`, and point to 5f and 6d;
  - 5f text: "(page, content item, dialogue, none)" → "(page including content pages, none; dialogues in 6d)";
  - fold the duplicated 5b – 5d.1 bodies into one block per step, adding the missing heading "**5b – Validator and test world.**" before the body that ends "Requirements: MAP-06, MAP-16, MAP-17, THM-07";
  - mark 5d's "Open: the mock shows map names" as resolved (map property `name`);
  - add "Done" markers to 5a, 5h and 5i;
  - strike through the format-1 draft block ("Draft layout of the world package, format version 1").
- `spec/test-strategy.md` section 5:
  - CNT-02 and CNT-03 appear both in the "not yet implemented" table and under "Partially implemented"; keep them only under "Partially implemented" (game-world part done, dialogues in 6d);
  - the ACS-05 and ACS-07 lines still name step "5b": ACS-05's manual-release page → step 8d (HUNT-05); ACS-07's "protected game areas" → step 8d too, with a note that stage 5 checks only sign-in, open platform and guest access;
  - list PRES-07 (tagged in `frontend/src/avatar/avatar.test.tsx:120`) and AVA-04 (own avatar done in 5h, wandering figures in stage 6) as partially implemented;
  - add MAP-12 – MAP-14 to the withdrawn list.
- `spec/README.md`: update the topic table (GAME 21 active; total 247 active of 284, 37 withdrawn; MAP and THM "implemented", GAME, AVA, CNT "in progress"; PERF stages "7, 9"); mark the decision row "The project owner draws the template map art (MAP-12)" as superseded; add `game-engine/README.md` to the document index.
- `spec/mocks/README.md` (around 151–152): "Welt & Import lists the maps with their objects and portals" → objects and portals are in the tab "Objekte & Portale"; "Portals with a missing target cannot be imported" → "a portal whose given target is missing cannot be imported; a portal without a target is a warning".
- `CLAUDE.md` command table: add `npm run schemas` (regenerates the JSON Schemas and the format document) and `npm run build:test-world`; add `game-preview/README.md` to the document table.
- Comments: `backend/src/world/build.ts:3` and `scripts/build-test-world.ts:2` ("a polygon portal with its marker") → "a portal tile with its trigger area"; the title of the test at `backend/src/world/validate.test.ts:821` that mentions the "marker property"; `backend/src/database/schema.ts:685` (`maps` holds the map summaries, not ids).
- Stage 5 status report (section 5): remove the two "Confirm" open points (decided, see decision 4); add a line "Review 2026-11-17: findings fixed in step 5l"; correct "39 of 39" to say that it includes THM-07 from step 5b.

**5l.9 – Verification and report update.**
- Run the full suites once on the final code, in CI order: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, then `npm run req-report` (not `npm run test:deploy`, which runs on CI only). `reports/vitest.json` is partial after the review's targeted runs, so the full `npm test` is required before the report.
- Update the stage 5 status report: test counts, requirement numbers, and the "Waiting on the project owner" list.
- Open after 5l, unchanged: the game-world end-to-end tests run on desktop Chromium only, and the game has not been tried on real phones. Both wait for the release candidate (status report, "Waiting on the project owner").

Requirements re-verified: ACS-07, AVA-01, AVA-02, GAME-02, GAME-09, GAME-10, GAME-11, GAME-13, GAME-14, GAME-15, GAME-16, GAME-18, GAME-19, GAME-20, MAP-06, MAP-09, MAP-10, MAP-15, MAP-16, MAP-18.

### Stage 6 – Living World (completes the Opening)

**Before the stage starts:**
- Seating plan of the first event, at least as test data.

**Steps:**

**6a – Wandering figures.** Figures of attending guests in the wander areas of one map per guest (picked at random, kept per guest); own avatar instead of own figure; simulated per device.
Requirements: PRES-01, PRES-02, PRES-04, PRES-08, AVA-04.

**6b – Profiles and speech bubble.** Profile photo, greeting, "How I know the couple" with relation list; speech bubble opening for the nearest figure; admin can remove profile data.
Requirements: PRES-09, PRES-10, PRES-13, PRES-14, PRES-15.

**6c – Seating plan and table finder.** Tables and seats, default seats for accompanying persons, admin override, table finder with tablemates, visibility date.
Requirements: PRES-05, PRES-06, PRES-07, PRES-12.

**6d – Dialogues.** Mock screen: `admin-world` (variant "Dialoge"). Moved here from 5g on 2026-11-17.
- Dialogues edited by admins in Erlebniswelt › Dialoge (id, NPC name, lines in Markdown, "Verwendet von"), audited with ids only. Deleting is refused while an object shows the dialogue; changing the id keeps the assignments.
- The action `dialog`: the NPC name and the lines, which the guest taps through. The dialogues the admin can pick for a clickable object (Objekte & Portale) and the `preset_missing` warning for a dialogue that does not exist start working with them.
Requirements: CNT-02 (the dialogue and NPC text part; albums follow in step 7d), CNT-03 (completing it).

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

**9c – Loading time** (moved from 5j on 2026-11-17; runs before 9b, once a release has shown that the game works on devices).
- The Phaser bundle and the start map load first; other maps load in the background.
- An end-to-end test in Chromium with a throttled 4G profile measures the time from sign-in to the first playable map (test hook). The validator gets a size budget for the start map.
Requirements: PERF-04.

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

**Update 2026-11-13:** step 3.9g is done. The project owner deployed the update to prod, so stage 3.9 is complete and stage 4 is next. The table below shows the state when the report was written.

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

### Stage 4 – Content and Website (2026-11-13, written after the stage)

Guests see the website: a start page with the hero image, the welcome text and the countdown, the content pages and "Mehr", and the programme with "now" and "next" on the event day. The admin edits the content (pages, images, places, the start page) in Inhalte, and imports a theme package in Einstellungen › Design. The website, the guest pages and the app icons take the event's colours and fonts from the package; the admin area keeps its neutral look. Stage 4 leaves CNT-02 and CNT-03 open, because their game-world parts belong to stage 5.

**Steps:**
- **4a – Content base and editor:** done. Pages, the start text and the order of the pages in "Mehr".
- **4b – Images and places:** done. Images per owner (start, page, place), places with an optional map image.
- **4c – Website:** done. Start page, content page, "Mehr", the website frame.
- **4d – Programme and "now / next":** done. Timeline, now and next on the event day, the end time of program items.
- **4e – Theme package:** done, in seven steps. 4e-1 mock; 4e-2 validator; 4e-3 import and return; 4e-4 serving (`/api/site`, font files, the guest pages); 4e-5 icons and manifest colours from the theme; 4e-6 card "Design"; 4e-7 example package (a build output, attached to each release), runbook section "The theme", end-to-end test.
- **4f – Generic core and stage report:** done. CFG-01 (two installations shaped through the admin API alone, and a check that the source holds no event-specific names outside the example event and the tests), CFG-04 (every event record carries `event1`, no second event can be created), this report.
- **Changed during the stage:** the waiting card takes its colours from an optional `waiting` entry of the theme (19.7); the programme's text shows only when items are hidden (WEB-09); the admin's Design card shows the default and the second-click states (mock updated); the German UI placeholder for the event name no longer names an example event.

**Requirements:** 22 of 24 planned for this stage, all with passing tests (requirement report). CNT-02 and CNT-03 are open until stage 5. Overall: 133 of 244 active requirements implemented, 123 with passing tests. The other ten are the ones whose deployment-test results are stale (see below); none is from stage 4.

**Tests:**
- Unit and integration (Vitest): 837 tests in 81 files, all passing (`npm test`, run before the report).
- End-to-end (Playwright): 77 passed, 27 skipped (the project-specific skips), none failed (`npm run test:e2e`).
- Deployment test (`npm run test:deploy`): not run in this stage. Its results are stale, and 11 requirement errors come from them (ACC-05, ACC-11, ACC-14, CFG-02, CFG-07, OPS-02, OPS-05, OPS-13, OPS-15, OPS-16, SEC-01).
- Manual checks on a phone: none recorded for stage 4.

**Spec changes and deviations:**
- Written into the spec during the stage: 5.6 (start page), 6.2 (content model, images, places), 19.5 (icons from the theme), 19.7 (theme package, including the `waiting` entry and the serving rules), WEB-09 (text), PWA-02 (wording), THM-06 (the countdown's display font, added 2026-11-13), the not-yet list in `test-strategy.md`.
- Deviation, confirmed by the project owner on 2026-11-13: the `waiting` entry was added to format version 1 before any theme package was released. Section 19.7 records this. From the first release on, a new field raises the version.
- The site response has `theme: null` for the default theme. This is an implementation detail that the spec does not name.
- Mock: the admin's Design card has four states (active, default, refused, second click). The findings show the server's English details, as agreed.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | done |
| 4 | Content and website | done (CNT-02, CNT-03 finish in stage 5) |
| 5 | Game world and world importer | next |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (from the requirement report, whole stage numbers): stage 1 → 1; 2 → 0; 3 → 0; 4 → 2 (CNT-02, CNT-03); 5 → 37; 6 → 14; 7 → 30; 8 → 22; 9 → 1; 10 → 4. In total 111 of 244 active requirements not yet implemented.

**Waiting on the project owner:**
- Decide where the release artifacts live: the root `dist/` folder, or a separate `artifacts/` folder. The frontend build stays in `frontend/dist/`.
- Go-ahead for `npm run test:deploy`, to clear the stale deployment results.
- The prod update: the old `icons/` folder in the data volume is no longer read. Import a theme package right after the update (the note in the plan's stage 4 part).
- A new release candidate before the next promotion. The promotion takes the example package from the candidate's release, and candidates built before this stage have none.
- Confirm the preconditions and steps of stage 5 before it starts.
- **Open points (2026-11-13, from the stage 4 review):**
  - Now / next on the event day is shown only to guests who accepted (done, WEB-07; "accepted" = RSVP status "attending"). Open: should the "now" marker in the programme follow the same rule? It does now; confirm.
  - Open: should "now" and "next" consider all program items, or only the items the guest is invited to (as the programme does, WEB-09)? It considers all items now.
  - Open: the countdown on the start page names the date and place of the first program item to every signed-in guest. Should it show only to guests who accepted, or not at all before the event day?
  - Open: the rehearsal of migration 0013 (places from the program items' texts) on a copy of the prod backup is not recorded. `places-migration.test.ts` runs it on fixture data only. It must be done, on staging with the prod backup, before the prod update; the project owner or whoever has the backup confirms it.

**Risks and notes:**
- Before the site response arrives, the first page load shows the default look, then the theme. A new theme shows on the next page load (19.7).
- The example package has placeholder icons and no fonts. The font path is covered by tests, but no real font has been checked in a browser.
- The requirement report's stage table reads whole stage numbers only, so 3.5 and 3.9 count under stage 3.

### Stage 5 – Game World and World Importer (2026-11-17, written after the stage)

An admin imports a whole world package (isometric maps from Tiled, complete figures) in Erlebniswelt › Welt & Import, rolls back to the previous one, assigns the actions of the clickable objects, and switches guest access on and off. Guests who sign in to an open platform land in the game: they choose their avatar (and their companions'), answer the RSVP in an overlay if it is still open, and walk around with the keys or by tapping. Objects sparkle, portals lead on, and website pages open as overlays above the paused game. A bar at the top gives Programm, Rückmeldung and Website, and a tap on the own figure opens the profile. On a phone the game fills the screen; on a wide screen it is a window of at most 1280 × 800 pixels.

**Steps:**
- **5a – Spec and mocks:** done (2026-11-14).
- **5b – Validator and test world:** done. 5c – Import, rollback and serving: done. 5d – Erlebniswelt › Welt & Import: done.
- **5d.1 – World format 2:** done (inserted 2026-11-15). Isometric maps and complete figures replace format version 1.
- **5e – Shared game engine and world-package integration:** done. The project owner confirmed the rendering; the sub-steps 5e.1 – 5e.8 were retired.
- **5f – Objects and overlays:** done. Clickable objects and portals with their effects, actions, page overlays, and the admin's list of objects.
- **5g – Dropped:** dialogues moved to step 6d; a content page is linked to an object as a page.
- **5h – Avatar editor:** done. Kind first, then a figure; tiers by role; companions' tabs.
- **5i – Entering the game:** done. Landing, guided first entry, bar, hint, the own avatar opens the profile, and the size rule (GAME-21, added during the step).
- **5j – Loading time:** moved to step 9c (2026-11-17), so that a release shows first whether the game works on devices. PERF-04 moved to stage 9.
- **5k – Erlebniswelt access and stage report:** done. The switch for guest access (MAP-19), no template world shipped, this report.
- **Changed during the stage:** world format 2 replaced format 1 (2026-11-15); the template world (MAP-12 – MAP-14) was withdrawn (2026-11-17); WEB-08 was withdrawn (2026-11-14); step 5g was dropped and 5j moved (2026-11-17); GAME-21 was added (2026-11-17).

**Requirements:** 39 of 39 planned for this stage (THM-07 from step 5b included), all with passing tests (requirement report; PERF-04 moved to stage 9). GAME-13 (without "Say hello"), GAME-14 (without "Hochladen") and GAME-06 (without the minigame action) are partially implemented, as listed in test-strategy.md, section 5. Overall: 172 of 247 active requirements implemented, 162 with passing tests. The others are the ones whose deployment-test results the local report reads from an old file (see below); none is from stage 5.

**Tests:**
- Unit, component and integration (Vitest): 1140 tests in 109 files, all passing (`npm test`, run once more before the report).
- End-to-end (Playwright): 87 passed, 57 skipped (the project-specific skips), none failed (`npm run test:e2e`, complete run on the final code). Two tests were made more robust during the closing runs (the tap on the altar retries with a fresh target; the first load of the game waits longer for the Phaser chunk), and the specs of the website and the admin area keep their browser on the website (a world on the shared installation makes `/` lead into the game).
- Deployment test (`npm run test:deploy`): runs on CI only, because it does not work in the devcontainer under WSL (decided 2026-11-17). The local requirement report reads old results of it, and its 11 errors come from them (ACC-05, ACC-11, ACC-14, CFG-02, CFG-07, OPS-02, OPS-05, OPS-13, OPS-15, OPS-16, SEC-01); CI has the current ones.
- Manual checks on a phone: none recorded for stage 5. The game has not been checked on real devices yet.

**Spec changes and deviations:**
- Written into the spec during the stage: 14 (world format, importer, objects), GAME-01 – GAME-21, MAP-01 – MAP-19 (MAP-07, MAP-11 – MAP-14 withdrawn), AVA-01 – AVA-04, the decisions of steps 5b – 5k in sw-architecture.md 14.4, the mocks (`admin-world`, `onboard-avatar`, `game`, `game-overlay`), and the testing policy (test-strategy.md, section 8, and CLAUDE.md).
- Decided in step 5k: "guests" are the users who are neither staff nor admin; the setting lives in `event_settings` under its own name (no migration); the world routes and the avatar routes answer a guest with `403 world_access_disabled` while access is off.
- Decided in step 5i: with a world, `/` leads into the game once per browser session; a figure that a new world no longer has leads to the avatar step again.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | done |
| 4 | Content and website | done (CNT-02, CNT-03 finish with the dialogues in step 6d) |
| 5 | Game world and world importer | done |
| 6 | Living world | next |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (from the requirement report, whole stage numbers): stage 1 → 1; 2 → 0; 3 → 0; 4 → 2 (CNT-02, CNT-03); 5 → 0; 6 → 14; 7 → 30; 8 → 22; 9 → 2 (PERF-01, PERF-04); 10 → 4. In total 75 of 247 active requirements not yet implemented.

**Waiting on the project owner:**
- A first world package with maps drawn in Tiled and figures from PixelLab, for the Opening; the steps used a generated test world.
- A release candidate to check the game on real phones and a computer; that check also tells whether the loading time (step 9c) needs work.
- Confirm the preconditions and steps of stage 6 before it starts.
- **Open points (from stage 5):**
  - The frame and tile-size limits of format 2 (frame sides 8 to 256 pixels, 1 to 16 walk frames, tiles 8 to 128 pixels) were proposed in step 5d.1 and are not confirmed.
  - Review 2026-11-17: findings fixed in step 5l. The two former "Confirm" points are decided (14.4 "Decisions of step 5k"): "Erlebniswelt betreten" is also on the event-day start page, and staff reach the world while guest access is off, like admins.
  - A guest whose figure no longer exists after a new world is led through the avatar step again (confirmed 2026-11-17 for the step; mentioned here for the world update runbook).

**Risks and notes:**
- The loading time of the first map over 4G (PERF-04) is not measured until step 9c.
- The end-to-end tests of the world share one installation; a world makes `/` lead into the game for every browser that has not visited the website, so new specs of the website must use the `test` of `e2e/support.ts`.
- The standalone game preview needs its own port in the end-to-end run; when a preview is running on port 5175, set `ZAPPALOO_GAME_PREVIEW_PORT`.
- The requirement report's stage table reads whole stage numbers only, so 3.5 and 3.9 count under stage 3.

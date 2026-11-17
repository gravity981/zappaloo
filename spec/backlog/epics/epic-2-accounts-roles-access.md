# Epic 2 – Accounts, Roles and Access

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Release 1 | 1 | `feature/stage-2` (PR #3) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- SMTP account at Infomaniak for the proof of concept (Mailpit is used in development).

## Stories

### Story 2a – Event bootstrap and settings

`events/<slug>/` directory read and validated at startup; event with `eventId` on all event-related records; feature toggles and settings changeable at runtime; audit log.
Requirements: CFG-02, CFG-03, CFG-05, DATA-02, DATA-03.

### Story 2b – Accounts and sessions

Login and logout, long-lived server-side sessions, password hashing, CSRF protection, rate limiting, profile, accounts created by an admin; CLI `create-admin` and `reset-password`.
Requirements: ACC-01, ACC-04, ACC-05, ACC-06, ACC-08, ACC-13, ACC-14, ACC-15, SEC-01, SEC-02.

### Story 2c – Email and account self-service

SMTP sending; optional email verification; password reset for verified addresses only; admin one-time reset link; users delete their own account. Deleting one's own contributions is added to the tests in stage 7.
Requirements: ACC-03, ACC-09, ACC-10, ACC-11, ACC-12.

### Story 2d – Roles, capabilities and guest groups

Roles `vip`, `staff`, `admin` per event and combinable; staff capabilities; guest groups.
Requirements: ROLE-01, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07, ROLE-08, ROLE-09, GRP-01, GRP-02.

### Story 2e – Invitations

Personal invitation tokens (stored as hashes), redemption creating an account or adding `vip`, atomic redemption, statuses, expiry, revoke and regenerate, direct admin promotion, printable export with QR codes.
Requirements: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10, INV-11, INV-12, INV-14, ACC-07.

### Story 2f – Access control

Sign-in required everywhere except the allowed pages; access conditions combined with AND/OR; server-side enforcement on every request. Conditions that depend on later features (treasure hunt) are added in their stage.
Requirements: ACS-05, ACS-06, ACS-07, ACS-09.

### Story 2g – Review fixes

(added 2026-11-10 after the stage review). Sign-in and CSRF checks also for percent-encoded paths; admin API for feature toggles and settings (`PATCH /api/admin/event`); deployment bundle ready for prod mail (`secrets/smtp_password`, `EVENT_SLUG` without default, links without the default port); password must not equal the username; open setup and reset links voided by a password or email change; per-address limits count only failures; codes and tokens kept out of the logs, `Referrer-Policy`; audit log with ids only; cleanup of expired sessions and links; frontend handles ended sessions and lost connections, email verification with a button; migrations squashed into one before the first release with a database; partially implemented requirements tied to later steps (test-strategy.md 5).
Requirements: none new (strengthens CFG-05, SEC-01, SEC-02, ACC-03, ACC-06, ACC-11, ACC-12, INV-02, INV-05, ACS-07 and ACS-09).

### Story 2h – Admin area

(added 2026-11-10, built from the admin mocks in [mocks/](../../mocks/README.md)). Admin shell at `/admin` (header with the platform state and "Zur Website", side navigation on desktop, scrollable entries on phones); the navigation lists only the pages that exist, and later steps add theirs. Übersicht (platform state, upload switches), Einladungen in the mock's layout, Konten & Rollen (accounts with role chips, a detail panel per account for staff capabilities, groups and a reset link, "Konto anlegen" with the setup link, guest groups with a panel for renaming, deleting and members), Einstellungen (feature switches). Opening the platform stays with 3c/3d; manual releases get their page with the first feature that stores conditions.
Requirements: none new (the pages for ACC-08, ACC-10, ROLE-01, ROLE-06, ROLE-07, ROLE-09, GRP-01, CFG-05, INV-01, INV-04, INV-05).

### Story 2i – Event setup in the admin area

(added 2026-11-11, replaces the bootstrap from `events/<slug>/`, 19.3.1). `EVENT_SLUG`, `EVENTS_DIR`, the event folder and `event.json` are removed; the first start creates the event record with the fixed id `event1`; setup form (name, time zone, default language) as the first content of the admin area, with a UX mock; `PATCH /api/admin/event` also takes name, time zone and language; "not set up yet" page for other users and `409 setup_incomplete` for feature routes; CLI `event seed-example`; `theme.json` and static graphics move to `$DATA_DIR/events/event1/` (the folder is named by the event id, as backup `--full` already covers `events/`); deployment bundle, runbook, deploy tests, e2e tests (global setup seeds, one test runs the real setup) and release notes lose the slug. Migration check: the database schema may change (event row without name), squashed into the one migration as long as no release holds a database.
Requirements: CFG-02 (replaced), CFG-05 (reworded), CFG-06, CFG-07.

## Report

### Status report (2026-11-10)

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

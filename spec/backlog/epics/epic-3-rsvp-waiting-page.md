# Epic 3 – RSVP and Waiting Page

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Release 1 | 2 | `feature/stage-3` (PR #4) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
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

## Stories

### Story 3a – RSVP

Mock screens: `rsvp-parts`, `rsvp-people`, `rsvp-companion` (song only; the companion card comes in 3b), `rsvp-done` (before and after the deadline), `admin-rsvp`, `admin-invitations`, `admin-users` (account panel), `admin-settings` (card Rückmeldung), `admin-home` (KPI Rückmeldungen).
- Event parts, meal part, menus and deadline in Einstellungen › Rückmeldung.
- Invited parts per invitation: "Eingeladen zu" chips at batch creation, "Teile" column, editable per row (UX decision 31); "Eingeladen zu" in the account panel for admin-created VIPs.
- Three-step wizard (attendance → food → song), deadline shown up front, declining every part skips to the summary; summary page, read-only after the deadline; no confirmation email (UX decision 12).
- Rückmeldungen (new nav entry): totals per part (yes / no), menus of the meal part, guest table with the admin-only allergy column, song wishes, CSV export, "Erinnern (n)" reminder email to guests without an answer who have a verified address; a row opens the wizard in admin mode.
- Übersicht: KPI "Rückmeldungen x / y, n ohne Antwort", and the card "Zuletzt" (decided 2026-11-11, DATA-05): the latest 5 audit-log entries about guests and about settings and content, names resolved on display, no logins or role changes. 3a audits RSVP answers and changes and event-part and RSVP-setting changes; 3b adds companion requests and decisions, 3c and 3d the waiting-page texts, opening and the privacy notice; invitations created and redeemed are already audited.
Requirements: RSVP-01, RSVP-02, RSVP-03, RSVP-04, RSVP-05, RSVP-06, RSVP-07, SEC-11, DATA-05 (added 2026-11-11).

### Story 3b – Accompanying persons

Mock screens: `rsvp-companion` (overview and request form), `rsvp-people` (one card per person), `rsvp-done`, `admin-rsvp` (requests card), `admin-home` (KPI Begleitpersonen, nav badge).
- Request form: name, optional note, attendance for the VIP's own parts, menu, allergies with the lock note; the avatar comes later (PRES-07).
- Status tags pending / approved / rejected; "Bearbeiten" and "Zurückziehen" while pending; approved companions are edited in the wizard (see decisions); the hint about a separate invitation for people with their own phone.
- Admin approves or rejects in Rückmeldungen; approved companions count in totals, menus and the guest table; no login; deleted together with the VIP.
Requirements: RSVP-08, RSVP-09, RSVP-10 (added 2026-11-10).

### Story 3c – Closed platform and waiting page

Mock screens: `waiting` (three states), `admin-settings` (opening date and countdown switch in the card "Plattform öffnen", card Warteseite-Texte).
- Platform closed by default; guests without `staff` or `admin` reach only the waiting page, the RSVP wizard, the profile (without the website navigation, back to the waiting page) and the public pages; enforced on the server too.
- Waiting page: full-screen door scene (default scene shipped, replaceable per event in `$DATA_DIR/events/event1/`), gap tap for a bigger glimpse; top bar with the event name, Profil and Abmelden; card with the optional countdown, the text by RSVP status with `{name}`, `{waitingCount}`, `{openingDate}`, and "Rückmeldung geben" / "Rückmeldung ändern".
- Einstellungen: opening date, countdown switch, the three editable texts with their defaults.
Requirements: ACS-10, ACS-11, ACS-12, ACS-13.

### Story 3d – Opening and privacy notice

Mock screens: `admin-settings` (card "Plattform öffnen"), `admin-home` (KPI Plattform with "Öffnen …"), `login` and the waiting page (link Datenschutz), a new privacy notice screen.
- "Jetzt öffnen" with the optional "Die Tür ist offen" email to guests with a verified address (the count in the label counts them); "Wieder schliessen" without email.
- Privacy notice page `/datenschutz`, reachable without sign-in and linked from every page; German default text, editable in Einstellungen.
Requirements: ACS-14, SEC-09, SEC-05 (the Markdown renderer, added to this line on 2026-11-13).

### Story 3e – Sign-in by email

(added 2026-11-10). The login accepts a verified email address as well as the username; an address can be verified by one account only (`409 email_taken`).
Requirements: ACC-16.

### Story 3g – Guest pages in the mock style

(added 2026-11-11 after an audit of Release 1 against the mocks; built before the go-live; the pages without a mock are drawn in 3g and built in 3h). Every page a guest sees before the opening is built from its mock (layout, flow, texts, UX decisions in mocks/README.md); until now only the waiting page, the RSVP content and the admin area follow the mocks, the pages of stage 2 are plain forms.
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

### Story 3h – Set-password, confirm-email and not-found pages

(added 2026-11-11). Built from the three mock screens drawn in 3g (`set-password` with setup, reset, saved and invalid-link variants; `verify-email` with ready, confirmed, invalid and address-taken variants; `not-found`) after the project owner has confirmed them; UX decision 57 (one password field with an eye button, no repeated field) applies to the set-password page. The pages sit in the `bare` frame already; this step gives them their content and styling and updates their tests.
Requirements: none new.
Re-verified: ACC-03, ACC-08, ACC-09, ACC-10, ACC-14, ACC-15, ACC-16.

### Story 3i – Fixes from the stage-3 review

(added 2026-11-11, before 3f). Answers stay in line with the invitation whichever way it changes (invitation row, account panel, deleted part), a part added later is not answered yet, and a lost last yes resets to "ohne Antwort"; revoking `vip` deletes the RSVP and companions after a second click (sw-architecture.md 7.4.1). The closed-platform list matches whole route names and a test walks every route (10.4); the platform opens only through its own route; one reminder round per event every 10 minutes; one login lockout per account (7.1.1); the Markdown renderer removes forms, styles and images from other sites (SEC-05). Also: stale companion edits in the wizard, missing styles, the badge and the waiting page read counts instead of the whole overview, the "Zuletzt" card lists invited-part changes, the mock's "Konto anlegen" has no part chips (UX decision 53), and the tests 3g asked for (Datenschutz link on every page, phone widths, the door glimpse).
Requirements: none new.
Re-verified: RSVP-02, RSVP-05, RSVP-07, RSVP-09, RSVP-10, ACS-10, ACS-12, ACS-14, ACC-16, SEC-02, SEC-09, SEC-11, DATA-05.

### Story 3f – Release 1 go-live

Moved to stage 3.5 (step 3.5f, decided 2026-11-11): Release 1 now includes the installable app.

## Report

### Status report (2026-11-12, written after the stage)

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

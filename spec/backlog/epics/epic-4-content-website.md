# Epic 4 – Content and Website

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Opening | 3.9 | `feature/stage-4` (PR #8) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Replanned 2026-11-13 after a review of the plan against stages 3 to 3.9 and a clearer picture of "event configuration and content" (sw-architecture.md 19.1.1). Branch `feature/stage-4`.

**Before the epic starts:**
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

## Stories

### Story 4a – Content base and editor

Mock first: `admin-content` (page list with order and "In «Mehr» sichtbar", title, Markdown with preview, "Veröffentlichen", the start page text, no "Programm" entry).
- Pages with slug, title, a text per language key, visibility and position. The start page text. API for reading (signed-in users) and editing.
- Editing needs the admin role or `staff` with `editWebsiteContent`. The admin area gets the entry "Inhalte", which such a staff member also reaches.
- Changes are audited with ids only and appear on the card "Zuletzt".
- The existing Markdown renderer (SEC-05) shows the preview and the pages.
Requirements: CNT-01, CNT-02, CNT-03, CNT-04, CNT-05, LANG-02.
Follow-up from stage 2: the content routes use `requireCapability("editWebsiteContent")` and get `[ROLE-06]` and `[ROLE-07]` tests.
Re-verified: SEC-05, DATA-05.

### Story 4b – Images and places

Mock first: the image button and image list in `admin-content`, a places list and form in Inhalte, the place card on `info`.
- Image upload with the checks of 6.2 (type by content, size). Images are stored in `$DATA_DIR/events/event1/content/` and served to signed-in users. The renderer accepts images of the installation and still removes others.
- Places with name, address, Google Maps link and map image. A page lists places.
- Program items refer to a place. A migration turns the existing place texts into places. It is tried with a copy of the prod backup on staging, like the migrations of stage 3.9. Einstellungen › Rückmeldung picks the place from the list.
Requirements: CNT-06, CNT-07.
Re-verified: RSVP-01, RSVP-05 (the place of a program item), SEC-05.

### Story 4c – Website

Mock screens: `home` (variant "Before the event"), `info`, `more`, `admin-content` (variant "Edit start page").
- The website frame: bottom tab bar on phones and top navigation on desktop, with Start, Programm and Mehr. Later stages add their tabs.
- Start page in its fixed layout before the event day (5.6): the hero image, the welcome text, the countdown card, the RSVP card and the shortcuts ("Programm" and the first three pages visible in "Mehr"). The editor of the start page in Inhalte gains the hero image (picked from its images, alt text, "Entfernen") and the switch "Countdown auf der Startseite zeigen" (default on). An image that is the hero image cannot be removed. The countdown is tested with fake timers across midnight in the event's time zone, without program items and with the switch off. Content page `/p/<slug>`. "Mehr" with the visible pages in the admin's order, the profile, Verwaltung and Inhalte for those who may use them, Datenschutz and Abmelden.
- Until stage 5, a signed-in user of an open platform lands on the start page. Restricted guests of a closed platform still see only the waiting page. The new routes join the closed-platform list and its test that walks every route (10.4).
- No part of the website loads Phaser. The pages work at phone, tablet and desktop widths.
Requirements: WEB-01, WEB-02, WEB-03, WEB-04, WEB-10 (before the event day), WEB-11.
Re-verified: ACS-10, SEC-09, CNT-06.

### Story 4d – Programme and "now / next"

Mock screens: `programme` (all three variants), `home` (variant "Event day"), `admin-settings` (card Rückmeldung with the end time).
- Program items gain an optional end time.
- The programme page shows the program items the guest is invited to as a timeline, with the line that says so. On the event day past entries are greyed out and the current one is marked.
- The start page switches to its event-day layout from the start of the day of the first program item (5.6): "now / next" on top, then the shortcuts. The hero image, the welcome text, the countdown and the RSVP card are not shown. "now / next" shows the current and the next program item, in the event's time zone. A change by the admin shows at once. "Hingehen" follows in step 5d (WEB-08).
- The header of the public pages shows the event's date.
- Decided while building 4d (proposed, to confirm): "now" is the latest entry that has started and has not ended (an entry without an end lasts until the next one starts); "next" is the first entry after now. The event day is the calendar day of the first program item in the event's time zone. The start page shortcuts lead to "Programm" first, then to the pages under "Mehr". The mock admin card shows the end time in the list (the mock had no end time).
Requirements: WEB-07, WEB-09, WEB-10 (the event day).

### Story 4e – Theme package

Split into smaller steps, each committed on its own (decided 2026-11-14; sw-architecture.md 19.7).
Requirements: THM-01, THM-02, THM-03, THM-04, THM-05, THM-06.
Re-verified: PWA-01, PWA-02, PWA-03.
- **4e-1 – Mock.** Card "Design" in `admin-settings`: active theme, import, reset with a second click, findings of a refused package. Done in the mock (no code).
- **4e-2 – Validator.** The package reader (gzip and tar, limits, paths), `manifest.json` and `theme.json` checks, PNG sizes, WOFF2 signature, contrast. Returns all findings. One test per validator rule with a broken package. No storage, no routes.
- **4e-3 – Import and return.** `POST /api/admin/theme` and `DELETE /api/admin/theme`, the table of the active theme (migration), the folder per import, audit entries `theme.import` and `theme.reset` on the card "Zuletzt". A refused package leaves the active theme unchanged. Tests for the import, the return and the unchanged theme after a refusal.
- **4e-4 – Serving.** `GET /api/site` carries the theme; fonts are served under `/theme/fonts/<file>` without sign-in; the guest pages apply the colours and the font faces (the admin area keeps its neutral look); the countdown uses `display` (THM-06).
- **4e-5 – Icons and manifest.** App icons and manifest colours come from the active theme, or from the defaults when there is none. The folder `icons/` in the data volume is no longer read (PWA-02).
- **4e-6 – Card in the admin area.** The card "Design" as in the mock: state, import with findings, reset with a second click.
- **4e-7 – Example and runbook.** A script builds the example package in the repository; the runbook (infrastructure/deploy/README.md) describes the package; an end-to-end test imports the example and returns to the default.

### Story 4f – Generic core and stage report

- CFG-01: a test shapes two fresh installations of the same build differently (name, theme package, pages, program items) through the admin API alone and checks that each serves its own. A check that the source holds no event-specific names or texts outside the example event and the tests.
- CFG-04: tests that two installations with their own data folders share nothing, that every event-related record carries `event1`, and that no second event can be created.
- Status report for stage 4.
Requirements: CFG-01, CFG-04.

## Report

### Status report (2026-11-13, written after the stage)

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

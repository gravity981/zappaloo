# Epic 5.3 – Program Items and Activities

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Opening | 4 | `feature/epic-5.3-program-items-activities` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-18. Today a program item is both the unit a guest answers the RSVP for and an entry of the schedule. That forces one RSVP answer per schedule entry: an event with Apéro, Dinner and Party needs three answers, or the programme shows one coarse entry. This epic separates the two: a **program item** is what a guest is invited to and answers for, and it has one or more **activities**, which are what the programme shows. Invitations can then be set up more finely, because not every activity needs its own RSVP answer. Numbered 5.3 so that it is built before epic 6 and the Opening.

**Current state (2026-11-18):** program items (`program_items`: name, start, optional end, place, meal flag) are edited in Einstellungen › Rückmeldung (7.4.1). Invitations (`membership_program_items`), answers (`rsvp_attendance`), the menu rule (meal item), the figures (PRES-01) and the CSV refer to program items. The programme, "now / next", the "now" marker and the countdown read the program items' times (5.5, 5.6).

**Before the epic starts:**
- The project owner confirms the proposals below (done 2026-11-18).
- The mocks of story 5.3a are confirmed before story 5.3c starts.

**Decisions** (2026-11-18, with the project owner):
1. **Model.** A program item is the RSVP unit: name, meal flag, invitations and answers. It has no time or place of its own. An activity has a name, a start, an optional end and a place, and belongs to exactly one program item. A program item has at least one activity. A program item's order is the start of its first activity.
2. **No activity without a program item.** A guest sees the activities of the program items they are invited to (WEB-09 as before); there are no activities for everyone.
3. **The meal flag stays on the program item.** The menu is asked of whoever attends the program item that has the meal (7.4.1 unchanged).
4. **Programm page:** the activities, by time, of the guest's invited program items. "Now / next", the "now" marker and the countdown read activities. The countdown counts to the first activity of all program items and shows its date and place; it is the same for every guest, invited to it or not (changed 2026-11-18, project owner). Every day that has an activity is an event day, also in a programme over several days (changed 2026-11-18, project owner).
5. **RSVP wizard:** each program item lists its activities in a small line below its name, e.g. "Fest – Apéro 16:00, Dinner 18:30, Party 22:00", so the guest knows what they answer for.
6. **Admin:** Einstellungen › Rückmeldung keeps the program items (name, meal); the activities are edited under each program item in the same card ("Aktivität hinzufügen"). Creating a program item asks for its first activity. The last activity of a program item cannot be deleted; the program item is deleted instead.
7. **Migration of prod data:** every program item keeps its name, meal flag, invitations and answers, and gets one activity with its former name, time and place. Nobody answers again, and the programme looks the same until the admin splits items.
8. **Mocks** to change: `programme`, `home` (now / next, countdown), `rsvp-parts`, `admin-settings`.

## Stories

### Story 5.3a – Spec and mocks

Mock screens: `programme`, `home`, `rsvp-parts`, `admin-settings`.
- Activities in the programme, in "now / next" and the countdown, below each program item in the RSVP wizard, and under each program item in Einstellungen › Rückmeldung; the decisions in `spec/mocks/README.md`.
- The project owner confirms the mocks before story 5.3c starts.
Requirements: none new.

### Story 5.3b – Data model, migration and API

- Table `activities` (program item, name, start, optional end, place); `program_items` loses start, end and place. The migration gives every program item one activity from its former fields. `seed-example` gets program items with several activities.
- Admin API for the activities of a program item (create, change, delete, audited as `rsvp.activity.create|update|delete`); program items without time and place; the programme and site APIs carry activities.
Requirements: RSVP-18.

### Story 5.3c – Activities in Einstellungen

Mock screen: `admin-settings`.
- The activities under each program item, "Aktivität hinzufügen", the first activity when a program item is created, the last one not deletable.
Requirements: RSVP-17.

### Story 5.3d – Programme, now / next and countdown from activities

Mock screens: `programme`, `home`.
- The programme lists the activities of the invited program items; "now / next", the "now" marker, the countdown and the start of the event day read activities.
Requirements: WEB-12.
Re-verified: WEB-07, WEB-09, WEB-10, WEB-11.

### Story 5.3e – Activities in the RSVP wizard

Mock screen: `rsvp-parts`.
- Each program item lists its activities with their start times, in one answer for all (RSVP-11 off) and per program item; the summary too.
Requirements: RSVP-16.
Re-verified: RSVP-01, RSVP-03, RSVP-05, RSVP-11.

### Story 5.3f – Epic report

- Final verification and epic report.
Requirements: none new.

## Report

### Epic report (2026-11-18)

**Summary:** A program item is now what a guest is invited to and answers for, and it holds one or more activities with their own time, end and place. The hosts edit the activities under each program item in Einstellungen. The programme, "now / next" and the countdown read activities, and a programme over several days has a timeline per day. The RSVP lists each program item's activities. Existing data moved over without a new answer from anyone.

**Stories:**
- 5.3a – Spec and mocks: done. The owner confirmed the mocks before 5.3c.
- 5.3b – Data model, migration and API: done. Changed: the first activities are sent as an `activities` array when a program item is created (decided with the owner), and the countdown counts to the first activity of all program items, the same for every guest.
- 5.3c – Activities in Einstellungen: done.
- 5.3d – Programme, now / next and countdown from activities: done.
- 5.3e – Activities in the RSVP wizard: done.
- 5.3f – Final verification and epic report: done.
- Added with the owner during the epic (not in the plan): dates written day.month.year and times in 24-hour format in the admin settings (own field instead of the browser's date field); the rarely used settings cards at the bottom (Design, Warteseite-Texte, Datenschutz, Fusszeile); a confirmation button held for four seconds for the design reset and the world rollback; the warnings of an accepted world below its maps; a programme over several days (timeline per day, every day with an activity is an event day, open-ended activities end with their day); the line "Du siehst nur die Programmpunkte, …" removed from the programme; tracking of flaky e2e tests (`@flaky`, `spec/test-strategy.md` 8.8).

**Requirements:** 4 of 4 planned for this epic (RSVP-16, RSVP-17, RSVP-18, WEB-12), all with passing tests (requirement report). Re-verified with passing tests: WEB-07, WEB-09, WEB-10, WEB-11, RSVP-01, RSVP-03, RSVP-05, RSVP-11. Overall: 197 of 292 active requirements are implemented, 187 of them with passing results; the other 10 are the requirements of the deployment test, whose result in `reports/vitest-deploy.json` is old because that test runs on CI only.

**Tests:**
- Vitest, all workspaces: 135 files, 1401 tests, all passed.
- Playwright, CI-style run (`CI=1 npm run test:e2e`, two retries, all four projects): 93 passed, 69 skipped, 0 failed, 2 flaky that passed on the retry (both on `mobile-ios`: the RSVP test timed out, and `skeleton.spec.ts` saw an opened platform). Before this run two tests had failed because of this epic's changes (the theme reset needs a hold now, the opening date has a new format). Both were fixed and passed individually, then the complete run above was done.
- The two flaky tests are now tagged `@flaky` and listed in `spec/test-strategy.md` 8.8.
- Not run here: the deployment test (`npm run test:deploy`, CI only), a build of the image. Not checked by hand: the new settings cards, the hold button and the multi-day programme in a real browser, including phones.

**Spec changes and deviations:**
- 7.4.3 (program items and activities) was written before the epic. During it: the countdown is the same for every guest; every day with an activity is an event day; open-ended activities end with their calendar day; WEB-09 no longer has a line about hidden items; the confirmation of the design reset and the world rollback is held for four seconds.
- The mocks were redrawn for the programme (also "Several days"), the RSVP, the settings page and the world page, and the README of the mocks has a section of decisions of 2026-11-18.
- `spec/test-strategy.md`: RSVP-16 – RSVP-18 and WEB-12 are off the "not yet implemented" list (total 95); new section 8.8 on flaky tests.
- The branch of this epic is called `feature/epic-5.3-program-items-with-activities`, the epic file says `feature/epic-5.3-program-items-activities`.

**Remaining requirements by epic:** 1 → 1, 4 → 2, 5.4 → 8, 6 → 26, 7 → 30, 8 → 22, 9 → 2, 10 → 4 (95 in all).

**Waiting on the project owner:**
- Epic 5.4 (children's menus and RSVP improvements) depends only on 5.3: propose `ready` once this epic is merged.
- Decide whether the website header should show a range of dates for a programme over several days (it shows the first day's date).
- Two stale entries in the "not yet implemented" list: CNT-03 and SEC-04 have passing tests (warnings of the report, not from this epic).
- Real-device check of the hold button and the new date field on phones.

**Risks and notes:**
- The two flaky e2e tests on `mobile-ios` are not understood yet. The `skeleton.spec.ts` one hints at tests that share state in the parallel run.
- The migration `0024_program_item_activities` changes the schema of production data: the migration check passed from the database of the last release (v2.0.0), and the backup before the update is the safety net.


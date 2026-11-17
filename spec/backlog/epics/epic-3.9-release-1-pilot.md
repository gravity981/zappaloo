# Epic 3.9 – Findings from the Release 1 Pilot

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Release 1 updates | 3.5 | `feature/stage-3.9` (PR #7) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-12 after running v1.0.2 on prod. The decisions are in sw-architecture.md 7.1.2, 7.4.2, 8.3 and 9.6.1 and in mocks/README.md. Numbered 3.9 so that stages 4–10 keep their numbers. Branch `feature/stage-3.9`. Each step can go to prod as a Release 1 update. Prod holds real guest data, so every migration is checked against a copy of the prod backup on staging before it is promoted.

**Before the epic starts:**
- Stage 3.5 is complete and merged; `feature/stage-3.9` starts from it (done 2026-11-12).
- The decisions of 2026-11-12 are written into the spec (this plan, 7.1.2, 7.4.2).
- *Decided 2026-11-12:* with approval off, the guest removes an added accompanying person until the deadline, and the admin removes one in Rückmeldungen at any time (7.4.2, step 3.9c).
- *Decided 2026-11-12:* a blocked user gets the same "Benutzername oder Passwort falsch" as for a wrong password (7.1.2, step 3.9e).

## Stories

### Story 3.9a – Fixes from the pilot

Rückmeldungen no longer moves sideways on a swipe on iOS and Android: its tables scroll inside their own box (checked for every admin page at phone width). The account panel shows the "Eingeladen zu" chips for every account with `vip`, also when it has `staff` or `admin` and right after "Konto anlegen". The footer reads "Datenschutz · Version x.y.z" (19.6). Tests: a Playwright run at phone width that a horizontal swipe does not scroll any admin page. A component test for the chips with combined roles. The footer text.
Requirements: none new.
Re-verified: RSVP-02, RSVP-05, SEC-09, OPS-08.

### Story 3.9b – Program item instead of part

"Programmpunkt" in every text (i18n keys, mocks, e-mails, CSV headers), `programItem` in code, `/program-items` in the API, tables and columns renamed by a Drizzle migration (`event_parts` → `program_items`, `membership_parts`, `invitation_parts`, the `part_id` columns). Audit action names of existing entries are migrated too, so "Zuletzt" still reads them. No behaviour changes.
Requirements: none new.
Re-verified: RSVP-01 – RSVP-10, DATA-05 and the migration check against the latest release's schema.

### Story 3.9c – RSVP settings

Mock first: `rsvp-parts` with one answer per person, `admin-settings` card Rückmeldung with the two switches, `rsvp-companion` with "Begleitperson hinzufügen" with and without approval. Then: switch "Pro Programmpunkt zusagen" (off by default), one answer stored for every invited program item, program items added later take the existing answer. (The planned warning about mixed answers when switching was dropped while building: the setting has one short sentence.) Switch "Begleitpersonen bestätigen" (off by default), switching off approves pending requests after a confirmation, badge and tile only with approval on. Texts "hinzufügen". The guest removes an added person until the deadline (approval off), the admin removes one in Rückmeldungen. The migration sets both switches to their defaults, so pending requests on prod are approved by the update.
Requirements: RSVP-11, RSVP-12.
Re-verified (reworded in this story): RSVP-01, RSVP-08, RSVP-09, RSVP-10.

### Story 3.9d – Every invited person has an account

Mock first: `invite-register` (activates the account, variant for a signed-in account without `vip`: "zu deinem Konto hinzufügen"), `profile` (the confirmation of "Konto löschen" says what stays), `admin-invitations` (revoke with "Widerrufen und Gast entfernen"), `admin-rsvp` (inactive guests as "ohne Antwort"). Then: `users.status` and a nullable username. Creating an invitation creates its inactive account (`invitations.user_id`, program items on the membership only). Registration activates it. Merge into a signed-in account without `vip`. Revoking the last open invitation of a never-activated account deletes it (INV-20). Deleting an account deletes its invitations. A guest's own deletion keeps the guest-list entry as inactive. Inactive accounts cannot sign in and get no reminder. New default privacy text. The migration of existing data (7.1.2). Tests include the concurrency test of redemption (INV-08) with the account, the merge, the migration on a database with v1.0.2 data, and the sign-in refusal of inactive accounts.
Requirements: ACC-17, INV-20.
Re-verified: ACC-01, ACC-07, ACC-09, ACC-12, INV-03, INV-07, INV-08, INV-10, RSVP-07, RSVP-09, SEC-09.

### Story 3.9e – Konten & Rollen and Einladungen

Mock first: `admin-users` (columns Benutzername | Name | Status | Rollen | Fähigkeiten, filter chips, panels for inactive, active and blocked accounts, "Konto anlegen" with program item chips), `admin-invitations` ("Aufräumen (n)"). Then: the table and filters, panel per state with locked roles while inactive, block and unblock (sessions and links end), "Konto löschen" for admins, "Konto anlegen" creates an inactive account and requires program items with `vip`, "Aufräumen" deletes revoked and replaced invitations.
Requirements: ACC-18, ACC-19, ACC-20, INV-21, INV-22 (INV-22 added 2026-11-13: deleting a redeemed invitation whose account is gone, with "Löschen" in the actions column of Einladungen, beside "Neu erzeugen" and "Widerrufen"; second click "Endgültig löschen").
Re-verified: ACC-08, ACC-10, ACC-14, ROLE-01, ROLE-09.

### Story 3.9f – Person types

Mock first: `admin-invitations` (type per batch, one letter per row), `admin-users` (type in the panel), `rsvp-companion` (type chips, required), `rsvp-people` (optional menu for a child), `admin-rsvp` (totals by type, column "Typ"). Then: `person_type` on memberships and companions (adult for existing data), the menu rule takes the type, totals, guest table and CSV by type.
Requirements: RSVP-13, RSVP-14, RSVP-15.
Re-verified: RSVP-03, RSVP-05.

### Story 3.9h – Fixes from the stage-3.9 review

(added 2026-11-12, before 3.9g). A guest whose card was replaced before the update can be deleted and uninvited (an old replaced code no longer blocks it). The single bar "Übersicht" counts persons instead of the first program item (`personTotals`), with the text "42 ja (37 Erwachsene, 5 Kinder) · 3 nein". The merge takes over the person type and survives a shared group. A blocked account gets no reset mail, no link from an admin and no reminder, and a session counts only for an active account. An inactive account an admin created gets "Neuen Einrichtungslink erstellen". A child's menu can be left open again. Smaller fixes in Rückmeldungen, Konten & Rollen, Einladungen (column order as in the mock, no double requests) and the invitation page. Tests: API and component tests for each fix, a Playwright flow for blocking, deleting, revoking with removal and "Aufräumen", one for the merge, and the guest's answer page in the phone-width check.

### Story 3.9g – Update on prod

Image build and deployment test. Staging restored from the latest prod backup and updated, so the migrations run on real data (OPS-13). Release candidate, promotion and deployment to prod with the pre-deploy backup. Manual checks on a phone (swipe, RSVP with one answer, adding a companion, redeeming a card for a pre-created account). The admin copies the new "Löschen" paragraph into the privacy notice on prod (7.1.2), because an edited notice keeps its text. Status report for stage 3.9.
Requirements: none new.

## Report

### Status report (2026-11-12, written after the code steps)

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

# Epic 5.4 – Children's Menus and RSVP Improvements

| Status | Release | Depends on | Branch |
|---|---|---|---|
| refined | Opening | 5.3 | `feature/epic-5.4-menus-rsvp-improvements` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-18. Children get a menu list of their own, the RSVP is called "Anmeldung", guests land on it right after redeeming their invitation, and the RSVP and account tables of the admin area become easier to scan. Numbered 5.4 so that it is built before epic 6 and the Opening.

**Current state (2026-11-18):**
- One menu list for everyone, the children's menu included (7.4.1); a child's menu is optional (RSVP-14). Without menus nobody is asked.
- Redeeming an invitation always goes to `/` (`frontend/src/pages/InvitePage.tsx`): the waiting page while closed, the game with an active world (whose guided first entry asks for the RSVP as its third step), otherwise the start page. The guest never lands on the RSVP directly.
- The invitation list shows the invited program items as one letter each (first letter, full names in the tooltip). The RSVP table and the account table show full names and role chips that can be toggled in the table.
- "Rückmeldung" appears in the UI texts, the reminder email, the default privacy notice, the mocks and the spec; sign-in is "Anmelden" / "Abmelden".

**Before the epic starts:**
- Epic 5.3 is done (both epics change the RSVP tables, the wizard and the overview; 5.4 builds on 5.3's migration).
- The mocks of story 5.4a are confirmed before story 5.4c starts.

**Status refined (2026-11-18):** waits for epic 5.3.

**Decisions** (2026-11-18, with the project owner):
1. **Children's menus.** Einstellungen has two lists, "Menüs" (adults) and "Kindermenüs". An adult chooses from the adults' list, a child from the children's list only. Like an adult's, a child's menu is required while the children's list has entries; without children's menus a child is not asked, the same as an adult without menus (RSVP-14 changes).
2. **Existing choices.** The update does not move menus between lists; the admin creates the children's list. A child who chose a menu of the adults' list keeps it until it is chosen again; the overview marks it "Erwachsenenmenü".
3. **"Sonstiges/Anmerkungen"** next to the allergies, for the main invitee only (not the accompanying persons), optional, at most 500 characters. Protected like the allergies: the guest's own wizard and admins only, in the guest table and the CSV, never in the audit log, deleted at shutdown (SEC-11).
4. **"+Begleitung" and "+Kind"** replace the one button for an accompanying person. Both open the same form; they only preselect the person type, which stays changeable in the form.
5. **Anmeldungen table:** a column "E-Mail" next to the status, in the same tag style: "bestätigt", "offen" (an address that is not verified), or "–" (no address, and for accompanying persons).
6. **Short forms.** The columns Typ (E, K), program items and menu of the Anmeldungen table show one short form per entry, with the full names in the tooltip and for screen readers, like the invitation list. Program items and menus get an optional "Kürzel" (1–2 characters) in Einstellungen, by default their first letter; the invitation list uses the same codes.
7. **Konten & Rollen:** the column Rollen is read only and shows one letter per role (V vip, S staff, A admin); roles are changed in the account's panel. Fähigkeiten shows short forms too (I Inhalte, M Moderation).
8. **Landing on the RSVP.** After redeeming an invitation (new account or an existing one), a guest who has not answered yet lands on `/rsvp` while the RSVP is open (feature on, before the deadline), whether the platform is closed or open. "Weiter" after the summary goes to `/`. With an active world, the guided first entry then skips its RSVP step, since it is answered.
9. **"Anmeldung" instead of "Rückmeldung"** everywhere guests and admins read it: UI texts, the reminder email, the default privacy notice, the mocks and the spec ("Anmeldungen", "Einstellungen › Anmeldung", "Zur Anmeldung"). So that no word means two things, sign-in becomes **"Einloggen" / "Ausloggen"** ("Einloggen geht nicht", "Zum Einloggen"). Code names (`rsvp`, routes, tables, audit actions) stay. Texts an admin has already edited (waiting page texts, privacy notice) are not changed by the update; the release notes say so.

## Stories

### Story 5.4a – Spec and mocks

Mock screens: `rsvp-people`, `rsvp-companion`, `rsvp-done`, `admin-rsvp`, `admin-users`, `admin-settings`, `admin-invitations`, `login`, `waiting`.
- The two menu lists, the remarks field, "+Begleitung" / "+Kind", the E-Mail column and the short forms, the read-only role letters, the new words; the decisions in `spec/mocks/README.md`.
- The project owner confirms the mocks before story 5.4c starts.
Requirements: none new.

### Story 5.4b – "Anmeldung" and "Einloggen"

- All German UI texts, the reminder email and the default privacy notice; tests that look for the old words.
Requirements: LANG-03.

### Story 5.4c – Children's menus

Mock screens: `admin-settings`, `rsvp-people`.
- The list a menu belongs to (`menus.for_children`, migration: every existing menu is an adults' menu), the two lists in Einstellungen, the wizard's choice by person type, the required child's menu, "Erwachsenenmenü" for kept choices; totals and CSV per list.
Requirements: RSVP-19.
Re-verified: RSVP-03, RSVP-05, RSVP-14, RSVP-15.

### Story 5.4d – Sonstiges/Anmerkungen

Mock screens: `rsvp-people`, `admin-rsvp`.
- The field for the main invitee, stored with the answer, in the guest table (admin only) and the CSV; deleted with the allergies.
Requirements: RSVP-20.
Re-verified: SEC-11.

### Story 5.4e – "+Begleitung" and "+Kind"

Mock screen: `rsvp-companion`.
- Two buttons, one form, the type preselected.
Requirements: RSVP-21.
Re-verified: RSVP-08, RSVP-13.

### Story 5.4f – Anmeldungen table: E-Mail column and short forms

Mock screens: `admin-rsvp`, `admin-settings`, `admin-invitations`.
- The "Kürzel" of program items and menus (optional, 1–2 characters), the E-Mail column, the short forms in the Anmeldungen table and the invitation list.
Requirements: RSVP-22, RSVP-23.

### Story 5.4g – Konten & Rollen: letters for roles and capabilities

Mock screen: `admin-users`.
- Rollen read only as letters, changed in the panel; Fähigkeiten as letters.
Requirements: ROLE-11.
Re-verified: ROLE-01, ROLE-06.

### Story 5.4h – Landing on the Anmeldung after redeeming

Mock screens: `invite-register`, `rsvp-done`.
- After redeeming, an unanswered guest lands on `/rsvp` while the RSVP is open; "Weiter" after the summary leads to `/`; the guided first entry skips its RSVP step.
Requirements: RSVP-24.
Re-verified: GAME-13, ACS-10.

### Story 5.4i – Epic report

- Final verification and epic report.
Requirements: none new.

## Report

<Added when the epic is complete, from the template in README.md.>

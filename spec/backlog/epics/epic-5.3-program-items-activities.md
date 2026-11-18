# Epic 5.3 – Program Items and Activities

| Status | Release | Depends on | Branch |
|---|---|---|---|
| ready | Opening | 4 | `feature/epic-5.3-program-items-activities` |

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
4. **Programm page:** the activities, by time, of the guest's invited program items. "Now / next", the "now" marker and the countdown read activities. The countdown counts to the first activity of all program items and shows its date and place; it is the same for every guest, invited to it or not (changed 2026-11-18, project owner). The event day starts with the day of the first activity of all.
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

<Added when the epic is complete, from the template in README.md.>

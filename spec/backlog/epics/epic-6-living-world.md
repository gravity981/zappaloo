# Epic 6 – Living World

| Status | Release | Depends on | Branch |
|---|---|---|---|
| open | Opening (completes it) | 5 | `feature/epic-6-living-world` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- Seating plan of the first event, at least as test data.

## Stories

### Story 6a – Wandering figures

Figures of attending guests in the wander areas of one map per guest (picked at random, kept per guest); own avatar instead of own figure; simulated per device.
Requirements: PRES-01, PRES-02, PRES-04, PRES-08, AVA-04.

### Story 6b – Profiles and speech bubble

Profile photo, greeting, "How I know the couple" with relation list; speech bubble opening for the nearest figure; admin can remove profile data.
Requirements: PRES-09, PRES-10, PRES-13, PRES-14, PRES-15.

### Story 6c – Seating plan and table finder

Tables and seats, default seats for accompanying persons, admin override, table finder with tablemates, visibility date.
Requirements: PRES-05, PRES-06, PRES-07, PRES-12.

### Story 6d – Dialogues

Mock screen: `admin-world` (variant "Dialoge"). Moved here from 5g on 2026-11-17.
- Dialogues edited by admins in Erlebniswelt › Dialoge (id, NPC name, lines in Markdown, "Verwendet von"), audited with ids only. Deleting is refused while an object shows the dialogue; changing the id keeps the assignments.
- The action `dialog`: the NPC name and the lines, which the guest taps through. The dialogues the admin can pick for a clickable object (Objekte & Portale) and the `preset_missing` warning for a dialogue that does not exist start working with them.
Requirements: CNT-02 (the dialogue and NPC text part; albums follow in step 7d), CNT-03 (completing it).

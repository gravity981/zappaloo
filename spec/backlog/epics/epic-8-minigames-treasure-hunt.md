# Epic 8 – Minigames, Treasure Hunt and Highscores

| Status | Release | Depends on | Branch |
|---|---|---|---|
| open | Event-ready | 5 | `feature/epic-8-minigames-treasure-hunt` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- Decide which minigames ship with the platform for the first event (at least the couple quiz) and provide the quiz questions.

## Stories

### Story 8a – Minigame framework

Minigames as Phaser scenes with pause and resume; data passed to and from the minigame through the minigame API; generic result storage; registry by `minigameId`.
Requirements: MG-01, MG-02, MG-03, MG-04, MG-05, MG-06, MG-07, MG-11.

### Story 8b – Anti-cheat and highscores

Attempt IDs, plausibility profiles, server-side quiz checks; central highscores; leaderboards on the website and live on the event screen.
Depends on story 7e (event screen) for the live leaderboard (SCR-05): this story is built after epic 7 is done, or the leaderboard part waits until then.
Requirements: MG-08, MG-09, MG-10, WEB-05, SCR-05.
Follow-up from stage 2: minigame start and result submission checked on the server, with `[ACS-07]` tests.

### Story 8c – Couple quiz on smartphones

The first minigame, playable with touch, startable directly from a website page or a QR code.
Requirements: MG-12, MG-13.

### Story 8d – Treasure hunt

Hunt items with printable QR codes, collecting, collected items in profile and game, unlock condition, ranking, time window.
Requirements: HUNT-01, HUNT-02, HUNT-03, HUNT-04, HUNT-05, HUNT-06, HUNT-07.
Follow-up from stage 2: the treasure-hunt leaf of the access conditions, with `[ACS-05]` tests.

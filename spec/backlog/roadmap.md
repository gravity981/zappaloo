# Zappaloo – Roadmap

The roadmap shows the order in which the epics are built and the points where a release goes into production. Each epic has its own file in [epics/](epics/) with its refinement, its stories and, once it is done, its report. How we work on epics is described in [README.md](README.md).

The epics follow the order of work in [sw-architecture.md](../sw-architecture.md), section 28. Until 2026-11-17 they were called stages and their stories were called steps, and they lived in a single `implementation-plan.md`. The numbers did not change: "stage 6" or "step 6d" in the spec, the mocks and older commits means epic 6 or story 6d.

## Releases

| Release | After epic | What guests get |
|---|---|---|
| **Release 1 (early)** | 3.5 | Redeem invitation, answer the RSVP, waiting page with the door scene, add the site to the home screen as an app. The platform is closed. |
| Release 1 updates | 3.9 | Findings from the pilot on prod: one RSVP answer for all program items, "Begleitperson hinzufügen" without approval, person types; invited guests on the guest list before they redeem. |
| **World pilot** | 5.1 | Content pages and website, the programme, and the game world with the prototype world as a pilot on prod: straight paths, target marker, edge indicators. Its findings feed epics 5.3, 5.4 and 6. |
| **Living-world pilot** | 6.1 | The living world as a further pilot on prod, with the platform still closed to guests: wandering figures, speech bubbles, table finder, NPCs, dialogues and atmosphere, polished in epic 6.1. Its findings feed the next epics. |
| **Event-ready** | 9 | Contributions, photo wall, moderation, minigames, treasure hunt; load test passed and release checklist done. |
| **After the event** | 10 | Export, shutdown notice and deletion (mandatory, ready before the shutdown date). |

The release after epic 6, first planned as "Opening", became the **Living-world pilot** on 2026-11-19: the platform is not opened to guests yet, and further pilots may follow; the name "Opening" is no longer used for a release. Each release goes into production. From Release 1 on, real guest data is stored, so backups (epic 1), the privacy notice (epic 3) and the installable app (epic 3.5) were in place before Release 1.

## Order of the epics

The order is the priority: of the epics that are **ready**, the highest one in the table is started first. Epics whose dependencies are done can be built in parallel, each on its own branch. A row marked ▶ is a release point. The release goes out once all the epics above it are done.

| Epic | Content | Depends on | Status |
|---|---|---|---|
| [1](epics/epic-1-walking-skeleton.md) | Walking skeleton and deployment | – | done |
| [2](epics/epic-2-accounts-roles-access.md) | Accounts, roles and access | 1 | done |
| [3](epics/epic-3-rsvp-waiting-page.md) | RSVP and waiting page | 2 | done |
| [3.5](epics/epic-3.5-installable-app.md) | Installable app (home screen icon, no browser chrome) | 3 | done |
| ▶ | **Release 1** (v1.0.2 on prod, 2026-11-12) | | released |
| [3.9](epics/epic-3.9-release-1-pilot.md) | Findings from the Release 1 pilot | 3.5 | done |
| ▶ | **Release 1 updates** (prod, 2026-11-13) | | released |
| [4](epics/epic-4-content-website.md) | Content and website | 3.9 | done |
| [5](epics/epic-5-game-world.md) | Game world and world importer (review findings fixed in 5l) | 4 | done |
| [5.1](epics/epic-5.1-gameworld-prototype-findings.md) | Game world prototype findings: straight paths, target marker, edge indicators, iOS stutter | 5 | done |
| ▶ | **World pilot** (v2.0.0 on prod, 2026-11-17, with the prototype world) | | released |
| [5.2](epics/epic-5.2-theme-package-editor.md) | Theme package editor: a development tool to define, preview and export theme packages | 4 | done |
| [5.3](epics/epic-5.3-program-items-activities.md) | Program items and activities: a program item (RSVP) has one or more activities (programme) | 4 | done |
| [5.4](epics/epic-5.4-menus-rsvp-improvements.md) | Children's menus and RSVP improvements: "Anmeldung", landing on it after redeeming, remarks, clearer admin tables | 5.3 | done |
| [6](epics/epic-6-living-world.md) | Living world: guest figures, speech bubbles, table finder, dialogues, NPCs, atmosphere, animated objects | 5 | done |
| [6.1](epics/epic-6.1-living-world-polish.md) | Living world polish: own figure, silhouettes, dialogues and speech bubbles, welcome dialogue, loading, app updates and smoothness on iOS | 6 | ready |
| ▶ | **Living-world pilot** | | open |
| [7](epics/epic-7-contributions-event-screen.md) | Contributions and event screen | 5 | open |
| [8](epics/epic-8-minigames-treasure-hunt.md) | Minigames, treasure hunt and highscores (story 8b also needs 7e) | 5 | open |
| [9](epics/epic-9-event-readiness.md) | Event readiness | 6, 7, 8 | open |
| ▶ | **Event-ready** | | open |
| [10](epics/epic-10-after-the-event.md) | After the event (must be done before the shutdown date) | 9 | open |
| ▶ | **After the event** | | open |

## Status of an epic

| Status | Meaning |
|---|---|
| **open** | Planned, not refined yet. Its stories may be a first sketch. |
| **refined** | The project owner has confirmed the refinement, but the epic cannot start yet: an epic it depends on is not done, or a precondition ("Before the epic starts") is not met. The epic file says what it waits for. |
| **ready** | Refined, every precondition met and every epic in "Depends on" done. It can be started at any time. |
| **in progress** | Its branch exists and its stories are being built. |
| **done** | Its epic report is written and its pull request is merged into `main`. |
| **dropped** | Not built. The epic file says why. |

A release row is **open** or **released**.

**Dependencies.** "Depends on" lists the epics that must be **done** before this epic can be **ready**: their code is merged and this epic builds on it. A dependency of a single story (e.g. 8b on 7e) is written into that story instead. It does not block the epic, but the story waits, or is built last. Dependencies are decided in the refinement.

## Changing the roadmap

- A new epic gets the next free number at the end. An epic that must be built between two existing ones gets a decimal number (3.5, 3.9), so that the later epics keep their numbers.
- Numbers are never reused or renumbered. A dropped epic keeps its file, with the status **dropped** and the reason.
- Each epic's status is kept in two places, its file and the table above, and both must agree (a test checks it).
- Moving a release point, or moving an epic to another release, is decided with the project owner and noted in the epics concerned.

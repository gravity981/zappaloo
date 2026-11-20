# Epic 6.1 – Living World Polish

| Status | Release | Depends on | Branch |
|---|---|---|---|
| in progress | Living-world pilot (completes it) | 6 | `feature/epic-6.1-living-world-polish` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-19, after the project owner tried epic 6. A set of improvements to what epics 5 – 6 built, not new features: the game world, its speech bubbles and dialogues, the loading of the game and the behaviour of the installed app on iOS. Numbered 6.1 so that it is built before the Living-world pilot and the later epics keep their numbers.

**Findings of the project owner** (2026-11-19, unchanged):
1. Clicking the own player figure should not open the profile. The guest reaches the profile through the website.
2. Figures walking behind obstacles should be visible as silhouettes.
3. On the first entry into the world, the hint "Tippe auf Dinge, die funkeln" is replaced by a dialogue that the admin can edit.
4. When an object or NPC has a dialogue assigned and its label is on, it shows the dialogue's figure name. NPCs are configured like clickable objects. A dialogue no longer asks for a "Kennung".
5. Each dialogue has a greeting text, shown in the speech bubble of the object that has the dialogue assigned. An empty greeting means no speech bubble.
6. NPCs whose dialogue has a greeting show the speech bubble like guest figures do, but from 4 tiles away.
7. When many wandering figures and objects near the player would show a speech bubble, only one bubble is visible: the closest figure's.
8. A portal's label needs more offset upwards.
9. The loading text "Die digitale Erlebniswelt wird geladen" is replaced by a black canvas of the size the game will have.
10. While the game (Phaser) starts, a progress bar is shown on the black canvas.
11. When a new release is deployed, the installed app updates itself, which it does not today, and the icon on the home screen follows when it has changed.
12. Check that resources are freed when the app is closed: the project owner's iPhone gets noticeably slower after closing the app.
13. Overlays opening in the game world stutter and lag on iOS. They should open smoothly.

**Decisions** (2026-11-19, with the project owner; the numbers are those of the open questions of the first sketch):
1. **Dialogue id (Q1):** the admin no longer enters it. The id is made from the figure name when the dialogue is created and is shown read-only in the dialogue's panel, so that Tiled presets (`action: dialog`, `contentId`) keep working.
2. **NPC like a clickable object (Q2):** the NPC row gets the same fields as a clickable object: an action, and the indicator and label (`showIndicator`). The NPC's own name and short dialog (MAP-21, table `world_npcs`, migration `0033`) are dropped, existing values included; they are not moved into dialogues. Name and greeting come from the NPC's dialogue. An NPC with a page action and no dialogue is labelled by the page title (GAME-40), otherwise by its Tiled name.
3. **Objects with a greeting (Q3):** clickable objects and NPCs follow the same rule. When their dialogue has a greeting, they show it in a speech bubble over their top when the player is within 4 tiles.
4. **One bubble (Q4):** exactly one speech bubble is visible at a time. Each figure or object has its own range: guest figures 0.8 tile widths, objects and NPCs with a greeting 4 tiles. Of all those whose range the player is in, the nearest one's bubble is shown. A bubble the player tapped to keep open (PRES-10) stays until the player walks away, and no other bubble opens meanwhile.
5. **Welcome dialogue (Q5):** a dialogue picked in Erlebniswelt › Einstellungen as "Begrüssungsdialog" (none = no welcome). It opens once, on the first entry after the guided setup (GAME-13), instead of the hint of GAME-17. The platform ships no default.
6. **Silhouettes (Q6):** the player's avatar, the guest figures, the NPCs and the target marker of a tap (GAME-24; added 2026-11-19 by the project owner) show a flat silhouette (theme colour, about 50 % opacity) where objects of the Props and Foreground layers cover them, through occlusion (GAME-19) included. A silhouette is shown only when more than 2/3 of the figure is covered. If measuring the covered share costs too much on iOS, it is shown only when the whole figure is covered. The target marker shows its silhouette as soon as any part of it is covered (decided 2026-11-19).
7. **Portal label (Q7):** the label sits above the highest point of the floating arrow's bob, plus the 4 px of the other labels.
8. **Loading (Q8):** a black canvas of exactly the size of the game view (below the game bar, inside the safe areas). Until Phaser starts loading, the existing loading text is shown in white in its middle. Once Phaser loads, a progress bar shows the loader's progress (world package files, figures, tilesets), then the map build. Below the bar, each step shows a short, playful text picked at random from a pool (e.g. "Bäume werden gepflanzt", "Strassen werden gewischt"). The grey veil between maps (GAME-30) stays as it is.
9. **App update (Q9):** no service worker. The client compares its version with the server's (`/api/version`) when it starts and when it comes back to the foreground, and reloads at a safe moment when they differ: at once on the website, and in the game when no overlay or dialogue is open. The home-screen icon: the app serves the new one; Android updates it on its own, on iOS the guest removes the app and adds it again (iOS keeps the icon from the time the app was added, with or without a service worker).
10. **Resources (Q10):** the story measures first on the iPhone (Safari Web Inspector: timeline, memory, WebGL contexts). It then makes sure that in the background the game loop, timers, polling and audio stop (`visibilitychange`, `pagehide`), and that leaving the game destroys Phaser and its WebGL context. The result is reported even if nothing is found.
11. **Smooth overlays (Q11):** code analysis first (blur and backdrop filters over the canvas, the game rendering at device pixels behind the overlay, layout work when the overlay mounts), then reproduction on the iPhone and the fix. The goal is the overlay's animation at full frame rate while the game is paused behind it.
12. **Order (Q12):** the iOS stories first (6.1j, 6.1i, 6.1h), because the pilot runs on phones, then the game stories.
13. **Loading texts (Q13):** the pool of playful loading texts is built into the app in German (about 15 texts) and not editable by the admin.

**Requirements** (decided 2026-11-19). New requirements are added to the spec now and listed as "not yet implemented": GAME-42 (silhouettes), GAME-43 (loading), GAME-44 (smooth overlays), CNT-09 (dialogue greeting and id), PWA-06 (update check), PWA-07 (resources in the background). Requirements that are implemented and tested today are reworded or withdrawn by the story that changes their behaviour, together with their tests, so that the spec and the tests agree after every commit; the new wording is written into the story below.

**Before the epic starts:**
- The project owner answers the open questions of the first sketch. *Done 2026-11-19.*
- The iPhone for checking 6.1h – 6.1j, reaching either the dev server on the LAN or a release candidate on staging.

**Status ready (2026-11-19):** the open questions are answered, epic 6 is done, and the iPhone and staging were already used for epic 5.1.

## Stories

First sketch (2026-11-19), refined with the decisions above. Built in the order of decision 12.

### Story 6.1a – Own figure no longer opens the profile — Done (2026-11-19)

- Tapping or clicking the player's own avatar does nothing, and the profile is reached through the website.
- GAME-18 is withdrawn in this story: "~~Clicking or tapping the player's own avatar opens the profile as an overlay.~~ (withdrawn 2026-11-19, epic 6.1: the profile is reached through the website)"; its tests are removed or turned into a test that tapping the own avatar opens nothing.
- Built: `onPlayerTap` (engine host, `GameCanvas`, `GamePage`), the hit test `onAvatar` and its branch in `GameScene` are removed, so a tap on the figure is an ordinary tap on the ground. The end-to-end test checks that it opens nothing.
Requirements: none new. (The own-avatar tap is withdrawn, see above.)

### Story 6.1b – Silhouettes behind obstacles — Done (2026-11-19)

- Figures covered by objects stay visible as silhouettes (decision 6).
- The target marker of a tap (GAME-24) placed behind an obstacle is shown as a silhouette too, as soon as any part of it is covered (added 2026-11-19).
- Built: `silhouette.ts` (the arithmetic), `silhouette-layer.ts` (alpha masks, covers from tile objects and foreground tile layers, the silhouette sprites and the marker's ring), wired into `GameScene`; the page passes the theme's accent colour. Decisions are in sw-architecture.md ("Silhouettes").
- Open: the frame rate on the iPhone is not checked yet (checked with the diagnostics overlay together with 6.1j); the foreground-layer measuring and the target marker's silhouette are covered by unit tests only, because the test world has no reachable place behind them.
Requirements: GAME-42.

### Story 6.1c – Dialogues give objects and NPCs a voice

Mock screens: admin Erlebniswelt (Dialoge, Objekte & Portale).
- The dialogue's id is no longer entered by the admin (decision 1). A dialogue gets a greeting (empty = no speech bubble).
- NPCs are configured like clickable objects (decision 2); their name and short dialog are dropped with their values (migration). An object or NPC with a dialogue and its label on is labelled with the dialogue's figure name.
- Reworded in this story: **MAP-21** "In Erlebniswelt the admin configures each NPC of a map like a clickable object: an action on tap and whether it has an edge indicator and label. Name and greeting come from its dialogue. The settings are stored per map and NPC name, survive a new world package while the names stay, and are audited." **GAME-39** "Edge indicators also point to NPCs, labelled like objects (GAME-40); an NPC has one unless its `showIndicator` is off." **GAME-40** "An edge indicator and the label of an object or NPC are named by the figure name of its dialogue, otherwise by the title of the page it opens, otherwise by its label or name."
Requirements: CNT-09.
Re-verified: MAP-21, GAME-39, GAME-40, GAME-41 (reworded).

### Story 6.1d – One speech bubble, greetings from 4 tiles

- NPCs (and objects, decision 3) whose dialogue has a greeting show it in a speech bubble from 4 tiles away, like guest figures.
- Only one speech bubble is visible, the nearest figure's (decision 4).
- Reworded in this story: **GAME-37** "When the player comes within 4 tiles of a clickable object or NPC whose dialogue has a greeting, it shows the greeting in a speech bubble; an NPC stops and turns to the player. Only one speech bubble is visible at a time: of the guest figures, objects and NPCs whose range the player is in, the nearest one's (decision 4)." **PRES-10**: "several bubbles can be open at once, and of bubbles that would overlap, only the nearest figure's is shown" becomes "only one speech bubble is visible at a time (GAME-37)".
Requirements: none new.
Re-verified: GAME-37, PRES-10 (reworded).

### Story 6.1e – Welcome dialogue on the first entry

Mock screens: game first entry, admin Erlebniswelt.
- The hint of GAME-17 is replaced by a welcome dialogue the admin edits (decision 5).
- Reworded in this story: **GAME-17** "On the first entry, after the guided start (GAME-13), the welcome dialogue that the admin picked in Erlebniswelt opens once; without one, nothing is shown."
Requirements: none new.
Re-verified: GAME-17 (reworded). Depends on 6.1c.

### Story 6.1f – Portal label higher

- The portal's label sits clear above its floating arrow (decision 7).
Requirements: GAME-41 (re-verified).

### Story 6.1g – Black canvas and progress bar while the game loads

Mock screens: game loading.
- The loading text is replaced by a black canvas the size of the game: the white loading text until Phaser loads, then a progress bar with a random playful text per step (decision 8, Q13).
Requirements: GAME-43.

### Story 6.1h – The installed app updates itself

- The client notices a new release and reloads itself at a safe moment (decision 9). No service worker.
- The new icon is served at once; on iOS the guest adds the app again (decision 9).
Requirements: PWA-06.

### Story 6.1i – Resources freed in the background and on close

- Measure on the iPhone, then stop everything that runs while the app is in the background or closed (decision 10).
Requirements: PWA-07.

### Story 6.1j – Smooth overlays on iOS

- Overlays open over the game at full frame rate on iOS (decision 11).
Requirements: GAME-44. Checked on the iPhone and recorded in the manual test protocol, like GAME-27.

### Story 6.1k – Independent game tests in a project of their own — Done (2026-11-19)

Added 2026-11-19 at the project owner's request, after an analysis of the unstable end-to-end tests: the game tests were one serial chain (a failure skipped the rest and re-ran all of it), ran beside every other spec on a busy machine, and the game's time slows down when the machine is busy (Phaser caps the step of a frame at 200 ms).
- The test world is imported once before the run (`e2e/global-setup.ts`); no game test depends on another.
- The game tests are a Playwright project `game` (one browser, one worker, listed last so that it starts when the other specs are mostly done); `npm run test:e2e:game` runs only it. The other projects ignore the file, which removes 81 skipped tests.
- A test that changes a shared setting (guest access, the sexton's texts) no longer has to put it back on its own: a hook after every test does it through the API, also after a failure.
Requirements: none new.

### Story 6.1l – Deterministic game time in the tests — Done (2026-11-20)

Added 2026-11-19, with 6.1k.
- Test builds (`VITE_TEST_HOOKS`) get a seeded random source for the engine (guest and NPC positions and waits, sparkles) and a way to advance the game by fixed frames, so that a walk takes the same frames whatever the machine's load.
- The fixed waits (`waitForTimeout`) and the timing-dependent assertions of the game tests become state polls or fixed frames (`GAME-09`, `PRES-10`: the guest's walk away is random today, one run in six fails).
- An overlay that covers what a test clicks (the sexton's bubble over the altar's edge indicator, `GAME-26`) is avoided by the test's setup, not by luck of the layout.
- Built: every random choice of the engine goes through `gameRandom` (`random.ts`); a test build seeds it (`?seed=`, default 1) or fixes every choice to one number (`?random=0.01`, which replaces the tests' override of `Math.random`). The test hook `advance(ms)` plays frames of 1/60 s and stops the game's own clock for the rest of the page (`manual-clock.ts`). In `game-world.spec.ts` the helpers `advance` and `advanceUntil` replace the wall-clock waits of GAME-09, GAME-11 (Enter), GAME-11/GAME-13 (typing), PRES-10, CNT-02 (the dialogue box), GAME-26, GAME-32 (birds) and GAME-36 (NPC walks); GAME-26 sends its click to the indicator itself. The retry of CNT-02 finds its dialogue from the first attempt (a dialogue used by an object cannot be deleted) and puts its content back through the API.
- Left as they are: three waits of 500 to 600 ms that only let a screenshot or a negative check settle (`GAME-01`, `GAME-06` paused game, the atmosphere test) and the camera-settle poll; none can fail from a slow machine, and the tests after them need the game's own clock.
- Measured: GAME-09, PRES-10 and GAME-26, 5 runs each with all 12 cores busy, 15 of 15 passed (before: PRES-10 failed about one run in six on a quiet machine). The project "game" takes 3.4 minutes instead of 4.7; the slowest test is 14 s (the birds test took 43 s, GAME-36 24 s).
- Open: whether a speech bubble may cover an edge indicator is a layout question for the project owner (the test no longer depends on it).
Requirements: none new.

## Report

<Added when the epic is complete, from the template in README.md.>

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
14. (2026-11-20) The labels of edge indicators and the labels in sight elide too early: longer site names must show without eliding.
15. (2026-11-20, acceptance criterion of story 6.1d) The greeting speech bubbles of NPCs show no portrait and are as small as possible to hold the greeting text.

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
- Checked on the iPhone (2026-11-20, project owner): the frame rate is good.
- Not covered by a device check: the foreground-layer measuring and the target marker's silhouette are covered by unit tests only, because the test world has no reachable place behind them.
Requirements: GAME-42.

### Story 6.1c – Dialogues give objects and NPCs a voice — Done (2026-11-20)

Mock screens: admin Erlebniswelt (Dialoge, Objekte & Portale).
- The dialogue's id is no longer entered by the admin (decision 1). A dialogue gets a greeting (empty = no speech bubble).
- NPCs are configured like clickable objects (decision 2); their name and short dialog are dropped with their values (migration). An object or NPC with a dialogue and its label on is labelled with the dialogue's figure name.
- Reworded in this story: **MAP-21** "In Erlebniswelt the admin configures each NPC of a map like a clickable object: an action on tap and whether it has an edge indicator and label. Name and greeting come from its dialogue. The settings are stored per map and NPC name, survive a new world package while the names stay, and are audited." **GAME-39** "Edge indicators also point to NPCs, labelled like objects (GAME-40); an NPC has one unless its `showIndicator` is off." **GAME-40** "An edge indicator and the label of an object or NPC are named by the figure name of its dialogue, otherwise by the title of the page it opens, otherwise by its label or name."
- Built: the dialogue has a greeting (`dialogues.greeting`) and its id is made from the figure name (`backend/src/dialogue/id.ts`: umlauts spelled out, `-2`, `-3` when taken) and never changes (the old rename with its re-pointing of assignments is gone); migration `0035` adds the column and drops `world_npcs`; the NPC routes and `setNpc` are gone. NPCs are rows of the objects table, marked "NPC" (`AdminWorldNpcs` is deleted). `GET /api/world` lists, for NPCs whose effective action is a dialogue, the figure name, the greeting and the portrait, and `dialogues` (id, figure name); the game names an object or NPC by its dialogue, else by the page's title, else by its label or name (`objectTitle`, `npcTitle`).
- Decided while building: the greeting has at most 120 characters (the limit of the old short dialog); the test world's pastor preset names `pfarrer-keller`, which is what "Pfarrer Keller" gives; the speech bubble of an NPC keeps its 3 tiles until story 6.1d, and objects get no bubble before 6.1d. The NPC in the sight label is now named by the page's title, not its Tiled label, when its action is a page (GAME-40), which the e2e test of GAME-41 checks.
- Stabilized in this story (reported from CI, 2026-11-20): the e2e test of CNT-02 failed on every attempt because the dialogue box ignores a tap in its first 300 ms of real time and, since story 6.1l, the test reached the tap without real time passing; the box now says when it takes taps (`data-settled`) and the test and the unit tests wait for that. The test of the sexton's bubble hung because its loop clicked the bubble in the moment after the action ran, when the game is paused and the bubble hidden while the dialogue loads; the loop taps only a visible bubble, with a timeout, and the tests of the sexton run in game time (`advanceUntil`). Both were run three times in a row with every core busy.
- Also fixed (found while checking this story with the hook): the remembered pass of story 6.1m did not match when the commit contains a rename (a snapshot of the migration moved to a new number): git shows a staged rename as one entry and the working tree as a deletion and a new file, so the keys differed and the checks ran twice. The files are now listed without rename detection (`scripts/precommit/changes.ts`), and a test with a real repository and a rename guards it.
Requirements: CNT-09.
Re-verified: MAP-21, GAME-39, GAME-40, GAME-41 (reworded).

### Story 6.1d – One speech bubble, greetings from 4 tiles — Done (2026-11-20)

- NPCs (and objects, decision 3) whose dialogue has a greeting show it in a speech bubble from 4 tiles away, like guest figures.
- Only one speech bubble is visible, the nearest figure's (decision 4).
- Reworded in this story: **GAME-37** "When the player comes within 4 tiles of a clickable object or NPC whose dialogue has a greeting, it shows the greeting in a speech bubble; an NPC stops and turns to the player. Only one speech bubble is visible at a time: of the guest figures, objects and NPCs whose range the player is in, the nearest one's (decision 4)." **PRES-10**: "several bubbles can be open at once, and of bubbles that would overlap, only the nearest figure's is shown" becomes "only one speech bubble is visible at a time (GAME-37)".
- Added by the project owner, 2026-11-20 (acceptance criterion): the greeting bubbles of NPCs (and, being the same bubble, of objects) show **no portrait** and are **as small as possible to contain the greeting text**: no picture, no initials, no name; the label of the figure stays and the bubble stands above it.
- Added by the project owner, 2026-11-20 (finding 14): the **labels of edge indicators and in-sight labels elide too early**: it must be possible to have longer site names without eliding. The limit of 160 pixels in one line is gone: a label is at most 260 pixels wide and wraps onto up to three lines; only a text beyond three lines is cut off.
- Built: `GET /api/world` lists the greetings of clickable objects (`greetings`); `chooseBubbles` returns one bubble (the pinned one, else the nearest); greeting bubbles are compact (`greetingBubbleSize`, text only, hanging from the figure's top, above the label by `labelClearance`) and open from 4 tiles, closing beyond 4.5; an object's distance is that to the nearest point of its picture or shape (`distanceToRect`); a tap on an object's greeting taps the object. The label of an NPC no longer hides while its bubble is open. Labels wrap (`labelLines`, `objectLabelHeight`).
- Decided while building: PRES-10 keeps its rule that a pinned bubble stays until its cross is used (decision 4 says "until the player walks away", which is the same bubble: it is the guests' bubble that can be pinned, and it is the one that does not close when the player walks away); no other bubble opens while one is pinned. The bubble of an NPC is anchored at the top of its body, where its label stands, not at the sprite, which is drawn a little lower.
- Also stabilized: five frontend unit tests (profiles, seating, theme, entry) failed now and then in a full run, always just after one second: the default of Testing Library for `findBy*` and `waitFor` is 1000 ms, which a run of 167 test files at once exceeds. `asyncUtilTimeout` is now 5000 ms in `frontend/src/test/setup.ts`; it only decides how long a test that really fails waits.
Requirements: none new.
Re-verified: GAME-37, PRES-10 (reworded), GAME-26, GAME-41 (labels wrap).

### Story 6.1e – Welcome dialogue on the first entry — Done (2026-11-20)

Mock screens: game first entry, admin Erlebniswelt.
- The hint of GAME-17 is replaced by a welcome dialogue the admin edits (decision 5).
- Reworded in this story: **GAME-17** "On the first entry, after the guided start (GAME-13), the welcome dialogue that the admin picked in Erlebniswelt opens once; without one, nothing is shown."
- Built: the admin picks the dialogue in Erlebniswelt › Welt & Import ("Begrüssungsdialog"); it is the flag `dialogues.welcome` (migration `0036`), `PUT /api/admin/world/welcome-dialogue`, `welcomeDialogue` in the world status and in `GET /api/world`. The game page opens it after the guided steps. The hint (`GameHint`, its style and its `hintSeen` key) is removed, and so is the unit test [GAME-07] of the hint's wording: GAME-07 stays covered by the end-to-end tests of the screen sizes.
- Decided while building: GAME-13 puts the RSVP in the guided start, so the welcome opens after the RSVP overlay is closed (GAME-17 says "after the guided start"). It is shown once per first entry and not remembered on the device, so a guest who already has a figure does not get it.
- Fixed with it (project owner, 2026-11-20): the cross of a pinned speech bubble was an ellipse in the game preview and a circle in the app. The preview's stylesheet gives every `button` `min-height: 2.4rem` and padding; the engine's cross set only width and height, so the preview stretched it. The cross now sets `min-width`, `min-height`, `padding`, `margin` and `box-sizing` itself, so no host stylesheet can change it (`bubble-layer.test.ts`).
Requirements: none new.
Re-verified: GAME-17 (reworded), PRES-10 (the cross). Depends on 6.1c.

### Story 6.1f – Portal label higher — Done (2026-11-20)

- The portal's label sits clear above its floating arrow (decision 7).
- Built: the arrow's hover and bob are the constants of `portal-arrow.ts` (6 px and 4 px), shared by the float and the label; a portal's label is lifted by their sum (`IndicatorSource.lift`), so its bottom sits 4 px above the arrow's highest point, not above the picture.
- Reworded in this story (project owner, 2026-11-20, screenshot of "Programm" on two lines): **labels in sight stay on one line.** A label is as wide as its text in the label's font (measured by the browser, `measureObjectLabelText`) plus the padding, and only the view bounds it; the 260 px cap of GAME-41 is gone for labels in sight. Only a text wider than the view wraps, onto up to three lines. The same holds for edge-indicator labels, which are bounded by the room the view leaves beside the icon. A label wraps only at spaces, never inside a word (`overflow-wrap: normal`; the project owner, 2026-11-20: "it's ok to have new lines after whitespace"). The 260 px cap is gone everywhere, and the bubble's label clearance uses the same measure.
- Reworded in this story (project owner, 2026-11-20): the greeting bubble of an object or NPC opens within **2 tiles** (halved from 4, closes beyond 2.25, was 4.5) at the project owner's request. **While it is open, the figure's label is hidden**: the bubble takes its place, reversing the rule of 6.1d that the label stays above which the bubble stood. The label comes back when the bubble closes.
Requirements: GAME-41 (re-verified, reworded), GAME-37 (reworded: the range).

### Story 6.1g – Black canvas and progress bar while the game loads — Done (2026-11-20)

Mock screens: game loading.
- The loading text is replaced by a black canvas the size of the game: the white loading text until Phaser loads, then a progress bar with a random playful text per step (decision 8, Q13).
- Built: before the engine starts (the lazy chunk, the world and figure data), `GameLoading` is a black view of the stage with the white loading text. The engine then puts up its own start screen (`start-screen.ts`) over the same black the moment `createGame` runs: a bar that follows Phaser's loader (70 % of the bar), then the drawn map (90 %), then the rest of the setup (100 %), where the screen goes (`#enterMap`). The text changes at 0, 25, 50, 70 and 90 %, picked at random from the pool and never the same twice in a row. The pool is `game.loadingSteps` (15 German texts) and reaches the engine as `texts.loadingSteps`; without a pool (the game preview) the bar stands alone. A portal keeps its grey veil (GAME-30): the start screen is shown once.
- Changed after the first try (project owner, 2026-11-20): the page's own wait for the world status (`GamePage`) is a black page with no text (`game-boot`), so nothing flashes white; a game that cannot load shows "Die digitale Erlebniswelt konnte nicht geladen werden." in white on the black view, with no button of its own (the game bar's "Webseite" leads back); the mock `game-loading` shows the three states. The German UI says "Webseite" everywhere, not "Website".
Requirements: GAME-43 (now implemented; left the "not yet implemented" list).

### Story 6.1h – The installed app updates itself — Done (2026-11-20), iPhone check passed (2026-11-20)

- The client notices a new release and reloads itself at a safe moment (decision 9). No service worker.
- The new icon is served at once; on iOS the guest adds the app again (decision 9).
- Built: `UpdateWatcher` (in `Root`) asks `GET /api/version` on start and on every `visibilitychange` to visible, and reloads when `isNewRelease` says the release differs (a server that only adds `-rc.N` runs the same build, like `displayVersion`). A page can hold the reload with `useHoldUpdate`: the game page holds it while an overlay, a dialogue or the guided first entry is open, and the reload follows when the last hold ends. Everywhere else it reloads at once. `/api/version` answers `no-store` and the client asks with `cache: "no-store"`. An unreachable server never reloads.
- Decided while building: a reload happens once per server version and session (`sessionStorage`), so a cache between the server and the phone that still delivers the old client cannot cause a reload loop. Icons are served `no-cache` instead of `max-age=3600`, because the `apple-touch-icon` link in `index.html` cannot carry the version the manifest uses.
- Decided (project owner, 2026-11-20): a form being filled in on the website is reloaded with the page, and its data can be lost. Updates are rare, so no form holds the update; the spec's "at once" stands.
- Checked on the iPhone (2026-11-20, project owner): the update works as implemented. Recorded in the manual test protocol as PWA-06.
Requirements: PWA-06.

### Story 6.1i – Resources freed in the background and on close — Done (2026-11-20), iPhone check passed (2026-11-20)

- Measure on the iPhone, then stop everything that runs while the app is in the background or closed (decision 10).
- Code analysis (2026-11-20), what runs when the app is in the background: nothing of the game. Phaser pauses its loop on `visibilitychange` (`Game.onHidden`), the engine's timers (sparkles, shines) and tweens run on the scene's clock and stand still with it, the speech bubbles, labels and edge indicators are DOM layers updated from the scene, and the frame diagnostics are off in a production build. The game has no audio. The app polls nothing: `EventProvider` and `UpdateWatcher` ask once when the page becomes visible again; the intervals of the countdown and the figure preview live on their pages only. A page that is frozen on close (`pagehide`) was visible-then-hidden first, so `visibilitychange` has stopped the loop already; no extra `pagehide` handler is needed.
- Found: **the WebGL context was never released.** Leaving the game destroys Phaser, and Phaser's renderer deletes its GL objects, but it never calls `WEBGL_lose_context`; the browser keeps the context and the canvas's drawing buffer (up to 3x the screen) until garbage collection, which Safari does late. That fits an iPhone that gets slower after the app was used and closed.
- Built: when the game is destroyed the engine releases the context after Phaser has finished (`releaseContext`, `release-context.ts`: `loseContext()` and a canvas buffer of 1 x 1 pixel).
- Checked on the iPhone with Safari Web Inspector (2026-11-20, project owner): the issue is resolved. Recorded in the manual test protocol as PWA-07.
Requirements: PWA-07 (the context release is unit-tested; the device check passed 2026-11-20).

### Story 6.1j – Smooth overlays on iOS — Done (2026-11-20), iPhone check passed (2026-11-20)

- Overlays open over the game at full frame rate on iOS (decision 11).
- Code analysis (2026-11-20): the overlay is a plain fixed layer with a translucent background; it has no blur or backdrop filter and no animation. The cause found is in the engine: `scene.pause()` only stops the scene's update, and Phaser still draws a paused scene every frame (status `PAUSED` is below `SLEEPING` in `SceneManager.render`). So the canvas at device pixels (up to 3x) with its glow filters was redrawn 60 times a second behind the page, while the page's React root mounted and fetched its data.
- Built: `setGamePaused` also puts the game loop to sleep (`setLoopAsleep`, `pause.ts`) and wakes it with a fresh time step when the page or dialogue closes. The canvas keeps its last picture behind the translucent overlay. A game that a test plays by hand (`advanceGame`) is never woken (`isPlayedByHand`). No gain for the overlay's own mount work is claimed: that is measured on the iPhone.
- Follow-up (2026-11-20, after the project owner's check on the iPhone: the frame rate improved, the pages that an object opens still stutter): the game now stops synchronously in `onActivate`, before React starts on the page (it used to stop in an effect after the overlay's first commit, so it drew on while the page mounted); the page of the overlay is rendered two frames after the sheet, so the sheet's first frame does not wait for it; the close button takes the focus without scrolling (`preventScroll`). Not built: a slide-up of the sheet with `transform` and `opacity` only, which the compositor would play even while the main thread works. Decided (project owner, 2026-11-20): not needed, the current implementation is good (the mock has no opening animation, and none is added).
- Checked on the iPhone (2026-11-20, project owner, Safari and the installed app): the current implementation is good. Recorded in the manual test protocol as GAME-44.
Requirements: GAME-44 (the loop stops behind a page; unit-tested, the device check passed 2026-11-20).

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

### Story 6.1m – Four layers of testing — Done (2026-11-20)

Added 2026-11-20 at the project owner's request; **refined 2026-11-20**, not built yet. It revises `spec/test-strategy.md` section 8 (and section 2, the CI description), the "Testing efficiency" part of CLAUDE.md, the pull-request workflow, and adds a nightly pipeline.

The four layers (the project owner's words, shortened):
1. **During development:** only the tests related to the files being changed: `vitest related`, focused component tests.
2. **Before committing:** the relevant unit tests; TypeScript type checking, linting and formatting, each only on the changed code.
3. **Pull request (CI):** all Vitest tests; the relevant e2e tests; the core/critical e2e tests; the "no regression" tests.
4. **Nightly (a new scheduled pipeline):** the main branch, only when its code has changed since the last nightly run; all Vitest tests and all e2e tests.

**Decisions** (2026-11-20, with the project owner):
1. **Relevant e2e tests (layer 3):** a map from changed paths to e2e spec files (`e2e/relevant.json`). A change under `game-engine/` or `frontend/src/game/` runs `game-world.spec.ts`, one under `backend/src/rsvp/` the RSVP specs; a change to shared code, configuration or dependencies runs everything. A test checks that every spec file is in the map.
2. **Requirement report:** it runs nightly and on a release candidate, not on the pull request. The release-candidate run stays a full suite.
3. **Layer 2 is enforced by a git hook** that runs a script `npm run precommit` on changed files only: the related unit tests, `tsc` on the workspaces that contain changed files, ESLint and Prettier on the changed files. It applies to the project owner's commits too.
4. **The "no regression" set** is a short set of end-to-end tests tagged `@smoke` (sign-in, the game loads and walks, the RSVP, the admin area). It runs on every pull request in addition to the relevant tests; the "core/critical" tests are this same set.
5. **Release candidate:** the number of a candidate (`-rc.N`) is used up only when the whole pipeline succeeded. The number comes from the existing `-rc.N` tags, so it is used up by the tag. First plan (2026-11-20): push the tag late and take it back on a failure. **Changed while building:** tags `v*` can't be deleted (OPS-12, a repository ruleset), so a tag that exists is used up. Instead the tag is made by the last step of the job: the pre-release is created with `gh release create --target <commit>`, which makes GitHub create the tag when it publishes the release, after the assets are uploaded. Everything else (the image build and smoke test, the bundle, the assets, the notes) comes before, and the image is pushed just before it. A run that fails before has made no tag. The pushed image of a failed run is overwritten by the next run. The tag is now lightweight, no longer annotated.
6. **Defaults, unless the project owner says otherwise:** the pull request's e2e tests run in Chromium only (the other browsers run nightly); the nightly runs at 02:00 UTC, compares the SHA of `main` with that of its last successful run, and a failure is reported by GitHub's own e-mail for a failed scheduled run.

**Built as (2026-11-20):**
- the sections of `test-strategy.md` and the rules in CLAUDE.md, rewritten around the four layers (the efficiency policy of 8.1 – 8.7 becomes layers 1 and 2; 8.5 and 8.8 are updated);
- `npm run precommit` and the git hook (installed by `npm install`, so a fresh clone has it);
- `e2e/relevant.json` with its consistency test, and `@smoke` tags on the core e2e tests;
- `ci.yml` with the lighter pull-request run (selection of the e2e specs from the changed paths, Chromium only, no requirement report) and its input for a full run, which `release-candidate.yml` passes;
- `nightly.yml` (schedule and manual start; the change check; all Vitest and e2e tests in all browsers; the requirement report);
- the release candidate's reordering (decision 5).
- Spec: OPS-06 reworded (what CI runs on a pull request), OPS-10 (the tag is made last), new OPS-20 (the nightly pipeline); sections 23.2 and 23.3 and `test-strategy.md` 2 and 8 rewritten (8.1 – 8.4 are the layers; 8.8 keeps its number).
- Also: the `full` input of `ci.yml` (a full run: every project, the requirement report; used by the nightly run and the release candidate), a separate concurrency group for full runs, `E2E_REPORT_SUFFIX` for the smoke run's reports, `npm run test:related`, the `prepare` script that sets the hook up (it does nothing where `scripts/` is missing, as in the Docker build).
- The hook (fixed 2026-11-20, after the first commit from the host failed with "node: not found"): git on the host shares `.git/config` and the hook, but has no Node.js. Without `node` the hook runs the checks in the running dev container (`docker exec`), and refuses the commit with a clear message without one; `scripts/precommit/hook.test.ts` runs the real hook with fake `node` and `docker` commands for the three cases. Checked with `git hook run pre-commit` on 27 staged files, with and without `node` on the PATH.
- No double runs (2026-11-20): a passed run is remembered in `.git/precommit-passed` by the commit and the content of the changed files (`scripts/precommit/cache.ts`), and the hook skips the same files committed unchanged, so a check made beforehand counts: 12.9 s for the run, 0.14 s for the hook. Other files, other content or another commit run everything; `--force` runs anyway.
- Not done: the project owner's repository settings (a required check for pull requests, if wanted) are theirs; the first nightly run starts at the next 02:00 UTC after the merge to `main`; the hook starts to work after `npm install` (the devcontainer's `npm ci` does it).
Requirements: OPS-20.
Re-verified: OPS-06, OPS-10, OPS-12.

### Story 6.1n – A friendly screen for unexpected errors — Done (2026-11-20)

Added 2026-11-20 after the project owner got the router's "Unexpected Application Error! … Hey developer" page on `/game` (the cause was the dev server's stale module, not the code). **Refined 2026-11-20**: Q70 and Q71 of the mock `app-error` are decided as proposed. **Done 2026-11-20.**

Mock screens: Unexpected error (`app-error`: Meldung, Technische Details, Nach einem Update, Entwicklung).
- One error screen for every route: the router's `errorElement` and an error boundary around the whole app show it, so no error page of the router or the browser appears. Friendly text without technical words, "Neu laden" and "Zur Startseite" (WEB-13).
- A module of the app that cannot be loaded (`Failed to fetch dynamically imported module`, `Importing a module script failed`, `doesn't provide an export named`) says "Ein Teil der App konnte nicht geladen werden" and suggests the reload.
- The disclosure "Technische Details" (closed in production, open on the development server, `import.meta.env.DEV`): error number (short, from the message and the page), message, page without query, time (UTC), version and commit, browser, stack, and "Details kopieren" as plain text; no personal data; nothing is sent anywhere (WEB-14, Q70, Q71).
- The pure part (the details, the error number, the kind of error) is a tested function; the screen is a component test; an end-to-end test shows the screen for a page that fails, through a route that exists in test builds only (`VITE_TEST_HOOKS`).
Requirements: WEB-13, WEB-14.

### Story 6.1o – Dialogue text types itself out — Done (2026-11-20)

Added 2026-11-20 at the project owner's request, with the story 6.1i: dialogues show their text animated and an animated `>` arrow as soon as the whole text of a page is shown.
- Decided (project owner, 2026-11-20): a tap while a page types shows all of it first, then the next tap goes on; about 40 characters per second, and no animation with the system's "reduce motion"; the counter "n / m" stays and the arrow replaces the tap hint.
- Built: `TypedText` renders the Markdown whole and types its text nodes out (`game/TypedText.tsx`), `DialogueBox` keeps which page is done, and the arrow `.dialogue-next` bounces when it is (CSS `transform`, off with reduced motion). The tap hint is kept as hidden text. Tests wait for `data-typing="false"`.
- Changed after the first try (project owner, 2026-11-20): the dialogue box has **no close button** (a cross let guests skip a dialogue; Escape still closes it, and the error box keeps its button), and the **portrait is centred vertically**. The "Dialog schliessen" label stays for the error box.
- Not changed: the preview of a dialogue in the admin stays static; the greeting bubble of an object or NPC does not type.
Requirements: CNT-10.
Re-verified: CNT-02, CNT-08.

### Story 6.1p – The game bar floats over the world, and a portal fades to white — Done (2026-11-20)

Added 2026-11-20 at the project owner's request, after the first floating version (committed as "two rounded pills").
- Decided (project owner, 2026-11-20): the bar is no full-width header in the website's colour but two boxes over the world: the event's name **with its date** (as in the website header) at the top left, Webseite at the top right; rounded rectangles (12 px), translucent dark, Webseite with a white border, the name larger and in the heading font, Webseite in the body font.
- Built: `GameBar` is `position: absolute` over the game window and takes no taps except on Webseite; `z-index: 8`, above the engine's layers (4 – 7), so the start screen no longer covers it after it showed for a moment (the flash on re-entry on iPhone). New engine option `topInset` (a function read each frame): edge indicators (`indicatorInsets`), the labels of objects in sight (`objectLabelBox`) and speech bubbles (`placeBubble`) stay below the boxes. The game preview passes none.
- iPhone: the name is trimmed to the capital letters (`text-box: trim-both cap alphabetic`) in the game bar and in the website header, because the web fonts of a theme have an ascent and a descent that differ; the website header is **sticky**, so it is not left under the status bar when the game is left (PWA-04).
- Spec: GAME-14 and PWA-04 reworded, THM-17 no longer lists the game bar, GAME-43, the implementation notes of GAME-26 and of the bar; the mock `game` and `game-loading` show the new bar.
- Added to the story (project owner, 2026-11-20): a portal fades the screen **out to white** (350 ms of game time, camera fade) and only then loads the new map; the white stays on a layer of the game (`whiteout.ts`) across the scene restart, the loading veil goes up over it, and the new map is entered with the flash from white as before (GAME-30).
Requirements: GAME-14, GAME-26, GAME-30, GAME-37, GAME-41, PWA-04.

## Report

<Added when the epic is complete, from the template in README.md.>

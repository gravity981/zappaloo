# Epic 5.1 – Game World Prototype Findings

| Status | Release | Depends on | Branch |
|---|---|---|---|
| ready | Opening | 5 | `feature/epic-5.1-gameworld-prototype-findings` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-17, after the project owner tried the game with the prototype world. Walking by tap feels unnatural and sometimes does nothing, players don't see where they are going or what lies outside the visible area, and on iOS the whole view stutters while the camera follows the avatar. This epic makes tap-to-move and orientation in the world good enough for the Opening. Numbered 5.1 so that the later epics keep their numbers.

**What the game does today** (end of epic 5):
- Tap-to-move (`game-engine/src/pathfinding.ts`, `navigation.ts`): A* over the tile grid with one cell per tile and four neighbours, which are the diagonals on screen. The avatar walks through the centre of every cell on the path, so it zigzags.
- A tap on a blocked point, or on a point that has no path from the avatar's position, is ignored (`GameScene.ts`, `#tapTo`). Nothing shows the player why.
- There is no marker for the target, and nothing points to objects outside the view.

**Before the epic starts:**
- The project owner confirms the proposals below and the priorities of GAME-22 – GAME-26. *Done 2026-11-17.*
- The iPhone 16 Pro for checking the fix of the stutter (story 5.1a), reaching either the dev server on the LAN or a release candidate on staging.
- The prototype world is available locally for the manual check in the game preview (the ignored `world/` folder; nothing from it goes into the repository).

**Decisions** (2026-11-17, with the project owner):
1. **Pathfinding:** the problems seen are the zigzag paths and taps that do nothing. Narrow passages and detours were not reported, so the grid keeps one cell per tile.
2. **Invalid target:** the target moves to the nearest point that the avatar fits on *and can reach* from where it stands. A tap on a house therefore leads to the ground in front of it, never to the far side of a wall. If there is no such point within a radius, nothing happens and no marker appears (GAME-23).
3. **Target marker:** a circle lying flat on the isometric ground pulses at the target of every walk started by a click or tap: a free tap, the approach point of a clickable object, or the point in a portal's trigger area. It disappears on arrival, when the walk is stopped or blocked, or when the arrow keys take over (GAME-24).
4. **Object glow:** when a clickable object is tapped and the avatar has to walk to it first, the object also pulses (a portal's floating arrow too, added 2026-11-17) with a glow along its edges until its action runs or the walk ends (GAME-25).
5. **Edge indicators:** clickable objects with an assigned action and portals with a target that lie outside the view get an indicator at the edge of the game view, pointing towards them. Objects and portals look different. Easter eggs (GAME-08) and objects without an action get none. Tapping an indicator does the same as tapping the object (GAME-26).
6. **iOS stutter** (added 2026-11-17): on an iPhone 16 Pro (Low Power Mode off), the whole view stutters while the avatar walks and the camera follows it, the ground as well as the objects; on desktop it is smooth. The avatar itself is smooth. A lack of performance and a fault of the device are ruled out. It is fixed in this epic, code analysis first, then reproduction and tests on the device (GAME-27, story 5.1a).

**Proposals, confirmed by the project owner (2026-11-17):**
- **Requirements and priorities:** GAME-22 (straight paths) and GAME-23 (nearest reachable point) are *Must*; GAME-24 (marker), GAME-25 (glow) and GAME-26 (edge indicators) are *Should*.
- **Path:** eight neighbours on the tile grid (a diagonal step costs √2 and is taken only when both cells beside it are free), then the path is smoothed: a waypoint is dropped whenever a clear line for the avatar's footprint (`clearLine`) leads from the previous kept point to the next one. The avatar walks straight lines between the remaining points.
- **Nearest reachable point:** the radius is 3 tile widths around the tapped point. "Reachable" means a cell connected to the avatar's cell in the navigation grid. Among the reachable cells within the radius, the point closest to the tapped point is taken: the cell centre, moved towards the tapped point as far as the avatar still fits.
- **Marker look:** an ellipse with the tile's 2 : 1 ratio, 0.4 tile widths wide, a thick ring in the glow's light colour with a dark outline so that it shows on any ground. It is drawn above the ground layers and below objects and figures, and pulses once per second (scale 0.8 → 1.2, fading out, then again).
- **Glow look:** a soft light-coloured glow along the edges of the object or of the portal's arrow that swells and fades once per second, drawn with Phaser's glow filter. The random sparkles of GAME-15 keep running.
- **Edge indicators:**
  - An object counts as outside when its bounds are entirely outside the camera view. The indicator sits on the line from the avatar to the object, 12 px inside the edge of the game view and below the game bar (GAME-14).
  - Portals get a small arrow like their floating arrow. Clickable objects get a small sparkle. Each indicator turns to point at its object.
  - At most 6 indicators, the nearest first. When two would overlap, only the nearer one is shown.
  - The touch area is at least 44 × 44 px. Indicators are hidden while an overlay is open (GAME-11).
  - Indicators are also shown on desktop, where a click works like a tap. The game preview shows them too (same engine, MAP-18).
- **Keys:** the arrow keys stop a tap walk as today; the marker and the glow disappear with it. Enter or Space (GAME-16) show neither, because the avatar already stands at the object.

## Stories

### Story 5.1a – Smooth view on iOS

First story of the epic (decided 2026-11-17): it changes the canvas scale and the camera, which the marker (5.1e) and the edge indicators (5.1f) build on, so they are drawn against the new scale from the start.

**Finding** (iPhone 16 Pro, Low Power Mode off): while the avatar walks, the whole view stutters, the ground as well as the objects. The avatar itself walks and animates smoothly. On desktop the view is smooth. A lack of performance and a fault of the device are ruled out. The avatar stays in the middle of the screen, so anything uneven in how the camera moves shows on the world, never on the avatar.

**Code analysis** (2026-11-17, Phaser 4.2.1; the order is the expected weight):
1. *The view moves in whole world pixels, at an uneven rhythm.* `playerSpritePosition` rounds the sprite to whole world pixels (`player-anchor.ts`), and the camera follows that rounded sprite (`startFollow(sprite, true)`, lerp 1, `GameScene.ts`). The avatar walks 1.4 tiles × 64 px = 89.6 px per second, which is about 1.5 world pixels per frame at 60 fps. The world therefore jumps by 1, 2, 1, 2 … world pixels from frame to frame. At zoom 2 on an iPhone (device pixel ratio 3), one world pixel is 6 device pixels, so the view steps 6 and 12 device pixels in turn. This is the classic judder of a pixel-art camera locked to a rounded target. It is present on desktop too, but smaller there (2 and 4 screen pixels on a 1× screen, and less than one world pixel per frame on a high-refresh monitor).
2. *The canvas has far fewer pixels than the screen.* With `Scale.RESIZE` the canvas is drawn at CSS-pixel size (Phaser 4 has no device-pixel-ratio setting), and Safari scales it up 3× to the display. The smallest step the game can draw is therefore one CSS pixel (3 device pixels), even though the display could show much finer movement. Forum reports say Safari also smooths a scaled-up WebGL canvas, which smears each step.
3. *The phone's canvas size is arbitrary.* On desktop the game window is a fixed 1280 × 800. On a phone it is whatever height is left below the bar and the safe areas, and it can be odd or fractional. The camera centres the avatar at half the canvas size, so with an odd size its scroll position sits on half pixels. Rounding then alternates between neighbouring pixels from frame to frame. A Phaser forum thread reports jitter only when the canvas width or height is odd.
4. *Frame pacing of Safari.* Safari on iOS runs `requestAnimationFrame` at 60 Hz on the 120 Hz ProMotion display, and WebKit bug reports describe irregular frame scheduling of canvas content in Safari. Phaser already averages the frame time over 10 frames (`fps.smoothStep`, on by default), so the step per frame is even. If frames reach the screen unevenly, the large steps of finding 1 make that visible. This is not fixed in the code unless the measurement below shows that it remains after the fix.

**Fix** (code first, all in `game-engine/`, so the app and the game preview get it):
- **Render at device pixels.** The canvas buffer is sized to the device pixels (CSS size × `devicePixelRatio`, capped at 3), while its CSS size stays the same. The camera zoom becomes `CAMERA_ZOOM × ratio`, so the world looks as large as today and the pixel art stays sharp (nearest-neighbour). First check whether `scale.zoom = 1 / ratio` with `Scale.RESIZE` does this in Phaser 4.2.1. If it does not, size the canvas by hand from a `ResizeObserver` on the parent. Input (`getWorldPoint`), the test hook's `view`, and the sizes in CSS pixels (game bar, the 12 px and 44 px of the edge indicators in 5.1f) are checked against the new scale.
- **One snapping grid for everything.** The camera follows the avatar's true position (its feet, not the rounded sprite). The camera's scroll and the avatar sprite are both snapped to the device-pixel grid (1 / (zoom × ratio) world pixels). The steps per frame then become small and even (about 9 device pixels at 60 fps on the iPhone, instead of 6 and 12), and the avatar keeps its exact place on the screen. The snapping is one pure function with unit tests, used by both the camera and the sprite. It replaces the whole-world-pixel rounding of `playerSpritePosition`, whose comment explains why the sprite was snapped at all.
- **Odd canvas sizes no longer matter**, because the scroll is snapped by this function before Phaser renders, not by Phaser's own rounding of a half-pixel value.
- `fps.smoothStep` stays on.

**Reproduce and test** (after the fix is in code):
- A development-only diagnostics overlay (game preview, and the app's dev server with `?debug=frames`) shows the device pixel ratio, the canvas buffer and CSS size, the raw frame times (min / max / average over the last second) and the camera's step per frame. It never reaches a production build (MAP-18).
- Unit tests: the snapping function (even steps for a constant speed, the same result for camera and sprite, odd canvas sizes); the canvas-size calculation for ratios 1, 2 and 3.
- On the iPhone 16 Pro (Safari and the installed app), with the dev server on the LAN or a release candidate on staging: the view before and after the fix, with the overlay's numbers in the step report. Then Android Chrome and desktop, to make sure nothing gets worse. The result goes into the manual test protocol as a row for GAME-27 (test-strategy.md, section 6.1).
- If the raw frame times on the iPhone stay irregular after the fix (finding 4), the next step is discussed with the project owner before anything else is changed.

Requirements: GAME-27.
Re-verified: GAME-02, GAME-07, GAME-10, GAME-18, GAME-21.

### Story 5.1b – Spec and mock

No code. The decisions and the confirmed proposals are written into sw-architecture.md: 3.5 (tap-to-move), the requirement texts of GAME-22 – GAME-26 if a proposal changes them, and the "Decisions of epic 5.1" in 14.4. The `game` mock gets the target marker, a glowing object and edge indicators for an object and a portal. The UX decision goes into `spec/mocks/README.md`. The project owner confirms the mock before 5.1e starts.
Requirements: none new.

### Story 5.1c – Straight paths

- `findPath` with eight neighbours and the √2 cost, without cutting corners past a blocked cell.
- A pure `smoothRoute` in `game-engine/src/navigation.ts` drops the waypoints that a clear line can skip, used by `walkRoute` for taps and for walks to objects.
- Tests (`pathfinding.test.ts`, `navigation.test.ts`): on an open map the route is a single straight segment; round one obstacle the route has only the turning points it needs; a smoothed route never crosses a border or a thin collision shape (the tests of 5l.4 still pass); a diagonal step past a blocked corner is not taken.

Requirements: GAME-22.
Re-verified: GAME-02, GAME-10, GAME-16.

### Story 5.1d – Nearest reachable target

- A pure function in `navigation.ts` finds the reachable cells from the avatar's cell (flood fill over the navigation grid, cached per walk) and returns the nearest reachable point within 3 tile widths of the tapped point, or nothing.
- `#tapTo` uses it for a blocked tap and for a tap that has no path. A tap on a clickable object or a portal is unchanged: its target is the approach point or the trigger area.
- Tests: a tap inside a building leads to the ground in front of it; a tap behind a wall leads to the reachable side, not to the far side; a tap beyond the radius does nothing; a tap on a free, reachable point leads to that very point (changed 2026-11-17: the avatar stops where the player tapped, not at the centre of that cell, so that the marker of 5.1e sits where the avatar stops).

Requirements: GAME-23.
Re-verified: GAME-10.

### Story 5.1e – Target marker, object glow and figure shadow

Mock screen: `game` (from 5.1b).
- The pulsing marker on the ground at the target of every click or tap walk, with the depth and look of the confirmed proposal. It is removed on arrival, on stop, on a blocked walk (the stuck check of 5l.4) and on the arrow keys.
- The pulse glow on a clickable object, or on a portal's floating arrow, while the avatar walks to it. It ends when the action runs or the walk ends.
- The decisions about when the marker and glow show or hide are made by a small pure state helper, which unit tests check. An end-to-end test (`e2e/game-world.spec.ts`, desktop Chromium) taps the ground and reads the marker's state through the test hook: shown while walking, gone on arrival.

- The player's figure gets a soft elliptical shadow on the ground (GAME-28, added 2026-11-17 at the project owner's request while the story ran), like the shadow of a portal's arrow: a pure function gives its position and size from the feet, and a unit test checks it; the render stack shows it just below the figure.

- Clickable objects glow softly along their edges all the time, in the colour of their sparkles (GAME-29, added 2026-11-17 at the project owner's request, as they were still not highlighted enough), as the portal's arrow does; the glow of the object the avatar walks to pulses. The frame rate with this many filters is checked on the iPhone with the diagnostics overlay.

Requirements: GAME-24, GAME-25, GAME-28, GAME-29.
Re-verified: GAME-15, GAME-16.

### Story 5.1f – Edge indicators

Mock screen: `game` (from 5.1b).
- Which objects get an indicator (action assigned, portal with a target, not an easter egg, outside the view), where each indicator sits on the edge, the limit of 6 and the overlap rule: pure functions in a new `game-engine/src/indicators.ts`, with unit tests for each rule, including a view with the game bar and a phone-sized view.
- The indicators are HTML buttons over the canvas (`edge-indicators.ts`), updated by `GameScene.ts` as the camera moves (changed from "drawn in the scene": the touch area is then 44 × 44 CSS pixels whatever the canvas's pixel ratio, and a button can be named for screen readers). A tap on an indicator runs the same path as a tap on its object.
- End-to-end (desktop Chromium, a phone-sized viewport so that objects lie outside the view): on the test world, the objects outside the view have an indicator and the easter egg has none, and tapping the altar's indicator walks to it and opens its page.

Requirements: GAME-26.
Re-verified: GAME-06, GAME-11, GAME-14, GAME-16.

### Story 5.1g – Check with the prototype world and epic report

- Manual check in the game preview with the prototype world, on desktop and with a phone-sized viewport: straight paths, taps into buildings and behind walls, the marker, the glow, the indicators, and no stutter. A tap test on a real phone follows with the next release candidate and goes into the manual test protocol.
- Final verification and epic report (README.md, "Finishing an epic").

Requirements: none new.

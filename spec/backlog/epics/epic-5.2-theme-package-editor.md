# Epic 5.2 – Theme Package Editor

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | – (development tool, not shipped; its platform changes ship with 3.0.0) | 4 | `feature/epic-5.2-theme-package-editor` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-18. Today a theme package (sw-architecture.md 19.7) is written by hand: `theme.json`, `manifest.json`, four PNG icons of exact sizes and the font files, packed into a `tar.gz`, then checked with `zappaloo validate`. This epic adds a standalone, web-based editor in the development environment, started like the game preview, where every part of a theme is defined, previewed with the app's own stylesheets, and exported as a valid theme package with a given name. Numbered 5.2 so that it is built before the Opening (the event's theme is needed then) and the later epics keep their numbers.

**Current state (2026-11-18):**
- The format is declared in `shared/src/packages/theme-v1.ts` (theme-v2.ts since story 5.2j) and `shared/src/theme.ts` (zod schemas, `THEME_LIMITS`, the colour and waiting keys). The validator is `backend/src/theme/validate.ts`; `backend/src/theme/build.ts` packs an archive and encodes PNGs (used by `scripts/build-example-theme.ts`).
- The app applies a theme with `themeStyle()` and `fontFaceRules()` (`frontend/src/app/themeStyle.ts`) on the wrapper `ThemeScope`; the guest pages and the admin area share `frontend/src/app/ui.css` (the admin area follows the neutral style of the mocks).
- The game preview (`game-preview/`, MAP-18) shows how a development-only tool is set up: its own workspace, a Vite server on `127.0.0.1` that refuses to start without `APP_ENV=dev` and cannot be built, and a Vite plugin for the parts that need Node.

**Before the epic starts:**
- The project owner confirms the proposals below (done 2026-11-18).
- The mock of the editor (story 5.2a) is confirmed before story 5.2c starts.

**Decisions** (2026-11-18, with the project owner):
1. **Position:** epic 5.2, after 5.1 and before epic 6, so that it is done before the Opening. It depends on epic 4 (the theme package format) only.
2. **Preview:** sample elements built with the app's real stylesheets (`ui.css`, `waiting.css`) and the app's own `themeStyle()` and `fontFaceRules()`, not the real page components. The editor needs no backend and does not break when a page component changes.
3. **Icons:** one square image of at least 512 px is uploaded. The editor scales it to the four icon sizes and builds the maskable icon, with the content inside the central 80 % on a chosen background colour. Each icon can be replaced by an upload of its own.

**Proposals, confirmed by the project owner (2026-11-18)**, with two changes (layout on narrow screens, font conversion):
- **Setup like the game preview:** a new workspace `theme-editor`, started with `APP_ENV=dev npm run dev:theme-editor` on `http://localhost:5176`, `127.0.0.1` only. The Vite server refuses to start without `APP_ENV=dev` and the workspace cannot be built for production, so it is absent from production bundles and images (THM-08).
- **Style:** the editor's own controls use the admin styles of `ui.css` (cards, fields, buttons, segments), which follow the mocks. The texts are in English, like the game preview, since it is a developer tool and not for guests.
- **Layout:** on a wide screen the controls on the left in cards (Name, Colours, Waiting card, Fonts, Icons, Export) and the preview on the right, as a scrolling column of preview elements. On a narrow screen the layout is rearranged into one column: the controls first, then the preview (or tabs "Edit" and "Preview"; the mock decides in 5.2a).
- **Colours:** a colour picker and a `#rrggbb` field for each of the seven colours; the waiting card colours behind a switch "Own waiting card colours". Next to the colours, the five contrast pairs of the validator with their ratio and a pass/fail mark, updated live.
- **Fonts:** for each of body, heading and display: off, or a family name and 1–4 font files, each with weight and style. WOFF2, OTF and TTF files are accepted; OTF and TTF are converted to WOFF2 by the editor, because the package holds WOFF2 only. The family name, weight and style are suggested from the font file. At most 8 files in all, at most 2 MB each after conversion, as the validator says.
- **Preview elements** (THM-11): the start page with hero, welcome text and countdown card (display font); a content page with headings and text (Markdown rendered as the app renders it); a form with fields, a primary and a secondary button; the waiting card; the app icon on a phone home screen and the maskable icon in a circle and a rounded square. They follow every change at once.
- **Export** (THM-12): a field for the name (the manifest's `name`, 1–60 characters) and a button "Export". The package is built and checked by the platform's own code on the editor's development server (`backend/src/theme/build.ts`, `validate.ts`), and downloaded as `<slug of the name>.tar.gz`. A package the validator would refuse is not exported; its findings are listed with the field they belong to.
- **Open** (THM-13): an existing theme package can be opened; it is validated and its fields, icons and fonts are filled in. A refused package shows its findings and is not opened.
- **Draft** (THM-14): the work is kept in the browser (IndexedDB) and survives a reload; "New theme" starts from the platform's default colours.

**Findings of the first try with the editor (2026-11-18, story 5.2g) and decisions with the project owner:**
- **Preview scroll** (bug): on a wide screen the preview was cut off at the bottom and its column did not scroll. Fixed (story 5.2h).
- **Colour assistant:** the owner wants to pick one master colour and get matching colours for the seven keys, "something similar" to mycolor.space (a tool with one hex input and about 25 named palettes of 3–7 colours). Decided: the master colour is the accent; the suggestions are palette cards to pick from (not one live suggestion); each card is a complete mapping onto the colour keys of the theme package. The palette styles are in sw-architecture.md 19.7.1 (THM-15).
- **Font size override:** imported fonts draw their letters in different sizes. Decided: an optional `sizeAdjust` per font in percent (50–200) that becomes `size-adjust` of the font's `@font-face`. It breaks the contract of the theme format, which v1.2.0 to v2.0.0 already released, so it is **theme format version 2** (decided by the owner 2026-11-18): the platform reads version 2 only, version 1 is removed, and the release that contains it is a major version (3.0.0, 19.7). The owner's rule: the formats have no requirement to be backwards compatible at the moment, and a change of a package contract that needs a change of the platform is a potential major version break, and one if the platform code was already released. The validator, the JSON Schemas, `GET /api/site`, `fontFaceRules()`, the example package and the editor change with it (THM-16).
- Both go into epic 5.2.

**More findings of the owner's try with the event's theme (2026-11-18):**
- **Page titles without the heading font:** the title of a content page and of «Mehr» was a plain `<h1>` and did not use the heading font, while the Markdown headings below it did (so the first line of a page was not in the heading font and the next one was). Markdown headings below level 2 had no style at all. Fixed (story 5.2k).
- **The content preview in the admin area did not apply the theme:** it showed the platform's neutral look. Decided: a preview of guest content shows the guest's view, with the theme and the page title (story 5.2l).

- **Buttons and bars stayed grey and white:** soft buttons (start page shortcuts, «In Google Maps öffnen», the profile) used a grey fill that the theme never sets, and the bars of the website and the game used the surface colour (nearly white). Decided with the owner: soft buttons and the bars take a tint of the accent over the surface, derived from the existing colours (no new theme key, no format change); the phone's tab bar matches the bars (story 5.2m, THM-17).

## Stories

### Story 5.2a – Spec and mock – Done (2026-11-18)

Mock screens: a new screen `theme-editor` (group "Developer tools").
- Add the editor screen to `spec/mocks/zappaloo-mocks.html` from the layout above, wide and narrow (the mock's Phone / Desktop switch), with the states "empty draft", "contrast check failing" and "export refused with findings"; note the decisions in `spec/mocks/README.md`.
- Write the confirmed proposals into sw-architecture.md 19.7.1.
- The project owner confirms the mock before story 5.2c starts.
Requirements: none new.

### Story 5.2b – Workspace and development server – Done (2026-11-18)

- New workspace `theme-editor` (React, Vite) with `npm run dev:theme-editor`, port 5176, the `APP_ENV=dev` guard and no production build; a README like the game preview's; added to `npm test`, `npm run typecheck` and `npm run lint`.
- A test checks that the workspace cannot be built and that neither the frontend build nor the image contains it.
Requirements: THM-08.

### Story 5.2c – Name, colours and fonts – Done (2026-11-18)

Mock screens: `theme-editor`.
- The name, the seven colours, the waiting card colours and the three fonts, as in the mock. OTF and TTF files are converted to WOFF2 on the development server with a pinned npm package of Google's WOFF2 encoder (e.g. `ttf2woff2`, chosen in this story after a check of its license and of OTF fonts with CFF outlines); the converted file is checked by the validator's font check. The live contrast check uses the same contrast function as the validator (moved to `shared` if it is in the backend only).
Requirements: THM-09.

### Story 5.2d – Icons – Done (2026-11-18)

Mock screens: `theme-editor`.
- Upload one square image (PNG or JPEG, at least 512 px); the four icons are generated in the browser (canvas), the maskable one with a chosen background and the content inside the central 80 %. Each icon can be replaced by its own PNG of the exact size.
Requirements: THM-10.

### Story 5.2e – Preview – Done (2026-11-18)

Mock screens: `theme-editor`.
- The preview elements with `ui.css`, `waiting.css`, `themeStyle()` and `fontFaceRules()` from the frontend; uploaded fonts are loaded from object URLs.
Requirements: THM-11.

### Story 5.2f – Export, open and draft – Done (2026-11-18)

- Export through the development server with the platform's build and validator, the download, the findings; opening an existing package; the draft kept in IndexedDB.
- A test exports a theme, validates it with `zappaloo validate` and opens it again unchanged.
Requirements: THM-12, THM-13, THM-14.

### Story 5.2g – Check with a real theme and epic report – Done (2026-11-18)

- The project owner makes the event's theme with the editor and imports it on the dev server; findings become stories (5.2h, …) or go to a later epic.
- Epic report.
Requirements: none new.
Re-verified: THM-01, THM-03.

### Story 5.2h – Preview scrolls on a wide screen – Done (2026-11-18)

- The preview column keeps the full height of its content and scrolls inside the window (it was squeezed to the height of the window and cut off). Done 2026-11-18. Changed the same day at the owner's request: on a wide screen the window does not scroll and the two columns scroll on their own under the fixed header and buttons; the hidden file inputs are positioned inside the columns so that they do not stretch the page.
Requirements: none new.
Re-verified: THM-11.

### Story 5.2i – Colour assistant – Done (2026-11-18)

Mock screens: `theme-editor`.
- The mock gets the master colour and the palette cards in the card Colours; the project owner confirms it before the code is written.
- The palettes (Tint, Neutral, Warm paper, Cool, Soft complement, Analogous, High contrast) are made by a pure function in the editor from the master colour, in a perceptual colour space, and every card is checked with the contrast function of `shared`. Tests: every palette for many master colours (dark, light, grey, saturated) reaches the contrast of the validator, keeps the accent and sets `onAccent` to black or white.
Requirements: THM-15.

### Story 5.2j – Size adjust for fonts (theme format version 2) – Done (2026-11-18)

Mock screens: `theme-editor`.
- `sizeAdjust` in the format (`shared/src/packages/theme-v2.ts`, `shared/src/theme.ts`), the validator, the JSON Schemas and the format document (`npm run schemas`), `GET /api/site`, `fontFaceRules()` of the app and the editor (slider and number field per font, live in the preview, written by the export and read by «Open»).
- A test exports a theme with `sizeAdjust`, validates it with `zappaloo validate` and opens it again; the app test checks the `size-adjust` rule.
Requirements: THM-16.
Re-verified: THM-01, THM-02, THM-03, THM-06, THM-07.

### Story 5.2k – Heading font for page titles and every Markdown heading level – Done (2026-11-18)

- The titles of a content page and of «Mehr» get the heading style (`h1` class); Markdown headings of the levels 3 to 6 are headings in the heading font like levels 1 and 2. The spec says how a page is laid out (6.2).
Requirements: none new.
Re-verified: THM-06, WEB-02.

### Story 5.2l – The content preview in the admin area applies the theme – Done (2026-11-18)

- The Markdown preview of the content editor is wrapped like the website (`ThemedPreview`: the colours and font faces of `GET /api/site`) and shows the page's title above the text; the Startseite's preview shows the text only. The theme is read again after an import (5.2 fix), so the preview follows it.
Requirements: none new.
Re-verified: CNT-05, THM-01.

### Story 5.2m – Soft buttons and bars take the theme's tint – Done (2026-11-18)

Mock screens: `theme-editor` (the preview shows a «Website bar» and a soft button).
- `themeStyle()` sets `--a-fill`, `--a-bar` and `--a-bar-pill` from the accent and the surface; `ui.css` uses them for soft buttons, chips, tags and the bars. The editor's preview shows them.
Requirements: THM-17.

## Report

### Epic report (2026-11-18)

**Summary:** Hosts can now design the look of an event in a browser-based theme package editor (`APP_ENV=dev npm run dev:theme-editor`, development only): they pick a master colour and get palette suggestions that fit the theme's colour keys, set the fonts with a size adjust, make the app icons from one image, see everything live in a preview built from the app's own styles, and export a package that the platform's own validator has accepted. A theme they made with it was imported on the dev server; what that showed (page titles and Markdown headings, buttons, bars, the admin preview) was fixed in the app as well.

**Stories:**
- 5.2a – Spec and mock: **done.** The owner confirmed the mock and the question about the narrow layout (tabs «Edit» and «Preview»).
- 5.2b – Workspace and development server: **done.** `theme-editor`, port 5176, `APP_ENV=dev`, no production build; only its `package.json` reaches the image build.
- 5.2c – Name, colours and fonts: **done.** OTF and TTF are converted to WOFF2 with `woff2-encoder` (MIT, WebAssembly; `ttf2woff2` was rejected because it compiles a native addon at install time); the contrast function moved to `shared`.
- 5.2d – Icons: **done.** One square image makes the four icons in the browser; the maskable icon keeps its content in the central 80 %.
- 5.2e – Preview: **done.** Built with the app's `ui.css`, `waiting.css`, `themeStyle()` and `fontFaceRules()`.
- 5.2f – Export, open and draft: **done.** The development server builds and checks packages with `build.ts` and `validate.ts`; the draft lives in IndexedDB.
- 5.2g – Check with a real theme and epic report: **done.** The owner made the event's theme and imported it; the findings became stories 5.2h – 5.2m and unplanned fixes (below).
- 5.2h – Layout scroll: **changed.** First the preview column scrolled inside the window; at the owner's request the window no longer scrolls and the two columns scroll on their own.
- 5.2i – Colour assistant: **added** (THM-15). One master colour (the accent) and seven palette cards, each a complete mapping onto the colour keys, all passing the validator's contrast; modelled on mycolor.space.
- 5.2j – Size adjust for fonts: **added** (THM-16). Theme format **version 2**: `sizeAdjust` (50 – 200 %) per font, applied as `size-adjust` in the font's `@font-face`. A breaking change, see below.
- 5.2k – Heading font for page titles and every Markdown heading level: **added.** The title of a page and of «Mehr» was a plain `h1` without the heading font; Markdown levels 3 – 6 had no style.
- 5.2l – The content preview in the admin area applies the theme: **added.** It shows the page title and the text as a guest sees them.
- 5.2m – Soft buttons and bars take the theme's tint: **added** (THM-17). A tint of the accent's hue (OKLCH) for soft buttons, chips, tags, the website and game bars and the phone tab bar; no new theme key.
- Not planned, done on request or found while testing: after an import or the return to the default the website reads the theme again (it needed a page reload before); the dev frontend forwards `/theme/fonts/…` to the backend (fonts did not load in dev); the editor notices a development server that was started before a format change and refuses to download its package; «Add font file» is shown for fonts that are switched off; edits made while a font is being converted are no longer lost (a state race).

**Requirements:** 10 of 10 planned for this epic (THM-08 – THM-14 at refinement, THM-15 – THM-17 added during it), all with passing tests (requirement report). Overall: 193 of 266 active requirements implemented, 183 of them with passing tests here. The other 10 (11 errors in the report: ACC-05, ACC-11, ACC-14, CFG-02, CFG-07, OPS-02, OPS-05, OPS-13, OPS-15, OPS-16, SEC-01) are deployment-test requirements whose results the local report reads from an old CI-only results file (`reports/vitest-deploy.json`, CLAUDE.md). Re-verified: THM-01, THM-02, THM-03, THM-06, THM-07, WEB-02, CNT-05, THM-11.

**Tests:**
- Unit and integration (Vitest): 133 files, 1378 tests, all passing. New or changed: the editor (`theme-editor`: 98 tests, among them the conversion of a CFF-outline OTF, the palette sweep over 700+ master colours and a round trip through the real `zappaloo validate`), the shared colour and contrast code, the format 2 validator and API, the schemas, the website and admin theme tests, and the dev proxy.
- End-to-end (Playwright), results merged from three runs, because the tests are flaky at the moment:
  - First full run, without retries: 1 failure (the arrow-key test of `game-world.spec.ts`: a walked distance measured against a timer under parallel load) and 10 tests that did not run, which is the rest of that file's serial group (`mode: "serial"`: the first test imports the test world).
  - The failing file re-run in isolation (desktop Chromium, no retries, `game-world.spec.ts`): **12 of 12 passed**. A single test of a serial group cannot be run alone; it fails with "the world has no figure for this user".
  - Full run as CI does it (2 retries): **89 passed, 2 flaky** (the arrow-key and the object-tap test of the same file, passed on retry), **69 skipped** (the tests that change shared settings run on desktop Chromium only), **0 failed**. The requirement report reads this run.
  - Merged result: every end-to-end test passes; no game, engine or e2e code was changed in this epic.
- Not run: the deployment test (CI only), including the new check that the image has no theme editor (THM-08).
- Manual: the owner's try with the event's theme on the dev server (fonts, colours, icons, preview, the website and the game bars, the admin preview). Scripted checks in a real Chromium of the editor (export, reload, open, scrolling, fonts), of the size adjust (text 35 % wider at 150 %), and of the themed website pages on the owner's dev instance (read-only). No device tests.

**Spec changes and deviations:**
- New requirements THM-08 – THM-17; new sections 19.7.1 (theme package editor) and in 19.7 «Compatibility of the formats»; 6.2 «Page layout»; the previews of guest content in the admin area apply the theme (19.7); the screen `theme-editor` and its decisions in the mocks.
- **Theme format version 2 is a breaking change** (decided by the owner, 2026-11-18): the platform reads version 2 only, version 1 (v1.2.0 – v2.0.0) is removed, and a platform of v2.0.0 or older refuses a package of version 2. The owner's rule: zappaloo has no requirement to be backwards compatible with older theme or world packages for now; a change of a package contract that needs a change of the platform is a potential major version break, and one if the platform code was already released. The same applies to the world package (14.4).
- Deviation, corrected: I first added `sizeAdjust` to format version 1 as an exception for «an unreleased format», on the strength of a sentence in the spec that was out of date (the theme shipped in v1.2.0). The git tags showed it; the field is now format version 2.
- Changed during the epic: the narrow layout is tabs (confirmed), the wide layout has two columns that scroll on their own (changed from the page scrolling), the colour assistant offers palette cards (not one live suggestion).

**Remaining requirements by epic:** 1 → 1, 4 → 2, 6 → 12, 7 → 30, 8 → 22, 9 → 2, 10 → 4 (73 in all).

**Waiting on the project owner:**
- **The release:** the next release is a MAJOR version (**3.0.0**), because the theme format 2 breaks the packages of v1.2.0 – v2.0.0. The release notes should say that theme packages have to be exported again with the editor. A theme that is already imported stays active until a package of version 2 replaces it.
- The deployment test on CI, including the THM-08 check of the image.
- A decision on the flaky end-to-end tests (as in epic 5.1; `game-world.spec.ts` is the one that failed this time).
- Open design points (not decided): the primary and the outlined («ghost») buttons are still the ink colour and the platform's outline; the inactive tab colour on the tinted bar is the theme's muted colour and is not checked against the tint.

**Risks and notes:**
- A host who makes packages for an older platform (v2.0.0 or older) cannot use version 2 packages there; the format documents and JSON Schemas of each release say which version a platform reads.
- The editor reads format version 2 only: opening a version 1 package is refused with the validator's finding (there is no converter, by decision).
- The editor's server part is loaded once at start; after a change of the format or the validator it must be restarted (the editor detects an old server and says so).
- Test fixtures of two fonts (Source Sans, SIL Open Font License; the licence text is in `theme-editor/src/test-fixtures/`) and the dev-only dependencies `woff2-encoder`, `fontkit`, `dompurify`, `marked` and `fake-indexeddb` (Apache-2.0, tests only) are in the repository; none of it is in the image.
- `CNT-02`, `CNT-03` (planned in epics 4 and 6) and `CNT-03` and `SEC-04` (they pass but are still on the «not yet implemented» list) are warnings of the requirement report that were there before this epic.

# Epic 5.2 – Theme Package Editor

| Status | Release | Depends on | Branch |
|---|---|---|---|
| ready | – (development tool, not shipped) | 4 | `feature/epic-5.2-theme-package-editor` |

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

### Story 5.2a – Spec and mock

Mock screens: a new screen `theme-editor` (group "Developer tools").
- Add the editor screen to `spec/mocks/zappaloo-mocks.html` from the layout above, wide and narrow (the mock's Phone / Desktop switch), with the states "empty draft", "contrast check failing" and "export refused with findings"; note the decisions in `spec/mocks/README.md`.
- Write the confirmed proposals into sw-architecture.md 19.7.1.
- The project owner confirms the mock before story 5.2c starts.
Requirements: none new.

### Story 5.2b – Workspace and development server

- New workspace `theme-editor` (React, Vite) with `npm run dev:theme-editor`, port 5176, the `APP_ENV=dev` guard and no production build; a README like the game preview's; added to `npm test`, `npm run typecheck` and `npm run lint`.
- A test checks that the workspace cannot be built and that neither the frontend build nor the image contains it.
Requirements: THM-08.

### Story 5.2c – Name, colours and fonts

Mock screens: `theme-editor`.
- The name, the seven colours, the waiting card colours and the three fonts, as in the mock. OTF and TTF files are converted to WOFF2 on the development server with a pinned npm package of Google's WOFF2 encoder (e.g. `ttf2woff2`, chosen in this story after a check of its license and of OTF fonts with CFF outlines); the converted file is checked by the validator's font check. The live contrast check uses the same contrast function as the validator (moved to `shared` if it is in the backend only).
Requirements: THM-09.

### Story 5.2d – Icons

Mock screens: `theme-editor`.
- Upload one square image (PNG or JPEG, at least 512 px); the four icons are generated in the browser (canvas), the maskable one with a chosen background and the content inside the central 80 %. Each icon can be replaced by its own PNG of the exact size.
Requirements: THM-10.

### Story 5.2e – Preview

Mock screens: `theme-editor`.
- The preview elements with `ui.css`, `waiting.css`, `themeStyle()` and `fontFaceRules()` from the frontend; uploaded fonts are loaded from object URLs.
Requirements: THM-11.

### Story 5.2f – Export, open and draft

- Export through the development server with the platform's build and validator, the download, the findings; opening an existing package; the draft kept in IndexedDB.
- A test exports a theme, validates it with `zappaloo validate` and opens it again unchanged.
Requirements: THM-12, THM-13, THM-14.

### Story 5.2g – Check with a real theme and epic report

- The project owner makes the event's theme with the editor and imports it on the dev server; findings become stories (5.2h, …) or go to a later epic.
- Epic report.
Requirements: none new.
Re-verified: THM-01, THM-03.

### Story 5.2h – Preview scrolls on a wide screen

- The preview column keeps the full height of its content and scrolls inside the window (it was squeezed to the height of the window and cut off). Done 2026-11-18. Changed the same day at the owner's request: on a wide screen the window does not scroll and the two columns scroll on their own under the fixed header and buttons; the hidden file inputs are positioned inside the columns so that they do not stretch the page.
Requirements: THM-11 (unchanged).

### Story 5.2i – Colour assistant

Mock screens: `theme-editor`.
- The mock gets the master colour and the palette cards in the card Colours; the project owner confirms it before the code is written.
- The palettes (Tint, Neutral, Warm paper, Cool, Soft complement, Analogous, High contrast) are made by a pure function in the editor from the master colour, in a perceptual colour space, and every card is checked with the contrast function of `shared`. Tests: every palette for many master colours (dark, light, grey, saturated) reaches the contrast of the validator, keeps the accent and sets `onAccent` to black or white.
Requirements: THM-15.

### Story 5.2j – Size adjust for fonts (theme format version 2)

Mock screens: `theme-editor`.
- `sizeAdjust` in the format (`shared/src/packages/theme-v2.ts`, `shared/src/theme.ts`), the validator, the JSON Schemas and the format document (`npm run schemas`), `GET /api/site`, `fontFaceRules()` of the app and the editor (slider and number field per font, live in the preview, written by the export and read by «Open»).
- A test exports a theme with `sizeAdjust`, validates it with `zappaloo validate` and opens it again; the app test checks the `size-adjust` rule.
Requirements: THM-16. Re-verified: THM-01, THM-02, THM-03, THM-06, THM-07.

### Story 5.2k – Heading font for page titles and every Markdown heading level

- The titles of a content page and of «Mehr» get the heading style (`h1` class); Markdown headings of the levels 3 to 6 are headings in the heading font like levels 1 and 2. The spec says how a page is laid out (6.2).
Requirements: THM-06 (unchanged). Re-verified: WEB-02.

### Story 5.2l – The content preview in the admin area applies the theme

- The Markdown preview of the content editor is wrapped like the website (`ThemedPreview`: the colours and font faces of `GET /api/site`) and shows the page's title above the text; the Startseite's preview shows the text only. The theme is read again after an import (5.2 fix), so the preview follows it.
Requirements: CNT-05, THM-01 (unchanged).

### Story 5.2m – Soft buttons and bars take the theme's tint

Mock screens: `theme-editor` (the preview shows a «Website bar» and a soft button).
- `themeStyle()` sets `--a-fill`, `--a-bar` and `--a-bar-pill` from the accent and the surface; `ui.css` uses them for soft buttons, chips, tags and the bars. The editor's preview shows them.
Requirements: THM-17.

## Report

<Added when the epic is complete, from the template in README.md.>

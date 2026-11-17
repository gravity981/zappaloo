# Epic 3.5 – Installable App

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | Release 1 (completes it) | 3 | `feature/stage-3.5` (PR #5, #6) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Added 2026-11-11. Guests add the site to the home screen of iOS and Android with the event's icon and open it like a native app, without browser bars (sw-architecture.md 19.5, PWA-01 – PWA-05). Numbered 3.5 so that stages 4–10 keep their numbers. Branch `feature/stage-3.5` (CLAUDE.md compares the stage number exactly, so `stage-3` does not match).

**Before the epic starts:**
- Stage 3 is complete (3a – 3e, 3g, 3h committed).
- The project owner provides the event's icons (19.5: `icon-192.png`, `icon-512.png`, optional `icon-maskable-512.png`, `apple-touch-icon.png`), or accepts the built-in default icon for Release 1.
- To confirm with the project owner: icons are supplied as finished PNGs (no image processing, no new dependency); the manifest colours are neutral defaults until `theme.json` exists (stage 4); no service worker, so no offline cache (19.5).

## Stories

### Story 3.5a – Manifest and icons

`GET /manifest.webmanifest` (public, also while the platform is closed, outside `/api`) with the event's name, `display: "standalone"`, `start_url` and `scope` `/`, language, colours and icons; `GET /app-icons/<file>` serves the event's icons from `$DATA_DIR/events/event1/icons/` with validation (PNG, exact size) and a built-in default set when a file is missing or invalid. Both routes are reachable through Caddy (deployment test). Tests: manifest content, icon fallback, access while closed and without sign-in.
Requirements: PWA-01, PWA-02.

### Story 3.5b – Page head and safe areas

`index.html` gets `apple-touch-icon`, `theme-color`, the iOS app title, `apple-mobile-web-app-capable`, the status bar style and `viewport-fit=cover`; the guest shells (`bare`, `flow`), the waiting page with its door scene, the profile and the admin area respect `env(safe-area-inset-*)`; in standalone mode every page offers a way back, because there is no browser back button. Playwright checks the tags and, with standalone display mode emulated, that no content sits under the insets.
Requirements: PWA-03, PWA-04.

### Story 3.5c – Install hint

UX mock first (screens `install` and `waiting` variant "Install hint", card "App" in `profile`; UX decision 60, confirmed 2026-11-11), then the build: the strip on the waiting page (hidden with × on this device), the card in the profile and the page `/install`, only in a mobile browser and never in the installed app; on Android a button that triggers the browser's install prompt (the browser menu steps without one), on iOS the steps of the Share menu; a note that the app asks for the password once more (iOS keeps separate storage for it).
Requirements: PWA-05.

### Story 3.5d – Footer with copyright and license notice

(added 2026-11-11, sw-architecture.md 19.6). UX mock first (the footer on `login`, `waiting`, `profile` and the admin area; card "Fusszeile" in `admin-settings`; the `/license` page), decision in mocks/README.md. Then: copyright line in the database with a default of `© <year> <event name>`, edited in Einstellungen and audited without the text; `GET /api/site` gains `copyright` and `sourceUrl`; the footer shows the line, the AGPL-3.0 sentence (language keys) and "Source code" / "License" below "Datenschutz · Version"; public page `/license` with the `LICENSE` file, copied into the image; `SOURCE_URL` in the deployment bundle's `.env`, the runbook and the deployment test. The repository must be public before the go-live (open point "Make the repository public", OPS-12), otherwise the "Source code" link leads nowhere.
Requirements: LIC-01, LIC-02, LIC-03.

### Story 3.5e – Device check

With the first release candidate on staging (decided 2026-11-11). Manual test protocol on real devices (test-strategy.md, section 6.1): iOS Safari and Android Chrome add the site, show the event's icon and name, open without browser bars; sign-in after the install; safe areas on a device with a notch.
Also: manifest and icons through Caddy on staging (the deployment test). The result is recorded in the manual test protocol; until then PWA-01 – PWA-05 are on the "not yet tested" list in test-strategy.md, section 5.
Requirements: PWA-01 – PWA-05 (verified on staging and on devices).

### Story 3.5f – Release 1 go-live

(after 3.5a – 3.5e; formerly 3f). First release promoted and deployed to production on the operator's host; Let's Encrypt and live updates through Caddy checked there (manual test protocol); invitation print export checked end to end, privacy notice reviewed, home screen install checked on the production host, manual checks from the release checklist that apply to Release 1.
Checked with the released version on prod (decided 2026-11-11): LIC-03 and OPS-02 stay on the "not yet tested" list until then. When Release 1 works on prod and stage 4 starts, the lists are cleared (test-strategy.md, section 5).
Requirements: OPS-02, LIC-03 (verified on prod).

## Report

### Status report (2026-11-12, written after the stage)

**Summary:** Guests add the site to the home screen of iOS and Android and open it full screen with the event's icon and name; a hint in the mobile browser shows how. Every page with the footer carries the admin's copyright line, the AGPL-3.0 sentence and links to the source code and the license. Release 1 runs on prod (v1.0.2).

**Steps:** 3.5a Manifest and icons – done. 3.5b Page head and safe areas – done. 3.5c Install hint – done. 3.5d Footer with copyright and license notice – done. 3.5e Device check and 3.5f Release 1 go-live – done on prod (v1.0.2), but not recorded in the manual test protocol yet. Fixes after the go-live: staging starts without a mail password, pages no longer zoom in on a focused field, the guest table keeps its edit button in its own column, an email link opened while signed in no longer reports an expired session.

**Requirements:** 8 of 8 planned for this stage (PWA-01 – PWA-05, LIC-01 – LIC-03) with passing automated tests. PWA-01 – PWA-05, LIC-03 and OPS-02 stay on the "not yet tested" list (test-strategy.md, section 5) until the device and prod checks are recorded. Overall: 96 of 232 active requirements, all with passing tests; 136 not yet implemented.

**Tests:** 2026-11-12 on `feature/stage-3.9` (spec changes only since v1.0.2): Vitest 632 tests in 63 files passed (651 results in the report, 603 tagged); Playwright 67 passed and 17 skipped by design (tests that run on one browser profile only), none failed; requirement report OK. Manual: OPS-05 only (2026-11-10); the device checks of 3.5e and the prod checks of 3.5f have no rows yet.

**Spec changes and deviations:** footer with copyright and license notice added to the stage (19.6, LIC-01 – LIC-03); the device check runs with the first release candidate on staging, the prod checks with the released version; the go-live (formerly 3f) is step 3.5f. After the go-live the pilot produced stage 3.9 (2026-11-12).

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | next |
| 4 | Content and website | open |
| 5 | Game world and map importer | open |
| 6 | Living world | open |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (requirement report; it counts stages 3.5 and 3.9 under stage 3): stage 1 → 2 (OPS-12, OPS-13: manual checks); 3 → 12 (OPS-02 and the 11 of stage 3.9); 4 → 15; 5 → 36; 6 → 14; 7 → 30; 8 → 22; 9 → 1; 10 → 4. In total 136 of 232 active.

**Waiting on the project owner:**
- Record the checks of 3.5e (iPhone and Android: icon, name, no browser bars, safe areas, sign-in after install, hint) and 3.5f (Let's Encrypt and live updates on prod, the source link of a public repository) as rows in the manual test protocol; then OPS-02 leaves the "not yet implemented" list and the "not yet tested" list is cleared (a precondition of stage 4).
- Before step 3.9c reaches prod: decide pending companion requests on prod if they should be reviewed, because the update approves all pending ones (approval off by default).

**Risks and notes:**
- Prod holds real guest data and stage 3.9 changes the schema in several steps (rename, accounts per invitation, person types); each migration is tried on staging with a copy of the latest prod backup before promotion (3.9g).
- The requirement report's stage table reads whole stage numbers only, so stages 3.5 and 3.9 appear under stage 3.

# Zappaloo – Manual Test Protocol

Checks that need a real environment, real devices or real time (see [test-strategy.md](test-strategy.md), section 6.1). The requirement report (`npm run req-report`) reads the table below as an extra result source.

- One row per check. **Requirements:** one or more IDs, separated by commas. **Date:** `YYYY-MM-DD`. **Result:** `pass` or `fail`.
- For each requirement, only its latest record counts. A failed check is fixed and checked again with a new row; old rows stay as history.
- Add the row only after the check was actually done, with the environment it was done in.

## Records

| Requirements | Date | Environment | Result | Notes |
|---|---|---|---|---|
| OPS-05 | 2026-11-10 | LAN staging | pass | Full backup and restore with `zappaloo backup --full` and `restore --full` |
| PWA-01, PWA-02 | 2026-11-13 | prod | pass | Manifest and app icons through Caddy (step 3.5e) |
| PWA-03, PWA-04, PWA-05 | 2026-11-13 | prod | pass | iPhone Safari and Android Chrome: home screen install, icon and name, no browser bars, safe areas, sign-in after install, install prompt and hint (step 3.5e) |
| LIC-03 | 2026-11-13 | prod | pass | "Quellcode" opens the public repository, `/license` shows the AGPL (step 3.5f) |
| OPS-02 | 2026-11-13 | prod | pass | Let's Encrypt through Caddy, HTTP to HTTPS redirect, live updates through the proxy (step 3.5f) |
| OPS-12 | 2026-11-13 | GitHub | pass | Tag ruleset for `v*` in the repository settings: tags can't be moved or deleted |
| OPS-10 | 2026-11-13 | GitHub | pass | First release candidate built by the manual workflow, tagged and published as a pre-release |
| OPS-11 | 2026-11-13 | GitHub | pass | Promotion of the latest candidate to a release, with the version and minor, major tags and the GitHub release |

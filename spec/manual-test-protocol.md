# Zappaloo – Manual Test Protocol

Checks that need a real environment, real devices or real time (see [test-strategy.md](test-strategy.md), section 6.1). The requirement report (`npm run req-report`) reads the table below as an extra result source.

- One row per check. **Requirements:** one or more IDs, separated by commas. **Date:** `YYYY-MM-DD`. **Result:** `pass` or `fail`.
- For each requirement, only its latest record counts. A failed check is fixed and checked again with a new row; old rows stay as history.
- Add the row only after the check was actually done, with the environment it was done in.

## Records

| Requirements | Date | Environment | Result | Notes |
|---|---|---|---|---|
| OPS-05 | 2026-11-10 | LAN staging | pass | Full backup and restore with `zappaloo backup --full` and `restore --full` |

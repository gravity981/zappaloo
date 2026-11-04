# Zappaloo – Specification

Zappaloo is a reusable digital event platform (e.g. for weddings) that combines a classic, responsive event website with a browser-based multiplayer pixel-art game world. Both draw on one central content and data base. Guests can explore the event venues with their own avatar, meet other guests, play minigames with central highscores, and upload photos via QR codes.

This folder is the **source of truth**. The code implements the spec. When the code and the spec disagree, either the code gets fixed or the spec gets changed explicitly. Silent deviations are not allowed.

## Document index

| Document | Content |
|---|---|
| [README.md](README.md) | Purpose, document index, conventions, topic status, decisions |
| [sw-architecture.md](sw-architecture.md) | Concept, architecture, technology choices, and all requirement tables |
| [test-strategy.md](test-strategy.md) | Test levels, tooling, requirement traceability, "not yet implemented" list |

## Conventions

### Requirement IDs

Requirements live in tables at the end of each topic section in `sw-architecture.md`:

```
| ID | Requirement | Prio |
|---|---|---|
| ABC-01 | … | Must |
```

- An ID is `<PREFIX>-<nn>`. The prefix has 2–4 capital letters, one per topic.
- IDs are never renumbered or reused. New requirements are added at the end of their topic.
- A requirement that is dropped stays in the table, struck through and marked `(withdrawn)`, so its ID isn't reused.

### Priorities

| Prio | Meaning |
|---|---|
| Must | Required for the first production event. |
| Should | Expected. Can be deferred with an explicit decision. |
| Could | Optional and nice to have. |

The initial priorities follow the wording of the original concept: "muss" → Must, "soll" → Should, "kann"/"möglich" → Could. Core functions described as given were rated Must.

## Topics and status

Status values: **specified** (requirements written, not implemented) · **in progress** · **implemented** (all requirements have passing tests).

| Prefix | Topic | Section in sw-architecture.md | Reqs | Status |
|---|---|---|---|---|
| GAME | Game world, interactive objects | 3 | 8 | specified |
| MP | Multiplayer | 3.3, 17.1 | 5 | specified |
| MG | Minigames, results, highscores | 4 | 10 | specified |
| WEB | Classic website | 5 | 6 | specified |
| CNT | Shared content base | 6 | 4 | specified |
| ACC | User accounts, authentication | 7 | 8 | specified |
| AVA | Avatars | 7.3 | 4 | specified |
| ROLE | Roles and staff capabilities | 8 | 10 | specified |
| INV | VIP invitation system | 9 | 13 | specified |
| ACS | Anonymous access, self-registration, access control | 10, 11 | 8 | specified |
| GRP | Guest groups | 12 | 2 | specified |
| PHO | Photo upload and gallery | 13 | 12 | specified |
| MAP | Tiled maps | 14 | 4 | specified |
| DATA | Database and data model | 18 | 4 | specified |
| CFG | Event configuration, installation model | 19, 20 | 4 | specified |
| OPS | Hosting, deployment, backups, CI/CD | 21–23 | 7 | specified |
| SEC | Security and privacy | 24 | 4 | specified |
| PERF | Performance and load | 25 | 3 | specified |
| | **Total** | | **116** | |

Sections with no requirement table describe architecture and technology choices: 15 (stack), 16 (frontend), 17 (backend), 26 (project structure), 27 (decision summary), 28 (phases) and 29 (principles).

## Decisions

| Date | Decision |
|---|---|
| 2026-11-04 | The spec is written in English. The original German concept was translated in full. |
| 2026-11-04 | The architecture document is `sw-architecture.md`. Requirement tables sit at the end of each topic section. |
| 2026-11-04 | Requirement priorities use Must / Should / Could. |
| 2026-11-04 | Test tooling: Vitest for unit, component and integration tests, Playwright for end-to-end tests (see `test-strategy.md`). |

## Open points

- Requirements that can't be fully verified by automated tests in CI (e.g. real-device camera upload, off-site backup restore, production TLS, load test) need an agreed verification method. See `test-strategy.md`, "Open decisions".
- The tool for the load test (PERF-01) isn't chosen yet.
- Retention periods for photos and personal data (SEC-04) aren't defined yet.

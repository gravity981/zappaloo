---
name: review-epics
description: Review one or more delivered Zappaloo epics (e.g. 5.2, 5.3, 5.4) for completeness, consistency, correctness, security, quality and design decisions, and produce a ranked findings report. Use when the user asks to review, audit or check epics/stages that were implemented or merged since the last review.
argument-hint: "<epic numbers, e.g. 5.2 5.3 5.4>"
---

# Review delivered epics

A read-only audit of epics that were built under `spec/backlog/README.md`. The output is a findings report; **this skill never changes code, never commits, never creates or switches branches** (CLAUDE.md). Fixes are proposed, and the project owner decides.

Argument: the epic numbers to review. With none, take every epic whose status is `done` in `spec/backlog/roadmap.md` and that no earlier review report (`spec/backlog/reviews/`) covers.

## 0. Ground rules

- The spec in `spec/` is the source of truth; the code implements it. A mismatch is a finding in one of them, say which one you believe is wrong.
- Verify release state with `git tag` and `git merge-base --is-ancestor`, never from prose in the spec or roadmap. Report if the user's description ("merged") and git disagree.
- Never run `npm run test:deploy`, and not the whole suite (`npm test`, `npm run test:e2e`, `npm run check`) unless the user asks. Prefer reading the epic report's recorded results; run targeted tests only to confirm a specific suspicion (`npx vitest run <path>`). Back up `reports/*.json` first if you run anything (see CLAUDE.md, "Keep the results of a full run").
- Everything under `world/` is sensitive: do not quote names or data from it.
- Review an unmerged branch from a read-only snapshot, not by switching: `git archive <branch> | tar -x -C <scratchpad>/<name>`, or `git show <branch>:<path>`.
- Findings must be backed by evidence: `file:line` plus what you checked. No speculation presented as fact; mark uncertain items **plausible**.

## 1. Scope each epic

For every epic collect, with git:
1. The epic file (`spec/backlog/epics/epic-<n>-*.md`): refinement, decisions, stories, report.
2. The commit range: the merge commit's parents (`git log --first-parent`, `git diff --stat <base>...<head>`), or `main..<branch>` when unmerged. Exclude lockfiles and generated schema snapshots from reading, but note them.
3. The requirement IDs from every `Requirements:` / `Re-verified:` line, and the spec sections they live in.
4. Files touched outside the epic's own area (shared modules, migrations, the "not yet implemented" list in `spec/test-strategy.md`, roadmap).

Epics are independent enough to review in parallel: launch one agent per epic with the brief in section 4, then do the cross-epic pass (section 3) yourself.

## 2. The six review dimensions

Apply all six to each epic.

**Completeness**
- Every story in the epic file has a matching change; every `Requirements:` ID has an implementation *and* a test whose title carries `[ID]`. Search the tests for each ID.
- IDs removed from the "not yet implemented" list in `spec/test-strategy.md` really are implemented; IDs still on it are not claimed in the report.
- Decisions listed in the refinement are all reflected in code, spec and mocks. Items "added during the epic" are written into the spec/mocks, not only in the report.
- Epic file, roadmap and header table agree on status, depends-on, branch. The report's numbers (stories, test counts, requirement counts) match what you can verify.
- Mocks in `spec/mocks/` cover each frontend screen the stories touched.
- Docs: READMEs of touched workspaces, API/format docs and generated schemas (`npm run schemas` output committed) are up to date.

**Consistency**
- Spec ↔ mocks ↔ code ↔ tests use the same names, wording and behaviour (German UI texts, requirement text, route names, DB columns). Report deviations the epic report itself admits, and check they were written back into the spec.
- Follows existing patterns: error handling, validation (shared zod/format definitions), API shape, i18n, styling, test layout. Flag a second way of doing something that already has one.
- Migrations: sequentially numbered, additive where a release exists, `migration-check` semantics respected, released migrations untouched, no squashing.
- Commit messages follow the release-note rules (`feat:` / `fix:` only for user-visible, released behaviour; `chore:` otherwise).

**Correctness**
- Read the changed logic, not only the diff summary. Look for: off-by-one and date/timezone handling, empty/null/limit cases, state machines that can get stuck, race conditions, migrations that lose or mis-map data, default values, rounding, locale-specific formatting, stale caches, error paths that swallow failures.
- Tests: do they assert the behaviour or only that code runs? Mocks hiding real behaviour? Conditions skipped (`test.skip`, `@flaky`) and are they tracked in `spec/test-strategy.md` 8.8?
- Check that each decision's edge cases are handled (e.g. a kept legacy value, optional vs required, who may see a field).

**Security** (see `spec/sw-architecture.md` security requirements, `SEC-*`)
- Authorisation on every new/changed endpoint: role/capability check server-side, not only hidden in the UI; object-level access (guest sees only their own data).
- Input validation and size limits at the backend; output encoding; SQL only through Drizzle; no string-built queries; uploads and file formats validated (type, size, path traversal, zip/tar extraction, SVG/script content, fonts).
- Personal data: new fields classified and protected like the existing ones (allergies, remarks); excluded from the audit log; included in the CSV only for admins; deleted at shutdown (SEC-11); not logged.
- Development-only tools (theme editor, game preview, dev servers) cannot reach production: not in the image, not routed by Caddy, guarded by `APP_ENV`, no wildcard CORS, bind addresses.
- Dependencies added: necessary, maintained, version pinned, licence acceptable; no secrets in the repo; CSP/headers not weakened; destructive actions guarded (confirmation, audit entry).
- Dependency audit (`npm audit --omit=dev`) only for packages the epic added.

**Quality**
- `npm run lint`/`typecheck` are clean on the touched files (run on the touched workspaces only if cheap; otherwise rely on CI evidence).
- Size and cohesion of new modules/components, duplication, dead code, leftover debug code and TODOs, commented-out code, magic numbers, unused exports/files, accessibility (labels, keyboard, tooltips for letters/abbreviations, screen-reader text), mobile layout.
- Test quality and runtime: sensible level (unit vs integration vs e2e), no needless e2e, no sleeps, stable selectors.

**Design decisions**
- List the significant decisions each epic made (data model, API, format versions, UX patterns, dependencies, where logic lives). For each: is it recorded in the spec or epic file with its reason? Is it consistent with `spec/sw-architecture.md`? Are the trade-offs and alternatives sound, and is it reversible?
- Format/contract changes: version bumped, old version removed, no backwards compatibility (project rule), documented in the format docs.
- Scope creep: work done that no story or decision asked for, or not agreed with the owner ("ask, don't assume").
- Technical debt created and not tracked in the backlog.

## 3. Cross-epic pass

After the per-epic results arrive:
- Conflicts between epics (same tables, same wizard, same settings page, shared test fixtures, migrations numbering).
- Contradictions between their spec changes; terminology that changed (e.g. a renamed word) and was missed elsewhere: grep the whole repo (spec, mocks, tests, emails, seed data).
- Recurring weaknesses (e.g. repeated missing authorisation tests, repeated report inaccuracies) to turn into process findings.
- Whether `main` as a whole still satisfies the roadmap: statuses, "not yet implemented" list, requirement counts.

## 4. Brief for each per-epic agent

Give an agent: the epic number and file path, the commit range or branch, the snapshot directory if unmerged, the six dimensions (paste section 2), the ground rules (section 0), the rule that it is read-only, and this output format. Ask for at most ~25 findings, ranked, no padding:

```
### <ID> <short title>
- Severity: critical | high | medium | low | info
- Dimension: completeness | consistency | correctness | security | quality | design
- Confidence: confirmed | plausible
- Where: path:line (and spec section / requirement ID)
- Evidence: what you read or ran
- Impact: concrete failure or risk
- Suggestion: smallest fix, and whether it needs a spec change or an owner decision
```
Plus: a short "verified OK" list (what was checked and found sound), and the design decisions list with assessment.

Severity: **critical** = data loss/exposure, auth bypass, dev tool in prod; **high** = wrong behaviour guests/admins will hit, requirement without implementation/test; **medium** = edge-case bug, spec/code drift, missing tests; **low** = quality, naming, docs; **info** = observation.

## 5. Verify, then report

- Re-check every critical/high finding yourself against the code before reporting; drop or downgrade what you cannot reproduce by reading. Merge duplicates.
- Write the report to `spec/backlog/reviews/review-<date>-epics-<list>.md` only if the user wants it kept in the repo; otherwise show it in the conversation. Structure: scope and method (what was and was not run), summary table (epic × dimension × severity counts), findings by severity, design-decision assessment, cross-epic findings, verified-OK list, proposed follow-ups (as candidate stories or epic fixes, each with a recommendation, for the owner to decide), and what was not reviewed.
- End with the next step for the owner. Do not start fixing; do not commit.

# Zappaloo – Backlog

The backlog plans how the spec ([sw-architecture.md](../sw-architecture.md)) is built.

| File | Content |
|---|---|
| [roadmap.md](roadmap.md) | Order of the epics, release points, the status and dependencies of each epic, what the statuses mean |
| [epics/](epics/) | One file per epic: its refinement, its stories and, once it is done, its report |
| This file | How we work on epics and stories (policy), the templates |

**Terms.**
- An **epic** is a larger piece of the product that delivers something guests or hosts can use, e.g. "Living world". It is built on its own branch and merged with one pull request.
- A **story** is one step of an epic that can be reviewed and committed on its own, e.g. "6a – Wandering figures".
- Epics were called *stages* and stories were called *steps* until 2026-11-17. The numbers stayed the same (roadmap.md).

## Policy: working on epics

**Status: confirmed by the project owner (2026-11-17).**

This policy applies to anyone who builds an epic: Claude, another agent, or a person. It **adds to** [CLAUDE.md](../../CLAUDE.md) and to the testing policy in [test-strategy.md](../test-strategy.md), section 8. It does not replace them. If this policy ever seems to contradict them, CLAUDE.md applies, and the contradiction is reported to the project owner so that one of the two is fixed.

Two rules from CLAUDE.md shape everything below:
- **The project owner creates the branches and makes all commits.** An agent never commits, and never creates or switches branches.
- **Ask, don't assume.** A gap or a contradiction in the spec is a question for the project owner, not a decision for the agent.

### 1. Before an epic starts (refinement)

1. **The epic is refined with the project owner.** The agent reads the epic file, the requirements it lists, the related sections of the spec and the mocks. It then proposes the stories, preconditions and open questions, each with a concrete recommendation.
2. **Refinement goes into the epic file.** The preconditions go under "Before the epic starts", the decisions under "Decisions" (each with its date), and the stories under "Stories". A decision that changes a requirement or the architecture is also written into sw-architecture.md (CLAUDE.md, "Working with the spec").
3. **Dependencies are decided.** The epics that must be done before this one go into "Depends on" in the header of the epic file and in the roadmap. A dependency of a single story is written into that story (roadmap.md, "Dependencies").
4. **Every story names its requirements.** A story has a line `Requirements: <IDs>` with the requirements it implements. Requirements it only checks again go on a line `Re-verified: <IDs>`. Each active requirement is planned in exactly one epic. `npm run req-report` reads the `Requirements:` lines of the "Stories" section of every epic file to group the requirements by epic.
5. **The project owner confirms** the preconditions, the dependencies and the stories. The epic then becomes **ready** if every precondition is met and every epic it depends on is done, and **refined** otherwise, with a line in the refinement saying what it waits for. The status is set in the epic file and in the roadmap.

**Only a ready epic is started.** When the project owner asks for the next epic, the agent proposes the highest **ready** epic in the roadmap. If none is ready, it says what the refined epics wait for and which open epic should be refined next.

### 2. Branch

- Each epic is built on its own branch: **`feature/epic-<nr>-<title>`**, branched from an up-to-date `main`. `<nr>` is the epic number and `<title>` is the slug of the epic file name. Epic 6 (`epics/epic-6-living-world.md`), for example, is built on `feature/epic-6-living-world`.
- The project owner creates the branch. The epic file names its branch in its header.
- **Before changing any file for a story,** the agent checks:
  - that `git branch --show-current` is the branch of the current epic. The number must match exactly: `epic-1` does not match `epic-10`, and `epic-3` does not match `epic-3.5`;
  - that the working tree is clean, so the previous story is committed.
  If either check fails, the agent stops and asks. It does not fix this itself.
- The first story of an epic also sets the epic's status to **in progress**, in its file and in the roadmap.

**Parallel epics.** Several ready epics can be in progress at the same time, each on its own branch and, for agents, in its own session (or worktree).
- An agent works only on the epic of the branch it is on. It does not touch the stories of another epic.
- Before changing code that another in-progress epic also changes (shared modules, migrations, the "not yet implemented" list), the agent says so in its story summary, so that the project owner can plan the order of the merges.
- Database migrations of parallel epics are numbered by Drizzle when they are generated. The epic merged second regenerates or renumbers its migration on top of `main` before its pull request (`npm run migration-check`).
- The status lines in roadmap.md and the "not yet implemented" list are shared files. Conflicts there are resolved when the second branch is updated from `main`. The agent keeps its edits to them to the lines of its own epic.

### 3. One story at a time

1. **Build the story** as its text says, following the spec and, for frontend work, the UX mocks (CLAUDE.md). Add tests tagged with the story's requirement IDs. Remove the implemented IDs from the "not yet implemented" list in test-strategy.md.
2. **Test as the testing policy says.** Run targeted tests for what changed, then lint and type checks as needed. The full suites are not run after every story (CLAUDE.md, "Testing efficiency").
3. **Update the epic file.** Mark the story **Done (<date>)** next to its heading, and add the decisions made while building it.
4. **Stop with a summary.** It covers what changed, the tests that were run and their results, the tests skipped and why, the remaining risks, and anything open. It ends with a **suggested commit message** that follows the release-note rules: `feat:` or `fix:` for what users notice, `docs:`, `test:`, `chore:`, `ci:` or `build:` for housekeeping (CLAUDE.md, sw-architecture.md 23.3.1).
5. **The project owner reviews and commits.** Each story is one commit, or several if the story is split into parts (as 4e-1 – 4e-7 were). The next story starts only on a clean working tree.

Stories that come up during the epic, such as fixes from a review, get the next free letter or a sub-number (5l.1, 5l.2, …). A story is never renumbered. A dropped or moved story keeps its heading with a note saying where it went.

### 4. Finishing an epic

1. **Final verification.** One agent runs the full suites once on the final code, in CI order: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, then `npm run req-report`. It does not run `npm run test:deploy`, which runs on CI only.
2. **Epic report.** The agent writes the report from the template below into the section "Report" of the epic file. It sets the epic's status to **done** in its file and in roadmap.md (it counts as done once the pull request is merged). It then checks every **refined** epic that depends on this one: if all its dependencies are now done and its preconditions are met, it proposes to set it to **ready**. It removes the epic's IDs from the "not yet implemented" list in test-strategy.md as far as they are done, and shows the report in the conversation. The project owner commits it.
3. **Pull request.**
   - The agent writes the pull request description from [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md):
     - *What and why*: the summary of the epic report, the list of stories with one line each, and a link to the epic file.
     - *Requirements*: the IDs implemented in the epic and those re-verified.
     - *Checklist*: a box is ticked only for what was actually checked. When the deployment test could not run here, the description says so.
   - The title is `Epic <nr> – <title>`, e.g. `Epic 6 – Living World`.
   - The agent shows the description and the title to the project owner. **Only after the project owner confirms** and has pushed the branch does the agent open the pull request: `gh pr create --base main --head feature/epic-<nr>-<title> --title "…" --body-file <file>`. It writes the body file to its scratchpad, not to the repository.
   - The project owner merges the pull request once CI passes. The agent does not merge.
4. **Release.** If the roadmap has a release point after this epic, the release (release candidate, promotion, deployment) follows the runbook and is the project owner's to start. The epic's report lists what waits for it.

### 5. Changing the backlog

- New requirements, epics and stories are added only with the project owner's agreement. Requirement IDs are never renumbered or reused (CLAUDE.md), and the same holds for epic numbers and story letters (roadmap.md, "Changing the roadmap").
- When building a story shows that the epic's plan is wrong or incomplete, the agent stops, proposes the change, and writes it into the epic file once it is agreed.

## Template: epic file

The file is named `epics/epic-<nr>-<slug>.md`. The first heading must have the form `# Epic <nr> – <Title>`, because the requirement report reads the number from it. The header table keeps its four columns in this order, because a test reads the status and the dependencies from it (roadmap.md, "Status of an epic", lists the values).

```markdown
# Epic <nr> – <Title>

| Status | Release | Depends on | Branch |
|---|---|---|---|
| open | <release from the roadmap> | <epic numbers, or –> | `feature/epic-<nr>-<slug>` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

<What the epic delivers, in one or two sentences.>

**Before the epic starts:**
- <precondition: decisions, art, content, access>

**Decisions** (<date>, with the project owner):
- <decision>

## Stories

### Story <nr>a – <Title>

Mock screens: <screens>, if any.
- <what is built>
Requirements: <IDs>, or "none new".
Re-verified: <IDs>, if any.

## Report

<Added when the epic is complete, from the template in README.md.>
```

## Template: epic report

```markdown
### Epic report (<date>)

**Summary:** one or two sentences on what guests or hosts can do now.

**Stories:** <story> – done / changed / moved / dropped, one line each.

**Requirements:** <implemented in this epic> of <planned for this epic>, all with passing tests (requirement report). Overall: <implemented> of <active> requirements.

**Tests:** unit / integration / end-to-end counts and results; tests skipped and why; manual checks done.

**Spec changes and deviations:** what changed in the spec during the epic and why.

**Remaining requirements by epic:** epic → number of requirements (from the requirement report).

**Waiting on the project owner:** decisions, art, content or access needed for the next epic, and the release if one is due.

**Risks and notes:** anything that could affect the next epics or the event date.
```

The status reports of epics 1 – 5 were written with the earlier template and are kept as they were. Their "Overall status" tables show the state on the day of each report. The current status is in roadmap.md.

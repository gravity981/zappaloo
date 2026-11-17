# Epic 9 – Event Readiness

| Status | Release | Depends on | Branch |
|---|---|---|---|
| open | Event-ready (completes it) | 6, 7, 8 | `feature/epic-9-event-readiness` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- Decide the load test tool (proposal: k6), see test-strategy.md 6.2.
- Stages 1–8 are deployed to production.

## Stories

### Story 9a – Load test

Load test on the production host with at least 50 concurrent users and a burst of uploads; findings fixed or accepted.
Requirements: PERF-01.

### Story 9c – Loading time

(moved from 5j on 2026-11-17; runs before 9b, once a release has shown that the game works on devices).
- The Phaser bundle and the start map load first; other maps load in the background.
- An end-to-end test in Chromium with a throttled 4G profile measures the time from sign-in to the first playable map (test hook). The validator gets a size budget for the start map.
Requirements: PERF-04.

### Story 9b – Release checklist

All manual checks from test-strategy.md, section 7, before the event: devices, emails, QR codes, event screen on the venue projector, legal review of the privacy notice.
Requirements: none (release).

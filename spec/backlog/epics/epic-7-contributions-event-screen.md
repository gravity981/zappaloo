# Epic 7 – Contributions and Event Screen

| Status | Release | Depends on | Branch |
|---|---|---|---|
| open | Event-ready | 5 | `feature/epic-7-contributions-event-screen` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

**Before the epic starts:**
- Venue locations for the QR codes and their albums.

## Stories

### Story 7a – Upload pipeline

Upload in the mobile browser with camera capture; type and size checks; JPEG, PNG and HEIC; conversion, compression and thumbnails in a worker queue; files on persistent storage.
Requirements: PHO-03, PHO-06, PHO-07, PHO-09, PHO-13, PERF-03.

### Story 7b – Snapshots, keepsakes and upload links

Composer with "Upload snapshot" and "Upload keepsake"; QR codes per location; anonymous upload links with optional name; rate limits; upload switches for the admin.
Requirements: PHO-01, PHO-02, PHO-05, PHO-08, PHO-14, PHO-15, PHO-18, ACS-04.
Follow-up from stage 2: contribution upload checked on the server, with `[ACS-07]` tests.

### Story 7c – Moderation

One queue, swipe view, live counter, undo, rejected list.
Requirements: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05, PHO-11.
Follow-up from stage 2: moderation uses `requireCapability("moderateContributions")`, with `[ROLE-06]` and `[ACS-07]` tests.

### Story 7d – Gallery and keepsakes

Gallery by album and location with scheduled or manual release; photo viewer with full-resolution download; keepsake page; printable keepsake book.
Requirements: PHO-10, PHO-12, PHO-16, PHO-17, PHO-19, WEB-06.
Follow-up from stage 4: albums as part of the content base, with a `[CNT-02]` test.

### Story 7e – Event screen

Full-screen panels with rotation, photo wall with captions over Server-Sent Events, read-only screen link, upload QR code shown now and then.
Requirements: SCR-01, SCR-02, SCR-04, SCR-07.

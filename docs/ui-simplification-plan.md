# UI simplification plan

**Date:** 19 November 2026
**Goal:** FamSync should feel like a calm family planner, not an admin console. Remove what repeats, hide what is rarely used, and put the next useful thing first. No features are removed and no server behaviour changes; this is layout, navigation and copy.

This plan complements `ui-improvement-audit-2026-11-18.md` (defects and responsive fixes). Where the two overlap, the audit item is named so it is done once.

## Evidence

Signed in as the demo family owner (Carter Family) and measured every main screen at 1440 px and 390 px with `output/ui-simplification/measure.mjs`. Screenshots and `metrics.json` are in `output/ui-simplification/`.

| Screen | Controls in page (1440) | Words | Page height at 390 px | Main problem |
|---|---|---|---|---|
| Tasks | 64 | 476 | 4753 px | Every card shows 3–4 badges plus a full recurrence sentence; status is filtered twice (chips and board columns). |
| Channel | 55 | 206 | 966 px | Five header icon buttons, Reply and ••• on every message, three closed panels in Details, a Search box with a separate Search button. |
| Calendar | 48 | 144 | 1784 px | Fine on desktop; time zone shown as "America/Chicago" in the header. |
| Today | 25 | 296 | **3164 px** | Four count tiles repeat the lists under them; goals are a second Goals page; on a phone due tasks start at about 1400 px. |
| Goals | 13 | 182 | 1997 px | Four count tiles repeat the status tab counts; two dropdowns plus tabs for filtering. |
| Folders | 11 | 85 | 1045 px | Search box needs a button, "Show archived" and "Refresh" buttons, "Live updates connected", technical subtitle, narrower width than other pages. |

Every signed-in screen also carries 17 navigation and top-bar controls on desktop: 10 sidebar items in 3 groups plus Account, and New, theme, notifications and account in the top bar.

## Principles

1. **One way to do each thing.** If the top bar's New creates a task, the page may keep one primary button, but no third path.
2. **Show the exception, not the default.** Don't label "Family" audience, "To Do" status or "Live updates connected" on everything. Show "Only me", "Selected members", "Offline — reconnecting" when they apply.
3. **Content before chrome.** The first phone screen shows the person's own due work, not counters and headers.
4. **Rare actions go in a menu.** Rename, archive, guests, channel image, refresh: one ••• menu.
5. **Things update by themselves.** Live data needs no Refresh buttons; search filters as you type.
6. **Same page skeleton everywhere.** One title row, one width, one filter bar pattern.

## Changes

### S1 — Navigation and page skeleton (all screens)

- **Sidebar stays as it is** (kept by the user on 19 November 2026): grouped Plan / Talk / Family with Today, Calendar, Tasks, Goals · Channels, Messages, Guest channels · Family Base, Families, Folders, plus Account. A merged Chat item, a Files rename and a flat 8-item list were tried and reverted.
- **Page header: drop the bordered card.** A plain title row: H1, one short line of context only when useful, one primary action on the right. Remove restating subtitles ("Assign chores and follow them through to done", "Family folders have their own audiences…"). The 3D icon inside "Open calendar" / "New folder" buttons goes; icons live in navigation.
- **One content width.** All list screens use the same max width (Folders is currently narrower than the others).
- **Remove "Live updates connected" and Refresh buttons** (channels list, conversation, members, guest workspace, folders). Show a small banner only when the connection drops, with "Retry".
- **Search as you type** everywhere (channels, folders, goal–task linker); drop the separate Search buttons.

Overlap: audit UI-11 (icon scale), UI-13 (copy).

### S2 — Today

- **Remove the four count tiles.** Replace with one summary sentence under the title that links to the filtered lists: "1 overdue task · 3 due today · 4 events this week". (Overlap: audit UI-04.)
- **New order:** My tasks due (overdue first) → Today's schedule → Coming up (next 3 items, then "See calendar"). An empty "Nothing scheduled" block collapses to one line instead of a large illustrated card.
- **Goals leave Today** except a single line "Goals: 58% average · View goals" when any goal is active.
- The My items / Whole family toggle stays only on tasks.
- Target at 390 px: overdue task visible without scrolling; page under 1800 px. (Overlap: audit UI-03.)

### S3 — Tasks

- **Card shows title, due, assignee and one action.** Badges only for exceptions: Overdue, Private/Selected members (lock icon), short "Weekly"/"Every 2 days" repeat label. The full rule moves to the task page. (Fixes audit UI-01.)
- **Board view hides the status chips** (columns already are the status). Keep one row: "Show: Whole family ▾", "Overdue only" toggle, Board/List, and Archived inside a ••• menu.
- **Completed column** shows the latest 3 with "Show all".
- **New task dialog:** title, due date, assignee visible; repeat, audience, event and goal links under "More options". (Audit UI-06.)
- Target: ≤ 35 controls in the page at 1440 px with the demo data.

### S4 — Chat (channels and direct messages)

- **Conversation header:** name, description, and one ••• menu (folder, notifications, rename, archive, guests, image). Refresh disappears.
- **Message actions on hover/focus** (always visible on touch devices via long-press or a single ••• button).
- **Details panel closed by default below 1600 px**; when open, plain sections instead of three collapsible boxes; "Search messages" moves to the header as a search icon. (Overlap: audit UI-02.)
- **Composer:** drop the "0/4000 · Plain text" counter until the person is within 200 characters.
- Target: ≤ 30 controls in the page at 1440 px.

### S5 — Goals, Files, Family, Account, Calendar

- **Goals:** remove the four count tiles (the tabs already show counts); merge "Goal type" and "Whose goals" into one "Filter" menu. Card: title, progress bar, target date, owner; priority badge only when High.
- **Files:** saved files first, upload second (audit UI-09); archived and type filter in a ••• / Filter menu; "Conversation folder · Ski trip" becomes a small chat icon with the channel name.
- **Family:** member directory first; invite, roles and removal behind each member's ••• menu (audit UI-12).
- **Account:** keep tabs; make sure all sections reach on a phone (audit UI-05).
- **Calendar:** show the time zone only when it differs from the device; keep the visibility legend but only on the month view.

### S6 — Verification

- Rerun `output/ui-simplification/measure.mjs` and compare with today's `metrics.json`; the targets above must be met.
- Existing suites stay green: theme, shell, phase 2–4, top bar, S16 acceptance, contrast in both themes. Tests that reference removed labels ("Guest channels", "Folders", Refresh buttons) are updated to the new names, not deleted.
- Screenshots at 390, 1024 and 1440 px in light and dark.
- Keyboard pass on every new ••• menu.

## Order and size

Single thread, one slice at a time, each ending with its checks:

| Slice | Size | Depends on |
|---|---|---|
| S1 Navigation and skeleton | Medium | — |
| S2 Today | Small | S1 header |
| S3 Tasks | Medium | S1 header |
| S4 Chat | Medium | S1 |
| S5 Goals, Files, Family, Account, Calendar | Medium | S1 |
| S6 Verification | Small | all |

## Not in scope

No new features, no API or database changes, no change to the palette, 3D icons, avatars or light/dark themes. **Family Base is excluded entirely** — no changes to its screen, components (`family-base-universe.tsx`), data or route.

## Execution results

### S1 — done (19 November 2026)

- **Sidebar.** Unchanged. The flat 8-item version (Chat with section links, Files, Family) was built, then reverted because the user preferred the grouped sidebar.
- **Family page.** `/family/` without an id now opens the current family (`?family=`, otherwise the first) and rewrites the URL to `?id=`. "All families" replaces the breadcrumb and the extra "Open calendar" button.
- **Page header.**
  - `PageHeader` is a plain title row with a larger title and no panel.
  - Removed restating subtitles: Tasks, Goals, Folders, Families, Notifications and channel list.
  - Removed Today's "Open calendar" button.
  - Calendar shows its time zone only when it differs from the device's.
- **Folders width.** The folder list uses full content width; folder detail matches other detail pages at `max-w-6xl`.
- **Quiet live status.**
  - `ui/live-status.tsx` replaces the "Live updates connected" text everywhere and shows a notice only when offline or unavailable.
  - Removed the refresh buttons from the channel list, conversation header, member list, guest channels and folders.
- **Search as you type** (250 ms pause) for channels, direct messages and folders; their Search buttons are gone.
- **Left for later slices.**
  - "Refresh folder" on folder detail, which S16 acceptance uses: S5.
  - "Show archived" placement: S4/S5.
  - Message search panel: S4.
  - Goal–task linker search: S3.
- **Checks.**
  - New `output/ui-simplification/s1-check.mjs` passes (9 checks).
  - Existing suites pass: theme, shell, phase 2, phase 3, top bar, phase 4 (updated for the family page), WCAG AA contrast in both themes, and S16 acceptance (13).
  - Static build passes.
- **Measured change.** The folder list went from 11 to 9 controls in the page; sidebar and top-bar controls are unchanged at 17.

### Tasks board: drag and drop, covers — done (19 November 2026)

Built to the E04 spec in `ux-dashboard-kanban-family-base-plan.md`.

- **Library.** `@dnd-kit/core` 6.3.1, pinned exactly, with motion for animation.
- **Dragging.** The whole card (`canChangeStatus`, not archived) can be picked up; the user found a small grip handle inconvenient.
  - Mouse: a 6 px move starts the drag, so plain clicks on links and buttons still work, and native link dragging is suppressed.
  - Touch: press and hold (220 ms), so a quick swipe still scrolls the page.
  - The grip stays as the keyboard handle and visual hint: Space/Enter picks up, arrow keys jump between columns in status order, Space/Enter drops, Escape cancels. Moves are announced in a live region. Keyboard listeners sit only on the grip, so Space on the card's own buttons never starts a drag.
  - Start, Complete and Reopen still work.
- **Animation.** The picked-up card lifts in a drag overlay with a spring scale and tilt, and the target column highlights ("Drop here" in an empty column). Button moves glide the card into its new column (shared `layoutId`); a dropped card settles in place. Reduced motion is respected through `MotionConfig`.
- **Saving.**
  - The move shows at once and the card is marked busy. It reuses the versioned `PUT …/tasks/{id}/status`.
  - The optimistic state lasts until each column loads the refresh after the save, so a card never flickers back.
  - A failed save puts the card back with an error, and a conflict reloads the board.
  - Dropping in the same column or cancelling sends nothing. The existing Undo still works.
- **Covers.** `lib/task-cover.ts` picks a topic (trip, school, health, home, garden, bills, celebration, activity, shopping) from the task title and its linked event title. Nothing is saved, and repeating chores and unmatched tasks get no cover.
  - `task-cover.tsx` draws original flat SVG scenes in the theme's soft tints, so they follow dark mode.
  - Covers appear on board cards only, not in list view or on Today.
- **Repeat badge (audit UI-01).** Cards show a short label ("Weekly", "Every 2 days"); the full rule is in the title attribute and for screen readers. This fixed the sideways scrolling at 390 px.
- **Not done.** Manual ordering within a column (needs a saved ordering contract). With the Overdue filter the Completed column is hidden, so it cannot be a drop target there; the Complete button covers it.
- **Checks.** `output/ui-simplification/dnd-check.mjs` passes 9 checks:
  - Covers appear only on some cards.
  - Pointer drag saves and survives a reload.
  - A same-column drop or Escape is a no-op.
  - Keyboard move works and is announced.
  - A failed save rolls back with an error.
  - Start followed by Undo returns the card.
  - The title link still opens the task.
  - At 390 px the board fits with visible handles; a dark screenshot is saved.
  - Touch: a quick swipe does not drag; press and hold drags the card.
- **Regressions.** Phase 2, theme, shell, top bar, phase 4, S1 and WCAG AA contrast all pass. Screenshots are in `output/ui-simplification/dnd/`.
- **Demo data.** Reseeded during testing, so dates are relative to 19 November 2026.

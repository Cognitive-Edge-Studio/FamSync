# User flow, Today analytics, Kanban and Family Base plan

**Date:** 18 November 2026.  
**Confirmed:** “Homepage” means the signed-in **Today** dashboard.  
**Status:** Plan defined. E01 is complete locally; E02–E07 are planned. The charts and drag-and-drop behavior are not implemented yet.

## Product outcome

A family member opens Today, sees what needs attention, completes or moves a task without opening its detail page, and understands the coming week through a few useful charts. Common actions stay short; advanced options remain available. Family Base gets a real, navigable hello page now, with its AI product behavior reserved for a later discussion.

Keep the existing static Next.js export, separate NestJS API, Shadcn Space/Base UI components, Tailwind, sage primary, 3D module icons and cartoon human avatars. No legacy data migration is required.

## Simplified flows

| Journey | Proposed shorter flow | Required behavior |
|---|---|---|
| Start the day | Today → due/overdue items → Complete or Start → Undo | Put useful work ahead of large statistics; preserve work scope and current family. |
| Create a task | New task → title, assignee/date, visible sharing choice → Save | Title is the only required content field. Repeat, notes, reminders and event links are expandable optional sections. Keep Save/Cancel visible while scrolling. |
| Move work forward | Tasks board → drag a card to another status → saved feedback | Direct status controls and a keyboard alternative remain available. Failed or conflicting saves restore authoritative state. |
| Find a plan | Calendar → current day's agenda → event | Keep date/family context on return. Show earlier events deliberately instead of placing them before today on first entry. |
| Follow a goal | Today goal preview → goal progress → update or complete a linked task | Explain progress using the existing mode; avoid duplicate controls and repeated metadata. |
| Use a file | Folders → saved files → Preview/Download | Upload is one clear action opening a compact panel. Keep sharing and unavailable-source states clear. |
| Continue a conversation | Messages → identifiable person/conversation → reply | Preserve context, show useful source labels, and let chat take priority over optional side panes. |
| Open Family Base | Family navigation → Family Base → hello page | Existing account/family gates apply. No prompt box, model call or AI behavior is included yet. |

Use one task/goal work scope on Today, labelled **My work / Family work**. Family work means records currently visible to the caller, not owner access to everyone's private records. The schedule stays labelled as the visible family schedule rather than silently adopting a different meaning of “mine.” A family change clears stale records, scopes requests and ignores late responses from the previous family.

Persist useful view choices per account/family, and encode navigable filters/date context in URLs. Avoid extra confirmation for ordinary reversible task changes; retain confirmations for consequential administration and genuinely unsaved drafts. Do not make charts or filters another required step before users can act.

## Today layout

1. Compact family/date header and a single clear create action.
2. Small attention summary with actionable counts: overdue, due today, and upcoming events. Count links open matching filtered views.
3. **Do today**: unfinished overdue and due-today work, with existing authorized inline actions and Undo. Present today's events beside it on wide screens and directly after it on phones.
4. **Family overview**: up to three focused chart panels on desktop; a compact, collapsed summary on phones with an explicit Expand overview action. Keep the user's expanded/collapsed preference.
5. Goal preview and a capped upcoming list with See all links, arranged so existing data is not rendered twice in competing panels.

At 390 × 844, at least one actual due item should be visible without scrolling in the populated audit fixture. A family without due work sees a useful empty state and its next event. Charts must not push the daily actions back below the fold.

## Analytical cases and charts

### A. What needs attention now?

**Presentation:** compact counts plus a task-status donut or proportional stacked bar, with the same numeric breakdown available as text.

**Definition:** visible, nonarchived tasks in To Do, In Progress and Completed. Their sum is the active-record total; Completed remains a task status within that nonarchived set. Overdue is an overlapping subset of unfinished tasks, so it is a separate count and never a fourth mutually exclusive donut segment. The snapshot is labelled Current task status, not a historical completion rate.

**Action:** selecting a segment opens Tasks with the same family/work scope and status; selecting overdue opens the overdue filter. A zero total displays “No tasks yet,” not a misleading percentage.

### B. Which days in the next week are busy?

**Presentation:** a seven-day grouped bar chart with separate series for unfinished tasks due and scheduled event occurrences. Use “Scheduled items” rather than suggesting equal effort or hours.

**Definition:** today through today + 6 in the family time zone. Date-only task deadlines stay date-only; timed deadlines are assigned to the family's local day. Unfinished overdue tasks remain a separate backlog count. Each recurring task occurrence counts once, not the series template. Cancelled event occurrences are excluded and moved occurrences use their effective date. A multiday event appears on each day it spans; the legend/help explains this, so chart totals are not presented as unique event totals.

**Action:** a day opens its task list or calendar agenda through an explicit series/day action, with equivalent text links for keyboard and touch users. Extend the task list date-range query in NestJS if the existing filters cannot represent that day accurately.

### C. How close are our goals?

**Presentation:** horizontal progress bars for up to five relevant visible goals, plus Active/Completed counts and a See all goals link. Sort active dated goals by nearest target date, then undated goals, using a stable ID tie-breaker.

**Definition:** use the existing goal calculation for numeric and checklist modes, including archived linked-task exclusions and capped display percentages. Manual goals and empty checklists display their status instead of an invented percentage. Average progress excludes modes without a valid denominator, consistent with the existing Goals summary. Never combine hours, books and checklist item counts into one numeric total.

**Action:** a bar or its adjacent title opens the actual goal. Keep goal details as the place for editing targets and structure.

### D. Are we improving over time? — later history slice

**Presentation:** completion trend line or weekly completion bars, only after reliable history is recorded.

**Current limitation:** tasks and goals have current completion timestamps, but reopening clears them. Those fields cannot reconstruct historical state, completion/reopen transitions or an accurate past backlog. Do not manufacture a trend from current totals or label missing history as zero.

**Later implementation:** record completion/reopen/undo events transactionally with the underlying mutation, define whether each chart counts transitions or distinct completed occurrences, and reapply current source visibility to historical aggregates. Repeated acknowledgements must not duplicate events. Show the history coverage start and gaps. No old customer data migration or invented backfill is planned.

The first analytics delivery includes A–C. D needs its own metric contract and implementation slice after these charts are useful.

## Analytics implementation contract

- Add a NestJS endpoint such as `GET /api/v1/families/:familyId/dashboard/overview?scope=mine|all`. Return `generatedAt`, `timeZone`, the exact seven-day window, task status/backlog counts, daily series and goal progress summaries.
- Authenticate the caller, require current family membership and run every aggregate under current row-level security. Hidden private/selected work contributes neither titles nor counts. Family owners gain no special analytics bypass. Guest-only channel access does not grant family analytics.
- Aggregate complete datasets in PostgreSQL/NestJS rather than downloading paginated records into the browser and counting the first page. Reuse existing task/goal business rules and canonical recurrence/occurrence expansion.
- Materialize any necessary task occurrences before reading, then use a consistent database snapshot for the response. Respect the existing actor-context transaction setup; choose isolation before its first query if repeatable-read is needed. Do not call separate service transactions and imply they form one atomic overview.
- Use a bounded response and explicit no-store/private caching behavior. Clear the previous family's result immediately during switching. Abort superseded browser requests and ignore responses for the wrong family/scope.
- After successful task/goal changes, refetch or invalidate the overview alongside the affected lists and counts. Focus/reconnect should revalidate it. Do not publish private aggregates in Realtime payloads.
- Generate the OpenAPI contract/client. All server validation, queries, history and authorization stay in NestJS; Next.js only renders client screens and static assets.
- Give each chart loading, empty, error/retry and accessible text/table states. Use stable colors, visible labels, keyboard/touch-accessible detail links, reduced motion and responsive dimensions.

**Chart library:** plan Recharts with a shared chart container/tooltip/legend matching the existing Shadcn Space cards and Base UI styling. Confirm compatible locked versions during the chart slice. The official [Base UI chart documentation](https://ui.shadcn.com/docs/components/base/chart) describes the Recharts composition pattern. Do not add another UI primitive family or copy analytics demo data into the product.

## Task Kanban drag and drop

**First delivery:** move authorized task cards between **To Do**, **In Progress** and **Completed**. Preserve the current due-date ordering inside each column. Manual within-column ranking is a separate requirement because it needs a saved ordering contract; do not imply a temporary visual reorder is persisted.

- Use the maintained dnd-kit React APIs with pointer, touch and keyboard support. Validate package versions against the installed React version when executing; the current [sensor documentation](https://dndkit.com/react/guides/sensors/) covers separate pointer/touch activation and keyboard input.
- Give movable cards a dedicated, named drag handle. Links, buttons and text selection must keep their existing behavior. Use touch activation that does not hijack scrolling, visible drop feedback, auto-scroll where required and a drag overlay that avoids layout jumps.
- Only `canChangeStatus` tasks may start a drag. Archived tasks, saving tasks and forbidden destinations are disabled with clear feedback. Moving a recurring occurrence changes that occurrence only, not its entire series.
- Keep all three status destinations available, including empty columns. Define filtered board behavior explicitly: only matching cards are listed, but valid destination columns stay available; a card that stops matching after a move disappears with saved feedback and Undo.
- Reuse `PUT /api/v1/families/{familyId}/tasks/{taskId}/status` with the expected version. The server remains authoritative for creator/assignee permission, completion timestamps, linked-goal progress and reminders.
- Optimistically move one card and mark it pending. A same-column drop or cancel performs no mutation. Prevent duplicate submissions and restore/refetch after network failure, 403, 404 or version conflict. A retry must never blindly toggle a newer saved state.
- Use the server's returned task version for Undo. Refetch relevant pages and totals so a moved card is not left duplicated or missing because each column loads separately. Preserve pagination and clearly distinguish loaded counts from total counts.
- Retain Start/Complete/Reopen controls or an equivalent Move to menu. Support keyboard pickup/move/drop/cancel and announced results. Dragging cannot be the only way to change status.
- The library can be shared, but other modules do not gain drag interactions as part of this task.

## Execution slices and gates

Every slice starts with its concrete changes, affected files, data contract and acceptance cases before implementation. Record its result separately; a completed scaffold does not mark analytics or Kanban complete.

| Slice | Deliverable | Acceptance | Dependencies/status |
|---|---|---|---|
| **E01 — Family Base scaffold** | Static `/family-base/` route, Family Base title, simple hello panel, active desktop/mobile family navigation; existing auth and family selection. Reuse the home illustration for now. | Direct link and refresh work, family switching stays on the new route, account/family gates prevent rendering an unavailable member workspace, 31-page static export, browser check. | Complete locally. No new API, AI model, prompt, credentials or dependency. |
| **E02 — Responsive and navigation foundation** | Resolve task recurrence overflow, chat column breakpoint and mobile Account navigation from audit UI-A. Preserve family and filter/date context across module navigation. | No unintended document overflow at 390/768/1024/1280/1440/1600; chat width does not collapse at a wider breakpoint; keyboard/focus and unsaved tab content remain correct. | Planned. Existing audit UI-01, UI-02, UI-05. |
| **E03 — Shorter everyday flows** | Reorder Today around due work, compact mobile summaries/filters, clickable counts with URL filters, shorter task creation and Today-focused agenda; saved-file library before upload. | Trace create/complete/undo and return-to-source journeys; first useful work item within the initial mobile screen; sharing stays explicit; saved data and drafts survive expected navigation/errors. | Planned after E02. Coordinate with audit UI-B/UI-D rather than maintaining duplicate implementations. |
| **E04 — Kanban drag and drop** | Integrate pointer/touch/keyboard dragging with versioned status changes, optimistic feedback, Undo and current pagination. | All cross-column transitions, empty column, no-op/cancel, recurring occurrence, forbidden actor, archive, filtered view, duplicate submission, conflict and network rollback; buttons/links still work. Confirm counts/linked goals after reload. | Planned after E02; reuse existing NestJS status endpoint and canonical rules. |
| **E05 — Analytics data** | Implement the A–C metric contract, one authorized overview endpoint, required date filters and generated client. | Fixtures for counts, recurrence, moved/cancelled/multiday events, time zones and zero denominators; private/selected/removed-member isolation; > one page of tasks; overview/list consistency and bounded query cost. | Planned; write exact SQL/DTO contract before implementation. No historical trend claimed. |
| **E06 — Today charts** | Add task-status, seven-day scheduled-items and goal-progress charts below the daily work, with accessible summaries and real navigation links. | API totals equal displayed values; keyboard/touch labels; zero/loading/error states; no stale family data; task drag/undo refreshes overview; mobile content remains useful above the fold; static export. | Planned after E03–E05. |
| **E07 — Integrated acceptance** | Review the combined flows and update feature/docs status. | ChatGPT-browser mouse, keyboard and narrow-screen journeys; two accounts plus excluded/removed member; meaningful API/SQL regression; static-host refresh/deep links; chart layout and real touch/keyboard follow-up gaps recorded. | Planned. Hosted acceptance still requires staging. |

## Family Base graph visual direction

The product owner selected the [3D Force Graph large-graph example](https://vasturiano.github.io/3d-force-graph/example/large-graph/) as the visual reference for a future Family Base graph. Preserve its space-like 3D network, colored node groups, fine connections, and explorable depth. The [example source](https://github.com/vasturiano/3d-force-graph/blob/master/example/large-graph/index.html) colors nodes by a grouping field and supplies hover labels.

The visual reference is implemented locally with fictional data in [FB-D01, the Family Base 3D demo slice](family-base-demo-graph.md), using the React force-graph bindings with Three.js. The demo adds search, constellation filters and an in-app details panel around the canvas. Static export and browser acceptance checks passed. Real node types, relationship meanings, permission-scoped data and AI participation remain to be defined with the owner. The demo does not change E02–E07 execution status or claim to implement live family relationships.

## Delivery and recovery

Use additive schema changes only if analytics filters or future preferences/history require them. Deliver compatible NestJS contracts before the static chart client; retain the previous artifacts for rollback. E04 initially requires no status-model migration. No new dependency is needed for the Family Base scaffold. AI scope, data access, model/provider, tools, memory and cost controls will be discussed later, before adding any AI implementation to Family Base.

The previous UI audit remains the evidence backlog. This plan sets the execution order for the newly requested flows, charts and board interaction; identity/notification context and other audit items stay visible as later work rather than being silently marked complete.

## Execution results

**E01 — complete locally.** Added `apps/web/src/app/family-base/page.tsx` and the client `family-base-screen.tsx`, a Family Base navigation item in the shared desktop/mobile shell, and support for its route in the existing family selector. The member page shows a home illustration, “Hello, family.” and the selected family name. AI functionality remains undefined and unimplemented, as requested.

The build passed TypeScript and exported all **31 pages** statically. ChatGPT's browser verified the Carter Family page, direct refresh, active navigation, the mobile drawer link, and a 390 px layout with equal content/scroll widths. In a separate existing account, changing the selector from S16 Browser Family to Rahman Family kept `/family-base/` and updated the greeting. An unavailable family query showed “Family workspace not found”; a fresh signed-out origin showed the existing Sign in state without the greeting. The empty-family branch reuses the existing ScheduleFamily component; no separate empty-family account was created for this visual scaffold. Screenshots: `output/family-base/desktop.jpg` and `output/family-base/mobile.jpg`.

**E02–E07 — planned.** Next: E02 responsive and navigation foundation. No chart or drag library was installed during E01. The temporary viewport-check HTML was removed after verification.

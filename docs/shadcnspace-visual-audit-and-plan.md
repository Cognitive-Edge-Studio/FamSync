# Shadcn Space visual audit and FamSync implementation plan

**Date:** 18 November 2026  
**Goal:** Bring FamSync visually close to the Shadcn Space dashboard while retaining FamSync's workflows, permissions, and data.  
**Status:** Phases 0–5 and the top-bar step are complete locally (sections 9–15). Hosted verification waits for staging; workspace search is a separate product slice.

**Follow-up audit:** [Populated UI improvement audit, 18 November 2026](ui-improvement-audit-2026-11-18.md) records current desktop/mobile findings after the 3D icons and human avatars were introduced, including task recurrence overflow and the chat breakpoint. Its proposed UI-A–UI-D slices are not yet implemented; earlier visual acceptance does not resolve these newly observed issues.

## 1. Scope and evidence

The reference is the light Shadcn Space dashboard at [dashboard.shadcnspace.com](https://dashboard.shadcnspace.com/). The desired target is its application design language, adapted to FamSync's features. Near-exact matching should be judged against the same viewport and comparable content, not against an empty FamSync page beside a populated demo.

**Direct browser observations:** Shadcn Space analytics, Kanban, calendar, chat, and account settings; FamSync Today, Tasks, Calendar, Goals, Channels, Messages, Families, Account, and a source message. The FamSync screens included both loaded and empty states. Screens were viewed at desktop width in the in-app browser. These observations were made on 17–18 November 2026.

**Code review:** Current route inventory, `app-shell.tsx`, `globals.css`, shared button and field styles, Today and Tasks, and the detail, conversation, notification and guest components. Code observations describe structure and classes, not a claim that each state was visually inspected.

**Limits:** The local FamSync server at `127.0.0.1:3013` refused connections when the family detail view was opened in the final audit pass. Mobile, tablet, populated states for every feature, every dialog, all authentication and guest states, and Shadcn Space's full catalog have not been visually verified. Earlier browser views were available before that failure. The route inventory below identifies these gaps explicitly. Before declaring visual parity, restart the local services and complete the verification matrix in section 7.

## 2. Shadcn Space reference audit

### Application shell

- A persistent left sidebar contains the logo, small uppercase section labels, icon-led navigation, and a dark filled active row. Its navigation scrolls independently. The demo also has a promotional panel at the bottom; that is demo-specific.
- The main workspace sits to the right in a light bordered frame. A compact header holds the sidebar control and search on the left and a group of icon actions and avatar on the right. A compact title/breadcrumb panel is separated from the feature content below.
- Main panels are predominantly white with thin neutral borders, modest rounding, restrained shadows, and consistent internal padding. The workspace is wider and more densely used than FamSync's current centered layout.
- The observed palette is near-black, white and neutral gray. Strong accent colors appear on small badges, calendar events, and chart details. Match actual computed values and font assets during the baseline pass; colors and dimensions here are visual observations, not measured specifications.

### Reference views

| Reference | Observed composition | Applicable FamSync pattern |
|---|---|---|
| Analytics dashboard | Unequal card grid, compact summary widgets, larger charts, lists and tables. Small secondary labels and clear card headings. | Today: summary cards, schedule, task and goal panels. Use real family data. |
| Kanban | Breadcrumb strip; one bordered board panel; tinted columns, compact white cards, status dots/counts, avatars, badges and small actions. | Tasks board and task cards. Keep existing status and accessible actions. |
| Calendar | Breadcrumb strip, large calendar panel, compact toolbar with centered month, segmented view buttons, full-width grid and colored event bars. | Calendar month/agenda and event creation. The demo also displays week/day controls; those are not evidence that FamSync implements them. |
| Chat | One bordered, tall workspace with a conversation list, central conversation and composer, plus an optional media/attachment column. Avatars and message bubbles provide hierarchy. | Direct messages and channels. FamSync currently uses separate routes; preserve deep links and the ability to return to a conversation when adapting the layout. |
| Account settings | Breadcrumb strip, horizontal tabs, paired profile/password panels and a full-width details panel with compact form controls. | Account, privacy, notifications and security. Organize existing settings without changing their behavior. |

The dashboard demo includes illustrative sales data, commerce actions, a theme control, and example avatars. They are visual examples, not requirements for FamSync. Use only functionality and assets that exist or are deliberately implemented. The repository includes a Shadcn Space license notice for its existing button; verify the license and entitlement of each external component or asset before copying it.

## 3. FamSync frontend baseline

FamSync is a Next.js static export using React, Tailwind, Base UI, Lucide, React Hook Form and a generated API client. `apps/web/components.json` already registers `@shadcn-space`, and `src/components/ui/button.tsx` is based on its Base UI button. Most screens still compose panels, labels and inputs individually. `account-fields.tsx` supplies a shared field and feedback style; it does not provide a complete shared design system.

`app-shell.tsx` uses a centered `max-w-6xl` container and horizontal links that wrap, with a notification bell. It has a guest mode and a skip link. `globals.css` defines warm cream surfaces, green foreground/primary/accent colors and Segoe UI. Many screens use `rounded-2xl` or `rounded-3xl`, larger headings and `max-w-3xl` detail layouts. Those choices explain the consistent difference from the reference even where individual cards are similar.

Preserve static-export routes and query parameters, family selection, session handling, access restrictions, privacy labels, focus management, keyboard controls, retry and error feedback, and existing API/realtime behavior. Visual work must not replace real counts with placeholders or expose records across audiences.

## 4. Screen and state inventory

**Evidence key:** B = directly observed in browser; C = reviewed in code/route inventory; V = still requires visual inspection. These labels are not functional test results. Reference mappings marked “adaptation” have no exact equivalent among the reference pages inspected.

| FamSync route or surface | Evidence | Current structure / target and implementation notes |
|---|---|---|
| `/` home | C, V | Public landing screen; retain a public shell and align typography, buttons and surfaces. Inspect a suitable reference auth/landing view before choosing an exact composition. |
| `/today/` | B, C | Large hero, four summaries, schedule, family, tasks, goals, upcoming panels. Replace hero with compact reference header; arrange live panels in a denser responsive grid. Preserve task scope, dates and retries. |
| `/calendar/` | B, C | Month/agenda in a centered panel; selected-day details below. Match reference calendar toolbar and grid; preserve family time zone, selected day, recurrence, accessible cell labels and mobile agenda. Match colored event treatments without implying an unsupported classification. |
| `/event/` and occurrence actions | C, V | Detail article in narrow container with event actions and linked tasks. Use shared detail panel and breadcrumb; keep occurrence/series distinctions, attachments and feedback visible. |
| Event create/edit dialog | C, V | Base UI dialog and form with audience, date/time and attachment. Match dialog/form treatment while retaining validation, focus return and all-day/recurrence behavior. Inspect every mode and scroll state. |
| `/tasks/` | B, C | Board/list, filters, scope and task counts. Apply Kanban panel, compact columns and cards; preserve filters, pagination, completion, undo and accessible alternatives to any drag interaction. |
| `/task/`, task dialog and task card | C, V | Detail article, status and privacy badges, actions and links. Match reference cards, metadata and dialogs. Verify recurring occurrences, linked events, archive and errors. |
| `/goals/` | B, C | Summary cards, status/type/scope filters and empty state. Use dashboard cards and compact filtering (adaptation); keep family/individual and progress semantics. |
| `/goal/`, goal dialog and task linking | C, V | Detail with progress and linked tasks. Apply shared detail and form patterns (adaptation); preserve checklist, numeric/manual modes and audience constraints. |
| `/channels/`, `/messages/` | B, C | Separate centered list pages with search and family selector. Use the reference chat list within a split workspace; preserve archive, search, new conversation and deep links. |
| `/channel/`, `/direct/` | C, V | Shared conversation component with scrolling history, replies, reactions, mentions, composer, management and realtime status. Map to chat center pane and optional details pane; preserve draft, pagination, message links and guest restrictions. |
| `/message/` source | B, C | Narrow detail card with linked work actions. Use breadcrumb/detail panel consistent with chat; keep source access, links and create/link actions. |
| `/families/`, `/family/` | B for list; C and V for detail | Long list of separate cards and inline creation; detail contains members, settings and invitations. Use compact list/table and settings panels (adaptation); preserve role-specific controls and invitation delivery/error states. |
| `/account/` | B, C | Stacked profile, activity, privacy, notifications and security sections. Use reference settings tabs and panel grid. Preserve save boundaries, sensitive actions and existing labels. |
| `/notifications/` | C, V | List of cards with read states and filters/actions. Use compact list rows and reference dropdown/list language (adaptation); preserve unread meaning and destination. |
| `/guests/`, `/guest-channel/`, `/join-channel/` | C, V | Guest-only shell, channel list/conversation and invitation. Apply the same shell with only authorized guest navigation; do not show family data or routes a guest cannot use. |
| `/join/` | C, V | Family invitation flow. Apply auth panel style while retaining token handling, recipient checks, recovery and feedback. |
| `/sign-in/`, `/sign-up/`, `/forgot-password/`, `/reset-password/`, `/auth/callback/` | C, V | Shared auth form, recovery and callback states. Compare with reference auth pages first; keep confirmation, PKCE, recovery and errors intact. |
| Shared loading, empty, failure and permission states | B for some list states; C, V for rest | Replace bare text with consistent compact status or skeleton treatments while retaining live-region announcements, retries and clear access-denied wording. Capture each state; do not simulate real counts. |

## 5. Design specification to establish before coding

1. Capture the same Shadcn Space and FamSync views at **1440×900, 1024×768, 768×1024 and 390×844 CSS pixels**, with browser zoom 100%, and record browser/device scale. Capture a populated and an empty state for each applicable view. These are proposed comparison sizes, not observed breakpoints.
2. Measure reference sidebar and header dimensions, content gutters, card radii, control heights, border colors, font family/weights, type scale, line heights and layout gaps using browser inspection. Record exact values and sources before locking tokens. Verify font and asset licensing.
3. Define semantic tokens for canvas, sidebar, panel, text, muted text, border, primary, focus, destructive, status and chart colors. Use the reference's neutral palette as the baseline; decide any retained FamSync accent explicitly. Verify text and control contrast.
4. Build reusable Base UI-compatible primitives for sidebar/drawer, header, page title/breadcrumb, card, tabs, buttons, inputs/selects, badges, avatar, table/list, dialog, feedback and empty/loading states. Use the existing button and `Field` as starting points, consolidating repeated page classes. Avoid mixing incompatible primitive families.
5. On small screens use a keyboard-accessible navigation drawer, preserve visible focus and return focus on close, prevent page overflow, and let wide boards scroll within their own container. Choose exact responsive behavior after inspecting the reference at matching sizes; these are proposed requirements, not observed reference behavior.

## 6. Implementation plan

### Phase 0 — Baseline and decisions

- Restore the local frontend, API and seeded fixture access without resetting data. Capture the reference and current screenshots in the matrix above; inventory dialog, loading, error, permission and populated states. Confirm the authoritative reference variant and brand color.
- Inventory licensed reference components and existing assets. Identify the exact source and license for anything copied. Establish visual baselines for the shared shell, Today, Calendar, Tasks, Chat and Account.
- **Done when:** measured tokens, coverage matrix, screenshot pairs and remaining gaps are recorded; comparison uses the same viewport and representative data.

### Phase 1 — Shared shell and primitives

- Refactor `app-shell.tsx` into desktop sidebar, top bar, mobile drawer and content frame. Include active navigation, notification access, family context and guest-only navigation. Keep skip link, current-page state and direct links.
- Update `globals.css`, `ui/button.tsx`, `account-fields.tsx` and introduce shared primitives. Migrate incrementally so legacy screens remain usable while their layouts are converted. Audit all direct uses of color, radius and width classes.
- **Done when:** every route renders in the new shell; guest and public routes show the correct navigation; keyboard navigation and narrow-width layout work; no dead reference controls are shown.

### Phase 2 — Dashboard and coordination

- Convert Today, Tasks and Calendar, including their detail pages and create/edit dialogs. Use the analytics, Kanban and calendar references respectively. Preserve real queries, selection, pagination, recurring instances, time zones, audiences and action feedback.
- **Done when:** populated, empty, loading and error states match the approved reference structure at the comparison sizes; existing task/calendar journeys and keyboard access work.

### Phase 3 — Communication

- Build a responsive chat workspace for Channels and Direct Messages, with list, conversation and optional details regions. Make fixed exported routes and query links continue to open the same records. Adapt guest channel, source message, search, replies, reactions and work links to the shared layout.
- **Done when:** direct links, conversation switching, history loading, realtime refresh, drafts and guest restrictions work on desktop and mobile; no content becomes inaccessible when panes collapse.

### Phase 4 — Remaining screens

- Convert Goals, Families, Account, Notifications, invitations, guest screens and authentication using the shared patterns. Keep settings and validation behavior intact. Map each screen without an exact reference to a documented reference pattern rather than inventing demo features.
- **Done when:** every route and dialog in section 4 is migrated, including role-specific and failure states, and shared styles replace repeated one-off patterns.

### Phase 5 — Acceptance and release

- Compare paired screenshots at identical dimensions for each target view. Review shell geometry first, then typography, spacing, colors, controls and content. Record any intentional differences and resolve visible mismatches.
- Run the web build and relevant existing checks, plus browser journeys for sign-in, family selection, event/task/goal changes, invitations, settings and messaging. Check keyboard focus, contrast, responsive overflow and screen-reader names. Test authorization and privacy using the existing relevant checks when any data or behavior has changed.
- **Done when:** every route/state in section 4 has a result, no high-impact visual or functional regressions remain, and screenshots and exceptions are reviewable.

## 7. Remaining audit and verification checklist

- [x] Restore the local services and confirm the actual build/version being viewed. Baseline uses the S16 static export on `127.0.0.1:3022` with NestJS on `4016`.
- [x] Capture a populated family with events, tasks, goals, channels, messages and notifications, using permitted synthetic fixtures (`output/visual-baseline/fixture.mjs`). Empty states remain to capture during each phase.
- [ ] Open and capture event, task, goal, channel and direct-message create/edit dialogs, including validation, saving, error and narrow viewport states.
- [ ] Inspect event, task, goal, family, channel, direct-message and notification details, including owner/member/guest permission differences.
- [ ] Inspect public landing, sign-in, sign-up, recovery, callback and both invitation flows; avoid submitting real invitations or credentials during visual review.
- [x] Inspect the reference at mobile and tablet widths, including the sidebar toggle, calendar, Kanban, chat and account settings. Representative dialogs remain.
- [x] Inspect FamSync at the same widths for overflow and header height (section 9.3). Long titles, many records, keyboard and focus states remain for each phase.
- [x] Measure the reference design tokens, buttons, tabs, inputs, badges and panels (section 9.2). Dialog and select variants remain.
- [x] Verify licensing for code and fonts in use (section 9.4). Demo imagery and avatars are not used.

## 8. Decisions and risks

- **Visual fidelity versus brand:** The reference's neutral/black palette is central to its appearance. A strong green theme will look different; agree on the amount of retained green before establishing baselines.
- **Reference behavior versus product behavior:** Calendar week/day views, chat media panels and other demo controls should only be presented if implemented. Matching visual structure must not create inert controls.
- **Privacy:** Counts, previews, avatars, links and notifications must continue to reflect the viewer's existing access rules. Guest navigation must remain constrained.
- **Responsive and accessibility:** A desktop sidebar and dense board need deliberate small-screen behavior, focus handling and usable touch targets. This is a design and verification task, not an assumption that the demo's desktop view works on mobile.
- **Implementation overlap:** Most screen styles are embedded in feature components. A token-only update cannot achieve near-exact parity; shell, shared primitives and page composition all need work.
- **Build environment:** A previous static export compiled and passed TypeScript but failed on Windows with `EPERM` under `.next`. Recheck the current environment and treat a successful full export as a release gate.

## 9. Phase 0 baseline (18 November 2026)

### 9.1 Evidence

- **Reference:** `output/visual-baseline/reference/` holds 32 screenshots (Analytics, Kanban, Calendar, Chat, Account settings, Contacts, user data table, boxed login) at 1440×900, 1024×768, 768×1024 and 390×844 CSS pixels, scale 1, plus the opened mobile and tablet menu. `measurements.json` and `probe.json` hold computed values. Scripts: `capture-reference.mjs`, `probe-reference.mjs`.
- **FamSync:** `output/visual-baseline/famsync/` holds 76 screenshots of 19 routes (Today, Calendar, Tasks, task, event, Goals, goal, Channels, channel, Messages, DM, Folders, folder, Families, family, Account, Notifications, home, sign-in) at the same sizes, with `measurements.json`. Script: `capture-famsync.mjs`.
- **Fixture:** `fixture.mjs` creates a synthetic "Rahman Family" (Europe/London) for the S04 owner and member test accounts: six events including a weekly practice, seven tasks across overdue/today/upcoming/in progress/completed, a weekly chore, checklist, numeric and manual goals, a channel thread with a reaction, a DM, and a family folder with two files. Its IDs are in `fixture.json`; rerunning reuses it.
- The scripts take `PLAYWRIGHT_CORE` (an installed playwright-core folder) because Playwright is not a project dependency.

### 9.2 Measured reference tokens (1440 px)

| Token | Reference value | Current FamSync |
|---|---|---|
| Font | Geist, 16/24 body, 14/20 controls and lists | Segoe UI Variable / system |
| Canvas and panels | White `#ffffff` (lab 100) | Cream `#f7f7f1`, panels `#fdfef9` |
| Text | Near-black `#0a0a0a`; muted `#737373` | Green-black `#192d27`; muted `#4f645a` |
| Primary | Neutral `#171717`, white text | Green `#184b3d` |
| Secondary/muted/accent | `#f5f5f5` | Green tints `#edf1e8`/`#e3eddf` |
| Border / ring | `#e5e5e5` / `#a1a1a1` | `#dce4d8` / `#226452` |
| Sidebar | 256 px, `#fafafa`; section labels; 20 px icons; rows 14 px; active row filled primary, white 500 text | None (top links) |
| Top bar | 57 px, white, 1 px bottom border; workspace frame starts at x 260, 8 px top inset | 73 px desktop; 205–209 px on a phone because links wrap |
| Base radius | `--radius` 8 px; panels 12 px; tabs 8/6 px; badges pill | 10 px base, panels mostly 16–24 px (53 uses of `rounded-2xl/3xl`) |
| Panels | 1 px border, no shadow, 24 px padding, 24 px gaps | Borders plus hero shadow, larger padding |
| Page title | Title strip panel: 20/28 semibold title, breadcrumb right (14 px) | Hero card with 36–48 px heading and eyebrow label |
| Section heading | 18/28 semibold; card title 16/24 semibold; stat value 24/32 medium; muted caption 12/16 | 24–30 px |
| Controls | Buttons and inputs 36 px high, 14 px/500, 8 px radius; search 320 px | 40 px high |
| Tabs | 36 px tinted track `#f5f5f5`, active tab white | Pill buttons |
| Badges | 20 px, 12/16 medium, tinted background with matching text | Rounded counts |
| Board columns | ~290 px, tinted `rgba(23,23,23,.05)`, 12 px radius, white cards | Columns in cards |
| Status colours | Red `#e7000b` (destructive), teal, orange, yellow chart colours | Destructive `#a72535` |

### 9.3 Layout comparison

- **Desktop:** the reference uses the full width beside the sidebar. FamSync centres a 1088 px column (dashboards) or 768 px column (details, chat, settings) inside a top bar.
- **Below 1440 px:** the reference hides the sidebar at 1024, 768 and 390 px and opens it as a modal drawer from the top-bar toggle (293 px wide on a phone, 384 px on a tablet). The top bar stays 57 px. No reference page scrolls sideways.
- **FamSync on a phone:** no page scrolls sideways, but the wrapped navigation takes 205–209 px of an 844 px screen before content. A drawer like the reference fixes this.
- **Guest navigation:** the family owner's top bar shows "Guest channels" alongside family links; Phase 1 should confirm whether that entry belongs in the member navigation.

### 9.4 Licensing and assets

- The existing Shadcn Space button is MIT-licensed; `ui/SHADCN-SPACE-LICENSE.txt` carries the notice. `components.json` registers `@shadcn-space` with the `base-nova` style and Base UI, which keeps new components compatible.
- Geist is under the SIL Open Font License and can be loaded through `next/font`, which works with the static export.
- Reference demo photos, avatars, illustrations and the promotional panel are not used. The product owner has approved generated images, icons and illustrations, so FamSync can have its own empty-state illustrations, member avatars (initials by default) and app icon. Lucide stays the icon set.

### 9.5 Decisions needed before Phase 1

1. **Palette.** Either match the reference's neutral palette (near-black primary, white surfaces) or keep FamSync green as the primary/accent colour on the neutral surfaces. The tokens above make either a one-file change, but screenshots are compared against the chosen option.
2. **Navigation breakpoint.** The reference collapses the sidebar below 1440 px. Proposed for FamSync: persistent sidebar from 1024 px, drawer below, so tablets in landscape keep navigation visible.
3. **Family switcher.** Move the per-page Family select into the sidebar or top bar so it applies across screens.

## 10. Phase 1 result — shell, tokens and primitives (18 November 2026)

**Decisions.** The product owner chose a fully neutral palette like the reference, softened with the warm stone neutrals and pastel tints of goppopi.com (canvas `#f5f5f4`, primary `#292929`, border `#e7e7e5`, Inter-like proportions). Pastel tints are reserved for status, categories, avatars and empty states and always appear with a visible word. Generated images, icons and illustrations are approved; demo assets are not copied. Proposed defaults in 9.5 were applied: persistent sidebar from 1024 px with a drawer below, and the family switcher moves in Phase 2 (it is rendered per screen by `ScheduleFamily` today).

**Tokens (`globals.css`).** Canvas `#f5f5f4`, workspace `#fafaf9`, panels `#ffffff`, text `#242424`, muted text `#6f7177`, primary `#292929`, secondary/muted `#f1f0ec`, accent `#efeeea`, border `#e7e7e5`, ring `#8a8b85`, destructive `#c0392b`. Soft tints with paired text: sage, peach, lavender, sky and rose. Radii follow the reference (8 px controls, 12 px panels); `rounded-2xl`/`3xl` now resolve to 12/14 px, so existing panels match without per-screen edits. Geist loads through `next/font` with system fallbacks. The two green-tinted hero shadows were removed; only dialogs and the drawer keep shadows. The app icon is now near-black with a sage dot.

**Shell (`app-shell.tsx`).** A 256 px sidebar on `#f5f5f4` with Plan, Talk and Family groups, 20 px Lucide icons, 36 px rows, a filled active row and Account pinned at the bottom. The workspace is an inset white frame with a 57 px sticky top bar holding the notification bell and an account button. Below 1024 px a menu button opens the same navigation in a Base UI modal drawer (focus moves in, Escape closes and returns focus). Guest screens show only Guest channels and Account. Landing, sign-in, sign-up, recovery and callback screens use a public variant with a simple top bar and no workspace navigation. The skip link, current-page state and all routes and query links are unchanged; no search box or other inert reference control was added.

**Primitives (`components/ui`).** `Card`, `PageHeader` (title strip with optional description, actions and breadcrumb), `Badge` (soft tones), `Avatar` (initials on a tint chosen from a stable ID) and `EmptyState`. The button scale is now 36 px (default), 40 px (large) and 36 px icons; explicit 40/44 px button heights across screens were brought to 36 px. Inputs are 36 px on wider screens and 40 px with 16 px text on phones (avoiding mobile zoom), with white fill and medium labels.

**Checks.** The web build exports all 30 pages statically. A recapture of the 19 baseline routes at 1440, 1024, 768 and 390 px (`output/visual-baseline/famsync/`, before images in `famsync-before/`) showed a 57 px top bar everywhere (previously 205–209 px on phones), Geist applied, no horizontal scrolling and no page errors. `shell-check.mjs` verified the phone drawer's focus handling and navigation, the persistent desktop sidebar and skip link, guest-only navigation and the public shell. The S16 browser acceptance (13 checks) still passes on the restyled build.

**Carried into later phases.** Page compositions still use their own hero cards, large headings and per-screen family selects; Phases 2–4 replace them with `PageHeader`, `Card` and the shared family switcher. A family member opening Guest channels sees guest-only navigation (existing behaviour); decide in Phase 3 whether members keep family navigation there. The desktop top bar's left side stays empty until a real search or family context is implemented.

## 11. Phase 2 result — Today, Tasks and Calendar (18 November 2026)

### 11.1 Shared changes

- **Family switcher in the shell.** `ScheduleFamily` renders its picker into a slot in the top bar (React portal), so Today, Calendar, Tasks, Goals, Channels, Messages and Folders show the current family there instead of a form field above each page. With one family it shows the name; with several it is a compact select (still labelled "Family") that reloads the current screen for the chosen family. On phones the logo shrinks to its icon to make room.
- **Motion.** The product owner approved animation with a proper library. `motion` 14.7.1 (exact version) provides a short fade-and-lift for page content, staggered Today stat cards, and task cards that fade in, ease to new positions and fade out when their status moves them (`AnimatePresence`). All 11 Base UI dialogs and the phone menu fade and scale via `data-starting-style`/`data-ending-style` transitions. `MotionConfig reducedMotion="user"` makes content appear instantly for people who prefer reduced motion.
- **New primitive.** `Segmented` is the reference tab track (36 px tinted track, raised white option), used for My items/Whole family, Board/List and Month/Agenda. It keeps pressed-button semantics because each option filters the same content.
- Dialog titles are 20 px; status notices use the soft sage tint; empty live regions no longer add layout gaps.

### 11.2 Today

Title strip with family and date and an Open calendar action; four stat cards (2×2 on phones, one row on wide screens) with soft tinted icons (sky, lavender, sage, and rose when something is overdue); today's schedule beside a Coming up column that also links to the calendar and family settings; Tasks due today beside Goal progress. Event rows use the shared soft list row, and an empty day uses `EmptyState`.

### 11.3 Tasks and task detail

Title strip with New task; one toolbar panel with the Show select, the Board/List track and pill filters with counts; board columns are tinted (`#f1f0ec`) with a status dot and count, holding white cards. Cards show the title, soft badges (Overdue, status in list view, repeat rule, archived, cancelled link), due text and audience, a linked event, and a divided footer with the assignee's initials avatar and Start/Complete/Reopen. The task page has a breadcrumb title strip with status badges, an actions and description panel, and a Details panel on the right (stacked on phones).

### 11.4 Calendar and event detail

Title strip with family, time zone and New event; toolbar with previous/next and Today, the month centred (its own row on phones) and the Month/Agenda track; a legend; event bars tinted by audience (Family sky, Selected lavender, Only me peach) — the legend and each event's audience text carry the same meaning in words; selected day in soft grey, today in a dark circle. The event page mirrors the task page: breadcrumb title strip with audience, repeat, moved and cancelled badges, occurrence actions and linked tasks in the main panel, and a Details panel with schedule, location and repeat rule.

### 11.5 Proposed next: top-bar features

The reference top bar carries search, quick actions, notifications and the account menu. Phase 1 built the bar and Phase 2 added the family switcher; no phase yet covered the rest. Proposed, using only behaviour FamSync already has:

1. **Quick create** — a "New" menu (task, event, goal, message) that opens the existing dialogs on the right screen for the current family.
2. **Notifications popover** — the bell opens the latest notifications with mark-as-read, and links to the full inbox.
3. **Account menu** — the account button shows initials, name and email, with Account, Families and Sign out.
4. **Search** — needs a new API that searches tasks, events, goals and messages within the caller's access; treat it as its own slice rather than a visual change.

### 11.6 Checks

The web build exports all 30 pages. A recapture of the 19 baseline routes at four sizes found no horizontal scrolling and no page errors. `phase2-check.mjs` verified the New task and New event dialogs at 1440 and 390 px (focus in, Escape returns focus), completing a task moving its card to Completed and Undo moving it back, layout and filter controls, calendar month navigation, keyboard day selection and the Agenda view, and that reduced motion shows content without fading. `shell-check.mjs` (4 checks) and the S16 browser acceptance (13 checks) still pass.

## 12. Top-bar result — quick create, notifications and account menu (18 November 2026)

- **Quick create.** A dark "New" button (icon-only on phones) opens a Base UI menu: Task, Event, Goal, Channel and Direct message. Each item opens the matching screen for the family currently shown (published by `ScheduleFamily`) with `?new=<kind>`; the screen opens its existing create dialog once and removes the flag, so reload and Back do not reopen it. Guest screens have no Create menu.
- **Notifications preview.** The bell keeps its unread badge and once-a-minute check, and now opens a popover with the latest six notifications (unread ones tinted and announced as "Unread"), Mark all as read, and View all notifications. Opening an item marks it read and goes to its page. The inbox page and the popover share labels from `lib/notifications.ts`.
- **Account menu.** The round button shows the person's initials on their stable soft tint and opens their name and email, Account, Families and Sign out (local sign-out, then the sign-in page).
- **Look and motion.** Menus and popovers share `ui/floating.ts`: a white panel with a soft border and shadow that scales from its trigger, with highlighted rows in the accent tint.
- **Checks.** `top-bar-check.mjs` verified each quick-create target for the current family and that reload does not reopen the dialog; keyboard use of the menu (Enter, arrow keys, Escape returning focus); the notifications preview, Mark all as read and the inbox link; the account menu and sign out; at 390 px a 57 px top bar with no sideways scrolling and menus kept on screen; and no Create menu for guests. `shell-check.mjs`, `phase2-check.mjs` and the S16 browser acceptance (13 checks) still pass.
- **Not included.** Workspace search needs a new API across tasks, events, goals and messages within each person's access, and remains a separate slice.

## 13. Phase 3 result — Channels and Messages (18 November 2026)

- **Workspace.** Channels, Messages and every conversation now share one bordered chat workspace that fills the window height on larger screens. On desktop it shows the conversation list (20 rem, with search, refresh, New and the active conversation marked), the conversation, and from 1280 px a Details pane. Below 1280 px a header button opens Details as a side panel (focus moves in; Escape, the close button or the backdrop return focus). The list pages show a "Choose a channel/conversation" state beside the list. On phones the list and the conversation remain separate pages with an "All channels/All direct messages" back link. All routes and query links are unchanged.
- **Conversation header.** Channel image or emoji, name, topic or member count, muted/archived state, and icon buttons with the same accessible names as before: Open conversation files, Refresh conversation, Mute/Unmute conversation, Edit channel, Archive/Restore channel, Conversation details.
- **Messages.** Your messages are dark bubbles on the right labelled "You"; others are soft grey bubbles on the left with the sender's initials avatar and a Guest marker where applicable. Replies quote the original inside the bubble; mentions are listed under the text. Reactions sit below as small pill buttons (pressed ones tinted lavender), then Reply and a "More actions" toggle that reveals Create task, Link event and Attach file for that message only. Linked work and attached files always stay visible. New messages fade in and existing ones ease into place (`motion`).
- **Composer.** A single rounded field with an inline Send button (Ctrl/⌘+Enter also sends), the reply banner, selected-file chips, Attach files and a Mention members pop-up, plus the character count.
- **Details pane.** Description, members with avatars and Guest/Manager badges, the folders link, the guest-access notice, channel image controls, Manage channel guests, in-conversation search and the live-update status.
- **Other screens.** Guest channels uses the title strip and a list of rows with emoji tiles and unread counts; the source message page has a breadcrumb back to its conversation, the author's avatar and the message in a bubble; Join a channel uses the 20 px title.
- **Checks.** `phase3-check.mjs` (7 checks) covered the list-to-workspace flow and panes at 1440 px, Ctrl+Enter sending into your bubble, a reaction, reply and cancel, the More actions toggle, the source-message breadcrumb, a DM in the same workspace, the side-panel details at 1024 px with focus return, and the phone layout at 390 px with back link, files button and composer and no sideways scrolling. The S16 browser acceptance was updated for the new header files button and More actions and passes (13 checks), as do the shell (4), Phase 2 (5) and top-bar (6) checks. A recapture of all 19 routes at four sizes found no horizontal scrolling or page errors.
- **Decision carried.** A family member opening Guest channels still sees guest-only navigation. Proposed for Phase 4: keep family navigation for people who are also family members, and use guest-only navigation only for accounts with no family membership.

## Landing page (18 November 2026)

**Direction.** The product owner asked for the public landing page to follow goppopi.com's style with FamSync's own content: warm stone canvas, very large tight headings, small uppercase labels, rounded white and tinted panels, numbered steps, small product cards and a + style FAQ.

**Assets.** One original image was generated with Meshy (`nano-banana-2`, 6 credits): a soft 3D illustration of a family around a giant calendar and checklist, with two original plush companions (`output/landing-assets/hero.png`). It is served as `public/landing/hero-900.webp` and `hero-1600.webp`, plus a crop for the closing panel (`family-right.webp`). Planned feature illustrations were not generated because the Meshy balance ran out (4 credits left); the feature sections use product cards instead and can take illustrations later.

**Page (`src/components/landing-page.tsx`, `/`).** Its own sticky header with section links, Sign in and Get started (Open Today when a session exists), and a phone menu. Sections: hero; What is FamSync (three numbered cards); How it works (three steps beside a Today card); Tasks and chores, Goals, Channels and messages, and Folders and files, each with a product card; a sage Privacy panel; FAQ; closing call to action; footer. Three cards are interactive and labelled "Nothing is saved": tick tasks, turn a message into a task, and switch an event's audience to see who can see it. Every claim matches built behaviour; there are no testimonials, user counts, pricing or unbuilt features.

**Motion.** `motion` handles the hero entrance, sections fading up as they scroll in, goal bars filling, the sliding audience pill, FAQ open and close, and the phone menu. `MotionConfig reducedMotion="user"` turns motion off for people who prefer reduced motion.

**Checks.** The web build exports all 30 pages statically. In headless Chrome at 1440×900, at 390×844 (touch) and with reduced motion, the page had no horizontal overflow and no page or console errors, and the three interactive cards worked.

## 14. Phase 4 result — remaining screens (18 November 2026)

- **Goals.** Title strip with New goal; four stat cards with soft tinted icons (staggered entrance); one filter panel with the status track (All/Active/Completed/Archived with counts) and the type and scope selects; cards in up to three columns. Each card has a category-tinted flag tile, type and priority badges (high rose, medium peach, low sky), Completed, progress text with a soft rounded bar in the category colour, and a divided footer with the target date (red when past) and the assignee's avatar or "Needs reassignment".
- **Goal page.** Breadcrumb title strip with type, priority, completed and archived badges and Edit/Archive actions; a progress panel with the large percentage and bar, manual and numeric controls, description, and the checklist (with a done count) and task linker; a Details panel with category, visibility, creator and assignee avatars and target date.
- **Account.** Title strip with the email and Sign out; Base UI tabs — Profile (profile form beside activity), Privacy, Notifications, Sign-in & security — that keep every panel mounted so unsaved edits survive switching, support arrow keys, and deep-link with `#privacy`, `#notifications` or `#security`.
- **Families and family page.** One scrolling list panel with initials avatars and Owner/Member badges (the test account has 68 families), the Create a family card, and a family page with a breadcrumb title strip, role and time zone, and Open calendar.
- **Notifications and Folders.** The inbox is a single list panel with tinted icons for unread items (message notices now get a chat icon) and Mark all as read in the title strip. Folders use the title strip, folder cards with peach (family) or lavender (conversation) tiles, empty states, and filter panels; the folder page has a header panel and two-column file cards.
- **Public and invitation screens.** Sign-in, sign-up and password recovery use a side-panel card: an original illustration (`public/illustrations/family-planning.svg` — calendar, checklist and goal shapes in the palette tints, generated for FamSync) beside the form on wide screens, the form alone on phones. Callback, reset-password, Join a family and Join a channel use matching 20 px-titled cards. The landing page keeps its hero at a calmer size with tinted feature icons.
- **Navigation decision.** On guest screens, an account that belongs to any family keeps the family sidebar and the New menu; accounts with no family membership see only Guest channels and Account.
- **Consistency.** Remaining section headings use 18 px; legacy green-tinted link and badge classes in these screens were replaced with neutral or soft-tint equivalents.
- **Checks.** `phase4-check.mjs` (6 checks): goal filters, cards and progress; goal breadcrumb, details and checklist progress round trip; Account tab deep link, click and arrow keys; Families to family page; notifications, folders and folder files; the sign-in illustration on wide screens only and the landing page. `shell-check.mjs` was updated for the navigation rule (a member keeps family navigation; a guest-only account sees two links) and passes (5), as do Phase 2 (5), Phase 3 (7) and top-bar (6). The S16 browser acceptance now posts a fresh message before attaching a file, because repeated runs had filled the fixture message's five-file limit, and passes (13). A recapture of all 19 routes at four sizes found no horizontal scrolling or page errors.
- **Environment note.** One S16 run failed to load families while the machine had about 0.24 GB of free memory; the API and database were healthy on recheck and later runs passed.

## 15. Phase 5 result — acceptance (18 November 2026)

### 15.1 Paired comparison

`output/visual-baseline/compare.mjs` places the reference (left) beside FamSync (right) at 1440, 1024, 768 and 390 px for seven pairs: Analytics/Today, Kanban/Tasks, Calendar/Calendar, Chat/Channel, Account settings/Account, Contacts/Families and Login/Sign in (28 images in `compare/`). Review order followed the plan: shell geometry, then type, spacing, colour, controls and content.

Changes made from the review:

- **Sidebar breakpoint.** The reference hides its sidebar below 1440 px. At 1024 px FamSync's persistent sidebar left the month grid cramped (event names cut to a few letters), so the persistent sidebar now starts at 1280 px; below that the menu button opens it as a drawer. The top bar, chat workspace and checks were unchanged by this.
- **Account.** The page now uses the full content width like the reference, with equal-width, icon-led tabs.
- **Chat.** Reactions nobody has used appear on hover or keyboard focus (and stay faintly visible on touch screens), so the message stream reads like the reference instead of repeating five emoji under every message. Reactions with counts always show.
- **Contrast.** Muted text was darkened from `#6f7177` to `#64666c` (see 15.2).

### 15.2 Accessibility

`contrast-check.mjs` checks every token pairing against WCAG 2.2 AA: body and muted text on panel, workspace, canvas and muted surfaces (muted text now 5.03–5.74:1), primary buttons (14.55:1), destructive text (5.21–5.44:1), the five tint pairs (5.78–6.52:1), and the focus ring against every surface (3.15–3.44:1, above the 3:1 minimum for focus indicators). Keyboard behaviour is covered by the browser checks: skip link, drawer and details-panel focus return, menus, tabs and dialogs. Pages respect reduced motion.

### 15.3 Regression run (final build)

| Check | Result |
|---|---|
| Web build and TypeScript | 30 static pages exported |
| API type check | Pass |
| API unit tests | 22 of 22 |
| Job integration tests | 3 of 3 |
| Database access suites | All 12 rollback-only suites, no errors |
| `shell-check.mjs` | 5 of 5 |
| `phase2-check.mjs` | 5 of 5 |
| `phase3-check.mjs` | 7 of 7 |
| `top-bar-check.mjs` | 6 of 6 |
| `phase4-check.mjs` | 6 of 6 (landing check now looks for the page's main heading, see 15.5) |
| S16 browser acceptance | 13 of 13 |
| S16 real WebSocket check | Pass |
| Recapture of 19 routes × 4 sizes | No horizontal scrolling, no page errors |

### 15.4 Intentional differences from the reference

- **Palette.** Warm stone neutrals, a muted sage primary, and soft pastel tints (product-owner decisions) instead of pure white and grey; tints carry status and category alongside words. The application-wide primary update is recorded in section 16.
- **No inert controls.** No search box, theme switch, language, cart or mail icons, promotional panel, or calendar Week/Day views until FamSync implements them. The top bar carries the family switcher, New, notifications and the account menu instead.
- **Breadcrumbs** appear on detail pages (task, event, goal, family, message) but not on top-level screens, which have no meaningful parent.
- **Chat list rows** show topic or member count rather than the last message and time, because the conversation list API does not return message previews.
- **Calendar events** are drawn per day rather than as bars spanning several days.
- **Imagery.** Original cartoonish 3D human avatars now represent people, with initials as the image fallback. The original FamSync illustration and generated 3D module icons provide the remaining imagery. See `human-avatars.md` and `3d-icons.md` for assets, prompts and verification.

### 15.5 Notes

- While Phase 5 ran, another tool replaced the landing page (`app/page.tsx` now renders a new `components/landing-page.tsx` with assets in `public/landing/`) and edited `folders-screen.tsx`, `file-controls.tsx` and `conversation-files.tsx`. Those edits are included in the final build and all checks above pass with them; the landing page itself was not reviewed against this plan.
- Hosted Storage, CORS, fonts and performance on real devices remain to verify once staging exists. Workspace search remains a separate slice.

## 16. Softer application-wide primary (18 November 2026)

The product owner requested a softer primary color across the entire application. The shared primary is now muted sage `#58725f`, with white foreground, a dedicated `#526c58` hover/open state, pale sage `#e9efe9` accent surfaces, and `#47604e` focus outlines. Existing primary-token consumers include creation/save/completion buttons, active navigation, selected task filters, unread badges, calendar's current-day marker, links, landing-page calls to action, and own-message bubbles.

Primary buttons and the New menu use the dedicated hover color instead of reducing background opacity. Own-message reply/mention text uses the full foreground color so small text retains contrast on the lighter primary. Native accent-color controls inherit the shared primary.

The existing contrast check was extended for hover and primary links across panel, workspace, canvas and accent surfaces. All checked pairs pass: white on primary 5.27:1, white on hover 5.76:1, and primary text on the lightest-to-darkest checked surfaces 5.27–4.51:1. This is a token-level check, not a whole-interface accessibility certification.

The production build passed TypeScript and exported all 30 pages statically. ChatGPT's browser confirmed matching primary backgrounds on New, active navigation, own-message bubbles and New task, plus the darker open-menu state. Screenshots: `output/soft-primary/conversation.jpg` and `output/soft-primary/tasks.jpg`. The layout repairs proposed in the follow-up UI audit remain separate work.

## 17. Light and dark mode (19 November 2026)

- **Choice.** People pick Light, Dark or System. The top bar has a theme button on wider screens (and on the landing and public screens); on phones the same choice sits in the account menu so the family picker keeps its room. Light is the default: with nothing saved, FamSync opens in light even on a device set to dark. System follows the device setting live. The choice is a per-device preference in `localStorage` (`famsync-theme` stores `dark` or `system`; Light clears it).
- **No flash.** A small script in the root layout sets `data-theme` on `<html>` before the first paint, so every static page opens in the right colours. Without JavaScript, pages show the light theme.
- **Dark palette.** Warm charcoal surfaces (canvas `#141413`, workspace `#191918`, panels `#201f1d`), soft off-white text `#ecebe6`, muted text `#a7a59d`, a lighter sage primary `#8fb59a` with dark text, and deeper versions of the five pastel tints with light text. Tailwind's `dark:` variant follows the same attribute.
- **Details.** Dialog and drawer backdrops use a black overlay instead of the text colour, which would have turned light at night. Large light illustrations (landing images and the sign-in illustration) are dimmed slightly in dark mode. Switching themes fades colours over 0.25 s unless reduced motion is preferred. The dark "Family Base" scene is unchanged in both themes.
- **Checks.** `contrast-themes.mjs` confirms every text, tint and focus-ring pairing meets WCAG 2.2 AA in both themes. `theme-check.mjs` (8 checks) covers light as the default on a dark device, choosing Dark, persistence with the theme applied before the body renders, System following the device and storing no override, keyboard use of the menu, dark screenshots of seven screens at 1440 and 390 px plus a dialog with no sideways scrolling, the landing and sign-in pages, and the phone account-menu switch. The shell, Phase 2–4, top-bar and S16 browser checks all still pass.

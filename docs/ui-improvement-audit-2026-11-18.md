# FamSync UI improvement audit

**Date:** 18 November 2026, Asia/Dhaka.  
**Result:** Keep the current visual direction, including the 3D icons and cartoon human avatars. Improve responsive layout and the order in which useful content appears before adding more decoration.

## Evidence and scope

Inspected the populated Carter Family workspace in **ChatGPT's in-app browser**. Desktop viewport: 1280 px. Narrow-screen checks used a real 390 px iframe; a separate 1024 px iframe checked the chat breakpoint. Screenshots are in `output/ui-audit-2026-11-18/`.

Viewed Today, Tasks, the New task dialog, Calendar, Goals, a direct conversation, Folders, a populated folder, Notifications and its preview, Family members, and mobile Account. Mobile views covered Today, Tasks, Calendar, Goals, chat and Account. Source inspection connected visible findings to the shared components. The New task dialog was cancelled without saving.

This is a UI/UX audit, not a repeat of permission, upload, delivery or database acceptance. Public/authentication flows, all detail screens, guest-only sessions, forced network failures, a complete keyboard/screen-reader pass, and a real device with its software keyboard were not re-audited. Existing acceptance results do not prove that these new populated layouts are free of visual defects.

## Prioritized findings

### UI-01 — P1: Recurrence badges overflow task cards

**Observed.** On desktop, long recurrence text crosses card boundaries. The document measured **1274 px wide against a 1265 px content viewport**. At 390 px, the task page body measured **395 px scroll width against 375 px client width**. A label such as “Repeats weekly through Tuesday, February 16, 2027” is longer than its card.

**Improve.** Show a compact label such as “Weekly” in the card, with the full rule available in task details or an accessible disclosure. Bound the label to the card and allow necessary wrapping. Do not hide document overflow to conceal the defect.

**Source.** `apps/web/src/components/task-card.tsx`, `ui/badge.tsx`. The shared badge uses fixed height, `shrink-0` and `whitespace-nowrap` while the task inserts the full recurrence sentence.

**Accept when.** Cards and pages stay within their containers at 390, 768, 1024, 1280 and 1440 px, including long recurrence rules and long titles. Full recurrence information remains accessible.

**Evidence:** `tasks-desktop.jpg`, `tasks-mobile.jpg`.

### UI-02 — P1: Chat becomes narrower when the viewport gets wider

**Observed.** At 1280 px, opening the global sidebar and three conversation columns leaves the central article **357 px wide**, with about **302 px for its message list**. At 1024 px, the collapsed global navigation and closed Details pane leave a **686 px** article. The narrower screen provides almost twice the conversation space. The Details pane has considerable empty space while messages and linked work wrap.

**Improve.** Make a minimum useful conversation width determine when Details becomes persistent. Keep Details in a drawer at the current 1280 breakpoint, and allow the conversation list to collapse when needed. Start by targeting approximately 520 px for the central pane where the viewport permits; validate with actual long messages and attachments before fixing the breakpoint.

**Source.** `channel-screen.tsx`: the global sidebar and `xl` three-column layout compete for width; list and Details tracks use fixed 18 rem and 19 rem widths.

**Accept when.** Crossing a breakpoint does not sharply reduce the central pane. Test 1024, 1279, 1280, 1440 and 1600 px, headers with long names, attachment cards, and opening/closing Details with keyboard focus return.

**Evidence:** `chat-desktop.jpg`, `chat-1024.jpg`, `chat-mobile.jpg`.

### UI-03 — P2: Mobile screens put too much administration before useful content

**Observed.** On mobile Today, the schedule begins at **557 px**, Tasks at **1330 px**, and Goals at **1743 px** from the document top. Four large metric cards precede the work. Tasks spends several rows on scope, view and status controls; Goals adds four metrics and another large filter panel before the first goal.

**Improve.** Use a compact mobile summary, surface overdue/due-today work early, and cap upcoming events with a “See all” link. Collapse secondary filters behind a button showing the active filter count. Prefer a useful list presentation on phones while respecting a saved explicit view choice.

**Accept when.** A person can see and open an actual due item in the first 844 px screen on the populated fixture. Filter state remains visible and keyboard accessible; metrics and counts still agree with the selected scope.

**Evidence:** `today-mobile.jpg`, `tasks-mobile.jpg`, `goals-mobile.jpg`.

### UI-04 — P2: Dashboard counts stop short of being useful shortcuts

**Observed.** Today shows an overdue count and active-task count, but the summary cards are static containers. A person must separately find Tasks and apply the matching filter.

**Improve.** Make actionable metrics link to the corresponding view with family, scope and status preserved. Give each link a specific accessible name, such as “View 1 overdue task.” A purely informational metric can remain noninteractive.

**Source.** `today-screen.tsx`, `SummaryCard`.

**Accept when.** Pointer and keyboard activation open the correct filtered destination, including zero-count states, without changing task or goal data.

**Evidence:** `today-desktop.jpg` and the component source.

### UI-05 — P2: Mobile Account navigation hides a section

**Observed.** The Account tab strip has a **328 px client width and 400 px scroll width**. “Sign-in & security” is partially hidden. Tabs are 28 px high, and the horizontal scrollbar competes with their labels.

**Improve.** Use a labelled section selector or an explicit compact mobile navigation pattern that exposes all four sections. Preserve desktop tabs, deep links, keyboard interaction and unsaved edits when switching sections. Increase touch comfort without relying on a clipped horizontal strip.

**Source.** `account-screen.tsx`, its tab labels and `tabClass`.

**Evidence:** `account-mobile.jpg`.

### UI-06 — P2: Task creation asks for too much at once

**Observed.** The dialog presents a suggestion selector before the title, then description, repeat, due date/time, event linking, audience and member controls. At 720 px desktop height, Save and Cancel are outside the initial visible area. The form starts with an optional choice instead of the primary input.

**Improve.** Put title first, then assignee, date and a concise audience summary. Group repeat, notes, reminders and event linking into clearly labelled optional sections. Keep an accessible action footer visible while the form scrolls. Always expose the sharing choice before saving, including selected recipients.

**Accept when.** A simple task can be entered and saved without navigating optional sections; all existing advanced options remain available. Test validation, selected audiences and preservation of input after failure.

**Evidence:** `new-task-dialog.jpg`.

### UI-07 — P2: DM notifications are indistinguishable

**Observed.** Two inbox rows both read “New message: Direct conversation” with the same secondary description and family name. The preview repeats the same generic rows. Neither identifies the other participant or displays a time.

**Improve.** Add currently authorized conversation/person context and relative time, group related alerts where appropriate, and keep unread/all navigation clear. Show a neutral fallback when source access has ended. Apply the same labels in the preview and full inbox.

**Dependency.** Inspect the current notification contract before implementation. Missing identity/context fields belong in an access-checked NestJS response, not inferred client-side from an old notification snapshot.

**Evidence:** `notifications-desktop.jpg`, `notifications-preview.jpg`.

### UI-08 — P2: People need control over their cartoon avatar

**Observed.** Emily and Michael share the same character; Jake and Lily also share a character. Six images are selected by a hash of the account ID. The style is consistent, but the face is arbitrary and is not a unique identity. DM list rows still use a generic speech-bubble identity while the open header shows a person.

**Improve.** Offer the existing characters as selectable defaults in Profile and save a stable avatar ID. Keep names visible and use the saved choice consistently across member lists, messages, assignments and DM rows. Supply authorized peer identity in the conversation list contract if necessary. Retain the cartoon 3D direction and loading/error fallback.

**Dependency.** Persist avatar choice through NestJS and the profile schema; maintain existing guest/directory restrictions. Do not infer a person's appearance from their name.

**Evidence:** `family-desktop.jpg`, `chat-desktop.jpg`; `ui/avatar.tsx`.

### UI-09 — P2: The file page gives upload controls priority over saved files

**Observed.** On a populated folder, the first file cards begin near the bottom of the 720 px desktop screen after the heading, connection status, full upload panel, search/sort panel and archive control. Metadata uses technical MIME strings such as `text/plain`. File cards lack a quick visual type cue.

**Improve.** Put the saved-file library first, with a clear Upload action opening a compact upload panel. Use readable type labels, restrained file-type icons, and a consistent row or card layout with Preview/Download primary and archive secondary. Show an access summary prominently, while placing signed-link implementation details in contextual help. Image thumbnails must use the existing authorized preview grants.

**Accept when.** Saved files are visible immediately on populated folders; upload progress/retry still works; permissions and unavailable-file states remain correct. Bulk upload and nested folders remain separate product decisions.

**Evidence:** `folders-desktop.jpg`, `folder-files-desktop.jpg`.

### UI-10 — P2: The mobile calendar starts with past events

**Observed.** The mobile calendar sensibly defaults to Agenda, but on 18 November the initial list starts at 6 November. Today's entries require scrolling past earlier events. Desktop month cells truncate longer titles.

**Improve.** Initially position the current month's agenda at today, with an easy way to reveal earlier events. Make Today visibly return to the current date's agenda section. Provide an accessible full-title/details disclosure for truncated month entries, including event time when available.

**Accept when.** Initial navigation, a past/future month, Today, all-day events and the family time zone produce the expected focus/date position. Preserve explicit date links.

**Evidence:** `calendar-mobile.jpg`, `calendar-desktop.jpg`.

### UI-11 — P3: Icon scale and emphasis need a consistent rule

**Observed.** Navigation uses clear 3D module icons, but Goals metrics retain flat symbols, utility actions mix line icons and 3D illustrations, and small file/event references squeeze detailed artwork into roughly 14–16 px. Global notifications and conversation mute both use a large bell image with different effects.

**Improve.** Define sizes and roles: prominent 3D artwork for navigation, module summaries and empty states; consistent simple utility symbols for actions; cartoon avatars for people. Standardize button image sizing and add visible or accessible tooltips where actions are icon-only. Preserve the requested 3D visual language without giving every utility equal decorative emphasis.

**Evidence:** `goals-desktop.jpg`, `chat-desktop.jpg`, `folder-files-desktop.jpg`; shared icon/button components.

### UI-12 — P2: Membership administration dominates the member directory

**Observed.** Every eligible member row prominently repeats Transfer ownership and Remove. These consequential, uncommon operations receive more visual space than the person's role and identity.

**Improve.** Put owner actions in a clearly labelled per-member menu, retain the existing confirmation dialogs, and separate normal member information from administration. Keep the current role/permission rules and make every action's target person explicit.

**Evidence:** `family-desktop.jpg`.

### UI-13 — P3: Reduce repeated and technical copy

**Observed.** Folder cards show “1 files”; folder screens describe “audiences” and inheritance; a family folder displays “Updates will connect when a conversation opens.” Goal cards repeat type/audience/completion information while equal card heights leave large empty areas.

**Improve.** Fix pluralization, use plain sharing language, and show connection status when it requires attention. Give goal cards one clear status/progress line, with secondary metadata grouped consistently. Reuse shared copy formatters so cards, detail pages and alerts agree.

**Evidence:** `folders-desktop.jpg`, `folder-files-desktop.jpg`, `goals-desktop.jpg`.

## What to preserve

- The warm neutral palette, clear dark active navigation, rounded panels, and requested 3D artwork.
- Consistent person IDs across the shared avatar component, while adding explicit selection later.
- Visible privacy labels, reversible archive, named controls, and explicit guest restrictions.
- Mobile Calendar's agenda presentation and the existing separation between history and composer.
- Static Next.js output and all application server behavior in NestJS.

## Proposed execution slices

These are recommendations for subsequent execution; this audit does not implement them. Plan and validate each slice before executing it.

| Slice | Scope | Completion evidence |
|---|---|---|
| UI-A: Responsive repairs | UI-01, UI-02, UI-05: recurrence containment, chat width rules, mobile Account navigation. | Populated screenshots at 390/768/1024/1280/1440/1600 px; no unintended document scrolling; keyboard/focus and tab-draft retention checks; static build. |
| UI-B: Everyday work first | UI-03, UI-04, UI-06, UI-10: mobile density, actionable counts, simpler task creation, current-day agenda. | Due work visible in the initial phone screen, correct filtered links/counts, basic and advanced task save/error cases, time-zone/date navigation checks. |
| UI-C: Person and alert context | UI-07, UI-08: avatar selection, authorized DM peer identity and notification context. | NestJS/schema/client updates where required; identity consistency; cross-account and revoked-source isolation; saved avatar survives reload; notification source links still work. |
| UI-D: Files and consistency | UI-09, UI-11, UI-12, UI-13: library hierarchy, icon sizing, administration menus, copy/card polish. | File upload/preview/download/archive regression, owner/member controls, long filenames, keyboard/touch review, consistent screenshots and static build. |

## Audit artifacts

The screenshot directory contains the named evidence above, including both chat widths and mobile layouts. The temporary same-origin iframe harness was used only for viewport inspection; it does not change application source. No feature implementation or styling was changed during this audit, and builds/tests were not rerun merely to report UI findings.

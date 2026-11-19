# Document 01 — Product Overview

**Status:** Evidence-based overview from one authenticated Parent session, supplemented with synthetic saved-state workflows.  
**Inspection date:** 2026-11-17.  
**Primary source:** FamSync browser UI at `https://famsync.org/dashboard`; see [initial reconnaissance and evidence register](01-initial-reconnaissance.md).

## Executive summary

FamSync is an authenticated family workspace for coordinating events, tasks, goals, member access, channel conversations, and shared folders. The product visibly combines a family dashboard with calendar, task, and goal tracking, then adds communication and file organization through channels, direct messages, and folders. These purpose statements are based on interface labels; the underlying business model and backend are not accessible from the browser session.

## Product purpose and value proposition

**Confirmed:** The dashboard summarizes today's events, active tasks, overdue tasks, and active goals. The navigation provides Calendar, Tasks, Goals, Channels, Folders, and Settings. Profile Settings describes family visibility controls for events, tasks, and goals. Family Storage is described as organizing and sharing files across channels.

**Inferred:** FamSync is intended to help family members coordinate household schedules and responsibilities, track shared and individual goals, communicate, and organize files in a family context. A definitive value proposition has not been observed in public marketing content because the root URL redirected to the signed-in dashboard.

## Intended users

Roles exposed by the interface include:

- A family member labeled **Parent**, described in the Add Family Member form as **Full access**.
- A **Child**, described as **Limited access**.
- An invitation role of **Member** (the default) or **Admin**; helper text says Admins can invite people and manage Settings.
- **Guests**, described as people who can only see channels they were invited to.
- The same signed-in account is shown as **Owner** on the Settings member list and **Parent** in Profile Settings. These labels may be separate role concepts; mapping is unresolved.

The Parent session later added a synthetic Child (Limited access) profile and used it in shared records, a channel, and a direct-message conversation. No authenticated Child session or other role's experience was available, so access enforcement has not been verified.

## Business problems addressed

The UI indicates support for these family coordination needs:

1. Seeing today's family events, tasks, and goals in one dashboard.
2. Creating and assigning tasks with due dates and status views.
3. Scheduling one-time or recurring events.
4. Tracking individual and family goals, including subtasks.
5. Sharing channel conversations and starting direct messages between family members.
6. Organizing channel and standalone folders and attaching files to supported forms.
7. Managing family members, guests, invitations, and privacy settings.

Saved Parent-side creation and selected state changes are now confirmed for tasks, events, goals, channels, direct messages, folders/files, and a synthetic family member. Recipient-side delivery, invitation acceptance, cross-account sharing, and backend behavior remain unverified; see [Pass 3 results](10-functional-execution-results.md).

## Major functional modules

| Module | Observed purpose and scope | Evidence |
|---|---|---|
| Dashboard | Family summary and shortcuts to Calendar, Tasks, and Goals | E-001, E-018 |
| Tasks | Task title selection/free entry, assignment, due date, privacy, status filters, Board/List views | E-002, E-020, E-021 |
| Calendar | Month browsing and event creation with One Time, Daily, Weekly, and Monthly modes | E-003, E-016, E-019 |
| Goals | Goal categories/priorities, family or individual type, target date, assignment, subtasks, progress summaries | E-004, E-017, E-022 |
| Channels | Active channels, direct messages, channel creation, guest invitation fields | E-005, E-011, E-012 |
| Folders | Family Storage, channel folders, standalone folder navigation, folder creation | E-006, E-013 |
| Family Settings | Members, pending invitations, guests, family name, guest rule, Member/Admin invite roles | E-007, E-008 |
| Profile Settings | Personal details, activity counts, privacy audience controls, family member creation | E-014, E-015 |
| Private Mode | Sidebar control described as setting newly created events, tasks, and goals to private | E-010 |

## Key user journeys

- Review family status on Dashboard and open the full Calendar, Tasks, or Goals module through View All.
- Create, edit, and transition tasks; a second task was shared with the synthetic Child profile.
- Save one-time and recurring events; add location and note, select an attachment, assign the Child, and inspect calendar details. Recurrence rendering remains unresolved.
- Create Family and Individual goals, assign a Child goal, add subtasks, and complete a goal through subtask state.
- Create a channel, add the Child profile, post and reply to messages, and react to a message. Guest invitation/acceptance remains unverified.
- Start a direct-message conversation with the Child profile and send a synthetic message; recipient-side delivery remains unverified.
- Create a standalone folder, upload a synthetic file, and use file filtering, search, and sorting; add a synthetic Child profile.

Detailed workflows and their blockers are in [user journeys and workflows](06-user-journeys.md).

## Product boundaries and known limitations

- The application address remained `/dashboard` while in-app screens changed; individual routes are not verified.
- The root URL redirected to the authenticated dashboard in the current session. Public pages, registration, sign-in, recovery, and onboarding were not accessible without ending the user's session.
- Synthetic QA records now populate the event, task, goal, channel, direct-message, and folder modules. No real invitations or guest access were tested.
- A synthetic Child profile is visible and selectable, but only the Parent account was authenticated. Cross-member permission enforcement and recipient-side messaging remain unverified.
- No payment, subscription, calendar-provider, analytics, notification vendor, or external API integration was visible. Their absence from the inspected screens does not prove they do not exist.
- Browser inspection establishes observable UI behavior only; it does not establish database tables, backend workflows, technology stack, or security enforcement.

## Known questions

See the stakeholder clarification list in [rebuild scope and gap analysis](09-rebuild-scope-gap-analysis.md). High-priority questions include role mapping, privacy precedence, folder types, recurrence generation, invitation delivery, and access behavior for children and guests.

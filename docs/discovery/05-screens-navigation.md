# Document 04 — Screens and Navigation Specification

## Route model

Every authenticated screen inspected kept the browser URL `https://famsync.org/dashboard`; the browser document title and visible content changed between Dashboard, Tasks, Calendar, Goals, Channels, Folder, Settings, and Profile. No distinct module route was observed. Opening `https://famsync.org/` in a separate tab redirected to `/dashboard` under the existing authenticated session (E-023). Deep links, unauthenticated routing, and browser back/forward behavior are unverified.

## Discovered sitemap

```text
Authenticated FamSync workspace (/dashboard)
├── Dashboard
│   ├── Summary cards
│   ├── Today's Schedule ── View All → Calendar
│   ├── Quick Tasks ────── View All → Tasks
│   └── Goal Progress ──── View All → Goals
├── Tasks
│   ├── All Tasks / Overdue / To Do / In Progress / Completed
│   ├── Board / List
│   └── Add Task → draft form
├── Calendar
│   ├── Month grid / previous / next / Today
│   └── Add Event → One Time / Daily / Weekly / Monthly form states
├── Goals
│   ├── All Pending Goals / Individual / Family / Completed Goal
│   └── Create Goal → Family Goal / Individual Goal form states
├── Channels
│   ├── Search Channels
│   ├── Active Channels → Create New Channel
│   └── Direct Messages → recipient assignment dialog
├── Folders (expandable sidebar control)
│   ├── Family Storage → Channel Folders / Add Folder
│   ├── Sidebar: Channel Folders
│   └── Sidebar: Standalone Folders
├── Settings
│   ├── Members → Invite person
│   ├── Pending invites
│   ├── Guests
│   └── Family settings → family name / Allow guests in channels
├── Private Mode switch
└── Profile Settings (sidebar gear)
    ├── Profile Information / activity counts
    ├── Change Password / Change Email / Sign Out
    ├── My Privacy → Calendar / Tasks / Goals audiences
    └── Family Information → Add Family Member
```

## Screen inventory

| Screen ID | Screen / state | URL | Purpose / components | Related features | Evidence / status |
|---|---|---|---|---|---|
| SCR-01 | Dashboard | `/dashboard` | Welcome header; four summary cards; Today's Schedule, Quick Tasks, Goal Progress; Add Event and View All links | FEAT-001–004, FEAT-027 | E-001, E-018 · Partially verified |
| SCR-02 | Tasks — Board | `/dashboard` | All Tasks, Overdue, To Do, In Progress, Completed filters; Board/List; empty status columns | FEAT-005 | E-002 · Partially verified |
| SCR-03 | Tasks — List | `/dashboard` | Same filters; List selected; “No Task Found” empty state | FEAT-005 | E-002 · Partially verified |
| SCR-04 | Add New Task dialog | `/dashboard` | Task title/type chooser; description; due date/time; required member assignment; Private checkbox; Save | FEAT-006, FEAT-029, FEAT-030 | Save, edit, status transition, and Child assignment tested · E-025, E-026; validation and Child access unverified |
| SCR-05 | Family Calendar month view | `/dashboard` | Month/year; previous/next; Today; weekday headings; month grid; Add Event | FEAT-007, FEAT-028 | E-003, E-019 · Partially verified |
| SCR-06 | Add Event — One Time | `/dashboard` | Required title; One Time; Event Date/time; note, attachments, location, assignee, Private checkbox, Save | FEAT-008, FEAT-025 | Saves and populated detail list tested; Child assignment, location, and attachment selection · E-027, E-029; post-save note/attachment persistence unverified |
| SCR-07 | Add Event — Daily | `/dashboard` | Daily recurrence; Start Date/time and End Date/time | FEAT-025 | Saved; only start date rendered in observed calendar · E-028; recurrence behavior unresolved |
| SCR-08 | Add Event — Weekly | `/dashboard` | Weekly recurrence; Select Day (Monday–Sunday) and End Date/time | FEAT-025 | Saved with Monday selected; appeared on Nov 17 (Tuesday) · E-028; possible defect |
| SCR-09 | Add Event — Monthly | `/dashboard` | Monthly recurrence; Select Date/time and End Date/time | FEAT-025 | Saved; only start date rendered in observed calendar · E-028; recurrence behavior unresolved |
| SCR-10 | Goals | `/dashboard` | Metrics; All Pending, Individual, Family, Completed Goal filters; populated states | FEAT-009 | Populated counts/progress tested · E-030–E-032; zero-subtask calculation unresolved |
| SCR-11 | Create New Goal — Family | `/dashboard` | Title, description, category, priority, Family Goal, target date, subtask, Private, Save; no member assignment shown | FEAT-010, FEAT-026 | Saved; completing the subtask moved goal to Completed and 100% · E-030 |
| SCR-12 | Create New Goal — Individual | `/dashboard` | Same base form; required family-member assignment is shown | FEAT-026 | Parent- and Child-assigned goals saved; Child-side access unverified · E-031, E-032 |
| SCR-13 | Channels | `/dashboard` | Search; Active Channels; Direct Messages; populated channel and DM; plus controls | FEAT-011, FEAT-033, FEAT-034 | Message, reply, like, and DM send tested · E-033–E-035 |
| SCR-14 | Create New Channel dialog | `/dashboard` | Required name; emoji; optional image upload; topic; description; invite people; Save | FEAT-018 | Channel saved and Child member added · E-033; guest invitation unverified |
| SCR-15 | Direct Messages dialog | `/dashboard` | Required Assign to Family Members; synthetic Child recipient available | FEAT-019, FEAT-034 | Conversation and message saved · E-035; recipient-side delivery unverified |
| SCR-16 | Family Storage | `/dashboard` | Description about organizing/sharing across channels; folders and file list; Add Folder | FEAT-012, FEAT-020, FEAT-035 | Folder/file and list operations tested · E-036 |
| SCR-17 | Expanded Folders navigation | `/dashboard` | Sidebar displays Channel Folders and Standalone Folders; saved channel/folder links appear in the sections | FEAT-020 | Section/type relationship and navigation model remain partly unverified · E-013, E-036 |
| SCR-18 | Add Folder dialog | `/dashboard` | Required folder title; emoji picker; description; Save | FEAT-020, FEAT-035 | Folder save and file upload confirmed · E-036 |
| SCR-19 | Settings | `/dashboard` | Members; Pending invites; Guests; family name field/save; Allow guests in channels | FEAT-013, FEAT-015 | E-007 · Current account only |
| SCR-20 | Invite person dialog | `/dashboard` | First name, email, optional phone, Member/Admin role, Send invite | FEAT-014 | E-008 · Submission blocked for safety |
| SCR-21 | Profile Settings | `/dashboard` | Profile fields, activity counts, quick actions, privacy audiences, family information | FEAT-017, FEAT-021, FEAT-022, FEAT-024 | E-014 · Partially verified |
| SCR-22 | Add Family Member dialog | `/dashboard` | Photo, required names/email, Parent/Child role descriptions, optional age/birthday/phone/color, Save | FEAT-023 | Synthetic Child profile saved and listed · E-037; account activation/access unverified |
| SCR-23 | Public root under current session | `/` → `/dashboard` | Root entry immediately resolves to authenticated dashboard | MOD-10 | E-023 · Public access blocked by current session |

## Navigation and interaction details

- Sidebar items observed: Dashboard, Tasks, Calendar, Goals, Channels, Folders, Settings, Private Mode. The profile/gear affordance opens Profile Settings.
- Dashboard View All outcomes were directly traced: Schedule → Calendar; Quick Tasks → Tasks; Goal Progress → Goals.
- Folders has an expand button. Expanding it adds Channel Folders and Standalone Folders empty sections in the sidebar. Clicking the section text did not navigate.
- The header icon/button near the FamSync label was clicked and produced no observable state change (E-024). Its purpose is unknown.
- The Private Mode switch was not operated because the scope calls for discovery without changing account preferences.
- All application screens retained `/dashboard`. Modal dialogs did not change the address bar.
- A synthetic dataset enabled task/goal cards, event details, channel/DM transcripts, and folder file operations. Task/goal edit/delete, populated task List mode, channel search results, and recipient-side access remain unverified; see [Pass 3 results](10-functional-execution-results.md).

## Visual evidence

Screenshots were inspected in the browser during exploration but are not archived as files. The evidence register links each observation to its screen, URL, and interaction. This documentation does not claim a screenshot exists where none has been saved.

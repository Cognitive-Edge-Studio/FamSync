# FamSync Initial Reconnaissance

**Status:** Initial and second-pass inventories completed; saved-state execution was later added in [Pass 3 results](10-functional-execution-results.md). Current coverage remains partial where role enforcement, edge cases, or backend behavior are unknown.  
**Inspection date:** 2026-11-17 (browser client date)  
**Evidence source:** Authenticated FamSync browser session at `https://famsync.org/dashboard`.

## Scope and method

This document preserves the initial empty-state baseline and first two UI passes. A later user-authorized pass created synthetic QA data and exercised saved workflows; those results supersede the initial “not saved” statements where explicitly referenced in [Pass 3 results](10-functional-execution-results.md). Personal contact details and family name are intentionally omitted.

The application changes its visible screen title/content as navigation items are selected, while the address bar remains `/dashboard`. Screen names below therefore refer to observed in-app views; direct routes for individual modules have not been verified.

### Evidence confidence

- **Confirmed:** Directly visible in the authenticated browser session or opened without saving data.
- **Inferred:** Reasonably indicated by labels or UI structure but not validated through a completed workflow.
- **Unverified:** Not yet investigated, unavailable in the current account, or requires another role or a safe test record.

## Initial sitemap

```text
FamSync (authenticated family workspace) — observed URL: /dashboard
├── Dashboard
│   ├── Summary cards: today's events, active tasks, overdue tasks, active goals
│   ├── Today's Schedule → View All / Add Event
│   ├── Quick Tasks → View All
│   └── Goal Progress → View All
├── Tasks
│   ├── Status filters: All Tasks, Overdue, To Do, In Progress, Completed
│   ├── Views: Board, List
│   └── Add Task
├── Calendar
│   ├── Month view with previous/next and Today controls
│   └── Add Event
├── Goals
│   ├── All Pending Goals, Individual, Family, Completed Goal
│   └── Create Goal
├── Channels
│   ├── Channel search
│   ├── Active Channels
│   └── Direct Messages
├── Folders (navigation item appears expandable)
│   └── Family Storage / Channel Folders → Add Folder
├── Settings
│   ├── Members → Invite person
│   ├── Pending invites
│   ├── Guests
│   └── Family settings (family name; allow guests in channels)
├── Private Mode (sidebar switch; described as affecting newly created events, tasks, and goals)
└── Profile Settings
    ├── Profile information, activity counts, and personal privacy choices
    ├── Quick actions: Change Password, Change Email, Sign Out
    └── Family Information → Add Family Member
```

The Folders expand control reveals Channel Folders and Standalone Folders sections in the sidebar; both are empty in this account. The displayed labels may be static section headings because clicking them did not navigate. Direct routes for modules remain unverified.

## Initial module inventory

| Module ID | Module | Screens observed | Key features seen in first pass | Exploration status |
|---|---|---|---|---|
| MOD-01 | Dashboard | Dashboard | Summary counts; schedule, quick-task, and goal-progress panels; Add Event; View All links | Partially Verified |
| MOD-02 | Tasks | All Tasks; Board; List; Add Task dialog | Status filters; Board/List switch; empty status columns; suggested and custom task title | Partially Verified |
| MOD-03 | Calendar | Family Calendar; One Time/Daily/Weekly/Monthly event form states | Month calendar; previous/next month; Today; conditional Add Event form | Partially Verified |
| MOD-04 | Goals | Goals; Family/Individual Create Goal form states | Summary counts; filters; conditional assignment; draft subtask | Partially Verified |
| MOD-05 | Channels | Channels; Create New Channel; Direct Messages setup | Search field; Active Channels; Direct Messages; create-channel form; new-DM form | Partially Verified |
| MOD-06 | Folders | Family Storage; expanded navigation; Add Folder form | Channel Folders; sidebar lists Channel Folders and Standalone Folders; add-folder form | Partially Verified |
| MOD-07 | Family Settings | Settings; Invite person dialog | Members; pending invites; guests; family name; allow-guests setting; invite options | Partially Verified |
| MOD-08 | Private Mode | Sidebar control | Helper text and enabled display state observed; switch not changed | Partially Verified |
| MOD-09 | Profile / account | Profile Settings; Add Family Member form | Profile fields, activity counts, privacy controls, quick actions, family-member form | Partially Verified |
| MOD-10 | Public/authentication/onboarding | Root entry point | Root URL redirected to authenticated Dashboard in the current session; sign-in and onboarding screens not observed | Blocked by current authenticated session |

## Initial feature inventory

| Feature ID | Module | Feature | Initial observation | Actor | Verification status |
|---|---|---|---|---|---|
| FEAT-001 | Dashboard | Family overview | Four summary cards show today's events, active tasks, overdue tasks, and active goals. Current account shows zero for each. | Signed-in family member | Confirmed (display only) |
| FEAT-002 | Dashboard | Today's schedule | Schedule panel has a View All link and Add Event action; current state is empty. | Signed-in family member | Confirmed (display only) |
| FEAT-003 | Dashboard | Quick tasks | Dashboard panel has View All and an empty due-today state. | Signed-in family member | Confirmed (display only) |
| FEAT-004 | Dashboard | Goal progress | Dashboard panel has View All. Current account has no displayed goals. | Signed-in family member | Confirmed (display only) |
| FEAT-005 | Tasks | Task status overview | All Tasks, Overdue, To Do, In Progress, and Completed filters are shown; Board/List view controls are present. | Signed-in family member | Confirmed (display only) |
| FEAT-006 | Tasks | Add task | Opened form contains task title/type selection, description, due date/time, required family-member assignment, and a “Private (only me)” checkbox. No task was saved. | Signed-in family member | Confirmed (form fields); validation and save behavior unverified |
| FEAT-007 | Calendar | Browse calendar | Month view displays a grid with month navigation and Today. | Signed-in family member | Confirmed (display only) |
| FEAT-008 | Calendar | Add event | Opened form contains required title, event type buttons (One Time, Daily, Weekly, Monthly), date/time, note, attachment drop zone, location, required family-member assignment, and “Private (only me)”. No event was saved or file uploaded. | Signed-in family member | Confirmed (form fields); recurrence, validation, and save behavior unverified |
| FEAT-009 | Goals | Browse goals | Summary metrics and All Pending Goals, Individual, Family, and Completed Goal filters are visible. | Signed-in family member | Confirmed (display only) |
| FEAT-010 | Goals | Create goal | Opened form contains required title, description, category, priority, family/individual type, target date, subtask entry, and “Private (only me)”. No goal was saved. | Signed-in family member | Confirmed (form fields); validation and save behavior unverified |
| FEAT-011 | Channels | Browse channels and direct messages | Active Channels and Direct Messages sections are shown with empty states; a search field and unlabeled actions are present. | Signed-in family member | Confirmed (display only) |
| FEAT-012 | Folders | Browse channel folders | Family Storage screen describes organizing/sharing files across channels; Channel Folders is empty. Add Folder is visible. | Signed-in family member | Confirmed (display only) |
| FEAT-013 | Family Settings | View members, invites, and guests | Settings describes members, pending invites, and guests; current view has one Owner, no pending invites, and no guests. | Family member with settings access | Confirmed (current account only) |
| FEAT-014 | Family Settings | Invite a person | Opened form has first name, email, optional phone (“text invites, coming soon”), role (Member default; Admin option), and Send invite. Admins are described as able to invite people and manage Settings. No invite was sent. | Current settings-capable member | Confirmed (form/options); invite delivery and other-role access unverified |
| FEAT-015 | Family Settings | Family invite rules | Family settings include family name and an “Allow guests in channels” switch; helper text says invited non-family people join only that channel when on. The switch appeared on; no setting was changed. | Current settings-capable member | Confirmed (labels/helper text/current display); enforcement unverified |
| FEAT-016 | Private Mode | Toggle private-by-default creation | Sidebar helper says new events, tasks, and goals are saved as private when on. The switch appeared on; no setting was changed. | Signed-in family member | Confirmed (helper text/current display); persistence and visibility rules unverified |
| FEAT-017 | Profile / account | Open profile settings | The sidebar gear opens Profile Settings, which shows the current member role label “Parent.” | Signed-in user | Confirmed navigation and label · E-009, E-014 |
| FEAT-018 | Channels | Create channel | Form contains required channel name, emoji picker, optional channel image upload, topic, description, and invite-people field. Helper text says family members are added immediately and other invitees receive an email to join as guests. No channel or invitation was created. | Signed-in family member | Confirmed (form/copy); save and access rules unverified |
| FEAT-019 | Channels | Start direct message | Direct Messages action opens a form showing required family-member assignment. The current family has no other visible member to select; no conversation or message was created. | Signed-in family member | Confirmed (form presence); blocked by empty family membership |
| FEAT-020 | Folders | Browse folder types and add folder | Expanded Folders navigation shows Channel Folders and Standalone Folders sections, both empty. Add Folder form contains required title, emoji picker, description, and Save. No folder was created. | Signed-in family member | Confirmed (display/form); folder type and save behavior unverified |
| FEAT-021 | Profile / account | Edit personal profile | Profile screen exposes required first/last name, optional phone and bio, avatar/photo controls, and Save Changes. Activity counters show events created, tasks completed, and goals achieved. No profile data was changed. | Signed-in user | Confirmed (display/form); validation and save behavior unverified |
| FEAT-022 | Profile / account | Set personal data visibility | Calendar/events, tasks, and goals each show three access choices: Everyone in my family, Only people I choose, Only me. Screenshot shows Everyone in my family selected for each. Help text says items marked Private are only visible to the owner. No setting was changed. | Signed-in user | Confirmed (copy/current visible state); enforcement unverified |
| FEAT-023 | Profile / account | Add family member | Form has optional photo; required first name, last name, email; Parent (Full access) and Child (Limited access) role options; optional age, birthday, phone, and profile color; Save. No member was created or invited. | Signed-in user | Confirmed (form/options); invitation and permissions unverified |
| FEAT-024 | Profile / account | Account quick actions | Change Password, Change Email, and Sign Out controls are visible. None was activated. | Signed-in user | Confirmed (control presence); workflows unverified |
| FEAT-025 | Calendar | Select event recurrence | One Time shows Event Date; Daily shows Start Date and End Date; Weekly shows Select Day plus End Date; Monthly shows Select Date plus End Date. Weekday choices are Monday through Sunday. Form changes were inspected without saving. | Signed-in family member | Confirmed (conditional form fields); recurrence generation and boundaries unverified |
| FEAT-026 | Goals | Assign individual goal | Selecting Individual Goal reveals required family-member assignment; selecting Family Goal hides that field. No goal was saved. | Signed-in family member | Confirmed (conditional form behavior); task ownership/progress behavior unverified |
| FEAT-027 | Dashboard | Navigate from dashboard panels | Schedule View All opens Calendar, Quick Tasks View All opens Tasks, and Goal Progress View All opens Goals. | Signed-in family member | Confirmed (navigation) |
| FEAT-028 | Calendar | Change displayed month | Previous/next controls move the month grid; previous month was opened then next returned the view to November 2026. | Signed-in family member | Confirmed (navigation) |
| FEAT-029 | Tasks | Select a suggested task title | Clicking a listed suggestion populated the Task Type text field. The suggestion list includes grouped predefined titles; “Behavior goals” appeared twice. | Signed-in family member | Confirmed (selection); duplicate item observed |
| FEAT-030 | Tasks | Enter a custom task title | A generic unsaved test string remained in the task title field without being selected from the suggestion list. The draft was discarded without saving. | Signed-in family member | Confirmed (input behavior); save behavior unverified |
| FEAT-031 | Goals | Add a subtask to a goal draft | Entering a generic test string and choosing Add displayed that subtask in the unsaved form. Closing the form discarded the draft. | Signed-in family member | Confirmed (draft UI behavior); persistence/removal behavior unverified |
| FEAT-032 | Public/authentication entry | Resolve root URL while signed in | Opening `https://famsync.org/` in a separate tab redirected to authenticated `/dashboard`; unauthenticated behavior was not reached. | Browser visitor / signed-in user | Confirmed only for current authenticated session |

## Initial exploration coverage tracker

| Module | Screens discovered | Screens explored | Features verified | Blocked items | Coverage status |
|---|---:|---:|---|---|---|
| Dashboard | 1 | 1 | Summary cards, schedule, quick tasks, goal panel, all three View All destinations | Data-backed states | Partially Verified |
| Tasks | 3 | 3 | Board/List, status filters, suggested/custom title, Add Task fields | Validation, saved records, state transitions, populated actions, search/sort/pagination | Partially Verified |
| Calendar | 5 | 5 | Month grid/navigation; One Time, Daily, Weekly, Monthly form states | Recurrence generation, validation, attachments, populated event interactions | Partially Verified |
| Goals | 3 | 3 | Summary/filters; Family/Individual assignment; draft subtask | Goal lifecycle, progress, validation, persisted subtasks | Partially Verified |
| Channels | 3 | 3 | Sections, search, create-channel form, direct-message setup | Channel creation/join, messaging, permissions, attachments, invitation completion; DM blocked by one-member account | Partially Verified |
| Folders | 3 | 3 | Family Storage, expanded Channel/Standalone navigation, Add Folder form | Folder type, creation, file operations, sharing | Partially Verified |
| Family Settings | 2 | 2 | Members, invites, guests, family rule labels; invite form options | Role enforcement, invitation delivery/acceptance, guest access | Partially Verified |
| Private Mode | 1 control | 0 changes | Helper text and enabled display state | Effect on new/existing records and cross-member visibility | Partially Verified |
| Profile / account | 2 | 2 | Profile fields, family-wide visibility choices, counts, family-member form and roles | Saves, uploads, privacy enforcement, password/email changes, sign-out | Partially Verified |
| Public/authentication/onboarding | 1 root redirect outcome; 0 public screens | 0 public screens (authenticated redirect checked) | Root redirected to authenticated Dashboard | Sign-in, registration, recovery, onboarding | Blocked |

This table records the initial empty-state baseline and is historical. The later execution pass created synthetic records and uploaded a synthetic fixture with the user's authorization; it did not send real invitations, make payments, or change global privacy/account settings. See the current module tracker in [Pass 3 results](10-functional-execution-results.md).

## Initial evidence register

All screen evidence below is from the same authenticated URL, `https://famsync.org/dashboard`; module labels changed in-app without a route change. Screenshots were inspected during the session but are not yet archived as files.

| Evidence ID | Module | Screen / URL | Observation | Confidence |
|---|---|---|---|---|
| E-001 | Dashboard | Dashboard · `/dashboard` | Navigation labels, summary panels, zero counts, empty schedule and quick-task states | Confirmed |
| E-002 | Tasks | Tasks · `/dashboard` | Empty status columns; Add Task form fields and task-category choices | Confirmed (form presence); field rules unverified |
| E-003 | Calendar | Calendar · `/dashboard` | Month grid and Add Event form fields; form was closed without saving | Confirmed (form presence); behavior unverified |
| E-004 | Goals | Goals · `/dashboard` | Goal summary/filter controls and Create Goal form fields; form was closed without saving | Confirmed (form presence); behavior unverified |
| E-005 | Channels | Channels · `/dashboard` | Search field, Active Channels and Direct Messages empty states | Confirmed |
| E-006 | Folders | Folder / Family Storage · `/dashboard` | Channel Folders empty state and Add Folder action | Confirmed |
| E-007 | Family Settings | Settings · `/dashboard` | Members, pending invites, guests, family settings, and current account role label “Owner” | Confirmed (current session only) |
| E-008 | Family Settings | Invite person form · `/dashboard` | Name/email/optional phone fields, Member/Admin roles, Send invite; no invite submitted | Confirmed (form/options) |
| E-009 | Sidebar / roles | Persistent navigation · `/dashboard` | Profile footer labels current member “Parent”; Settings labels same listed member “Owner” | Confirmed observation; equivalence/meaning unverified |
| E-010 | Private Mode | Persistent navigation · `/dashboard` | Switch helper states newly created events, tasks, and goals are saved as private when on; switch not toggled | Confirmed (copy); exact behavior unverified |
| E-011 | Channels | Create New Channel dialog · `/dashboard` | Required name, emoji, optional image, topic, description, invite people; helper text describes immediate family access and guest email invites; no save | Confirmed (form/copy) |
| E-012 | Channels | Direct Messages dialog · `/dashboard` | Required family-member assignment; empty membership prevented examining a recipient or conversation state | Confirmed (form); subsequent flow blocked |
| E-013 | Folders | Folder navigation and Add Folder dialog · `/dashboard` | Expanded navigation lists Channel and Standalone folders, both empty; add form has required title, emoji, description | Confirmed (form/display) |
| E-014 | Profile / account | Profile Settings · `/dashboard` | Profile fields, counts, account actions, and three privacy audiences per data type; current audience is everyone in family for events, tasks, and goals | Confirmed (visible state/copy) |
| E-015 | Profile / account | Add Family Member dialog · `/dashboard` | Required name/email, Parent/Child access labels, optional age/birthday/phone/photo/color; no member saved | Confirmed (form/options) |
| E-016 | Calendar | Add Event recurrence options · `/dashboard` | One Time, Daily, Weekly, and Monthly reveal different date/day fields; no event saved | Confirmed (conditional fields) |
| E-017 | Goals | Create New Goal dialog · `/dashboard` | Individual Goal shows required assignee; Family Goal hides assignee; no goal saved | Confirmed (conditional form) |
| E-018 | Dashboard | Dashboard panel links · `/dashboard` | Schedule → Calendar, Quick Tasks → Tasks, Goal Progress → Goals | Confirmed (navigation) |
| E-019 | Calendar | Month navigation · `/dashboard` | Previous month displayed October 2026; next restored November 2026 | Confirmed (navigation) |
| E-020 | Tasks | Add New Task dialog · `/dashboard` | Suggested task selection populated title field; visible title list contains a duplicate “Behavior goals” item | Confirmed (selection/list content) |
| E-021 | Tasks | Add New Task dialog · `/dashboard` | A generic custom title was accepted in the field; form closed without save | Confirmed (input behavior) |
| E-022 | Goals | Create New Goal dialog · `/dashboard` | Add appended a generic subtask to the open draft; closing the dialog discarded it | Confirmed (draft behavior) |
| E-023 | Public entry point | `https://famsync.org/` in a separate tab | Root URL redirected to authenticated `/dashboard`; public or unauthenticated screens not reachable without ending current session | Confirmed (current session only) |
| E-024 | Sidebar header | FamSync logo/icon button · `/dashboard` | Clicking the icon/button produced no observable change; its intended action is unknown | Confirmed observation; behavior unresolved |

Evidence IDs E-025–E-038 document saved-state execution, synthetic test data, observed state transitions, and remaining permission limitations in [10-functional-execution-results.md](10-functional-execution-results.md).

## Observed anomalies and boundaries

- **Role labels conflict:** The current profile says Parent, while the Settings member row says Owner (E-009). They may represent different role systems, but that has not been established.
- **Duplicate task suggestion:** “Behavior goals” appears twice in the task-title suggestions (E-020). Whether the duplicate is intentional is unknown.
- **Privacy defaults need reconciliation:** The global Private Mode switch appeared on and event/task/goal creation forms initially showed “Private (only me)” checked, while Profile Settings showed family-wide visibility as the current audience for events, tasks, and goals (E-010, E-014). The interaction between these controls is unverified.
- **Date-picker boundary:** In the task form, earlier dates in the displayed month were disabled. This may prevent creating a task with a past due date; the behavior was not fully tested and is not yet stated as a business rule.
- **Accessibility evidence:** Several icon-only controls appeared without accessible names in the browser accessibility tree, including channel creation/direct-message controls and the folder expand control. Treat as a potential accessibility issue pending a broader audit.
- **Account scope (initial pass):** The first pass began with one signed-in account, one visible family member, and empty modules. The later execution pass added synthetic records and a Child profile; only Parent-session views were available, so cross-account behavior remains unverified. See E-025–E-038.

## Open questions for subsequent passes

1. Are “Parent” and “Owner” separate role concepts, or inconsistent labels for the same account?
2. What are the permissions for Member, Admin, Owner, Parent, Child, and guest accounts? Only one current settings-capable session is available.
3. How do channel and standalone folders differ, and where are standalone folders managed?
4. How do event recurrence choices, task/goal status transitions, privacy choices, and channel guest access behave after data exists?
5. Do task title suggestions intentionally include the duplicate “Behavior goals” option?
6. Are there account authentication, onboarding, subscription, or billing screens outside this current session?
7. What integrations or automated messages are triggered by invitation, event, task, goal, channel, or file actions?

## Second-pass verification and final audit

| Audit check | Result |
|---|---|
| Revisit main navigation | Dashboard, Tasks, Calendar, Goals, Channels, Folders/expand, Settings, Private Mode, and Profile Settings were all revisited or opened. |
| Compare navigation against sitemap | All visible named sidebar destinations are represented. Folders expand state is documented separately. The FamSync header icon showed no visible response when clicked. |
| Trace dashboard actions | All three View All controls were followed to Calendar, Tasks, and Goals; Add Event opens its form. |
| Compare actions against feature inventory | Add Task, Add Event, Create Goal, Create Channel, Direct Messages setup, Add Folder, Invite person, Add Family Member, profile actions, privacy controls, and folder expansion are represented. |
| Revisit conditional UI | Event recurrence fields and individual/family goal assignment were compared; task suggestions/custom text and local goal-subtask addition were checked. |
| Cross-module relationships | Family-member assignment, privacy, channel guest invitation, folder types, dashboard shortcuts, and two role vocabularies are documented with uncertainties. |
| Evidence traceability | Every discovered feature FEAT-001–FEAT-032 maps to at least one FS requirement in Document 03; each requirement names an evidence reference or explicitly notes the blocked scope. |
| Permission uncertainties | Parent/Owner mismatch and Member/Admin/Child/Guest access limits are recorded. No alternate role was available. |
| Unexplored states | Save/validation, populated records, edits/deletes, cross-member visibility, messaging, upload handling, public auth, and backend integrations remain unverified. |

The statement above describes the second UI pass only. The later saved-state pass verified meaningful workflows in the major data modules, but did not establish complete module coverage; the updated tracker and evidence are in [10-functional-execution-results.md](10-functional-execution-results.md).

### Remaining access needed

- A Child login or controlled second session to verify cross-member visibility and permissions for shared/private events, tasks, goals, channel membership, and direct messages. The Parent session alone confirms only saved records and Parent-side presentation.
- A controlled guest identity and explicit authorization to verify channel invitation/acceptance without contacting a real person.
- Product-owner clarification for Parent/Owner and Member/Admin role mapping, privacy precedence, recurrence output, goal progress for zero subtasks, and folder scope.
- If technical architecture and migration details are required, read-only access to the original editor/workflows, data configuration, plugins, integrations, and API settings.

See [rebuild scope and gap analysis](09-rebuild-scope-gap-analysis.md) for the coverage report, traceability table, open questions, and preliminary scope recommendations.

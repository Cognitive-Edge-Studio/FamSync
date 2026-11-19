# Document 08 — Rebuild Scope and Gap Analysis

Recommendations below are separate from verified current behavior. No technology or architecture decision is made here. Exploration began with one signed-in family account, one visible member, and empty functional modules; later authorized synthetic-data execution is summarized in the final audit and [Pass 3 ledger](10-functional-execution-results.md).

## A. Core functionality to preserve

These capabilities are strongly indicated by the observed UI and should be treated as candidate core scope, subject to stakeholder confirmation:

- Family dashboard with counts and shortcuts for events, tasks, overdue work, and goals.
- Family calendar with month navigation and one-time/daily/weekly/monthly event forms.
- Task catalog/custom titles, family-member assignment, due dates, private marking, and To Do/In Progress/Completed/Overdue views.
- Family and individual goals with categories, priority, target date, assignment for individual goals, and subtasks.
- Family members and role-aware access, including privacy audiences and private items.
- Invitation and guest workflows, including channel-scoped guest access.

## B. Supporting functionality

- Profile information, activity counts, and avatar/photo controls.
- Dashboard cross-module shortcuts.
- Channels, direct-message setup, channel image/topic/description, and participant invitations.
- Family Storage, channel folders, standalone folder navigation, and file attachments.
- Family name and allow-guests setting.
- Account email/password actions and sign-out.
- Email notifications/invitations indicated by UI copy; vendor and delivery behavior unknown.

## C. Existing issues and inconsistencies observed

| Finding | Evidence | Impact / confidence |
|---|---|---|
| Current user is labeled Parent in Profile Settings and Owner in Settings | E-009 | Confirmed mismatch; may be distinct role systems. Product must clarify before authorization design. |
| “Behavior goals” occurs twice in task title suggestions | E-020 | Confirmed duplicate option; likely confusing, intent unknown. |
| Private Mode appears on and creation-form Private checkboxes default checked, while profile audiences show family-wide | E-010, E-014 | Confirmed separate UI states; precedence and intended privacy behavior are unknown. |
| Past days in the displayed month were disabled in the task due-date picker while the task module exposes an Overdue category | E-002 | Confirmed UI observation; possible intentional restriction or inconsistency. Past-date rule needs verification. |
| Folder page shows Channel Folders while sidebar also shows Standalone Folders; Add Folder form does not expose a type choice | E-006, E-013 | Confirmed presentation; how types are created/opened remains unclear. |
| Text invitations are labeled “coming soon” | E-008 | Confirmed incomplete capability for phone-based invites; delivery roadmap unknown. |
| Several icon-only controls have no accessible name in the browser accessibility tree | E-005, E-011, E-013 | Confirmed for inspected controls; potential accessibility issue. Broader audit needed. |
| Header icon/button near FamSync label showed no observable effect when clicked | E-024 | Observed no visible outcome; purpose and whether this is a defect are unknown. |

## D. Potential improvements (recommendations, not current requirements)

- Reconcile role names and show the effective role consistently across Profile Settings and Settings.
- Remove or intentionally distinguish the duplicate task suggestion.
- Explain how global Private Mode, per-item Private, and profile-wide audience preferences interact; expose the effective audience before saving.
- Clarify whether past due dates are allowed, particularly because Overdue is a visible task view.
- Make the folder type and navigation model explicit; provide a clear route to both channel and standalone folders.
- Add accessible names and focus/keyboard behavior to icon-only buttons, switches, date controls, and subtask actions.
- Provide a safe non-production dataset or role test accounts so empty states do not block verification of assignment, completion, guest access, and shared visibility.
- Replace ambiguous or missing field errors with explicit required-field, date/time, and upload feedback once validation rules are confirmed.

## E. Technical and functional unknowns

- Actual data schema, identifiers, ownership, retention, deletion, and audit history.
- Authentication provider, account recovery, session lifecycle, registration, and onboarding.
- Role enforcement and relationship between Parent/Child, Member/Admin, and Owner.
- Privacy precedence, visibility enforcement, and assignment/read access rules.
- Task state transitions, overdue calculation, due-date boundaries, edit/archive/delete behavior.
- Event recurrence generation, time zone, daylight-saving handling, and series edits.
- Goal progress calculation, completion rules, and subtask lifecycle.
- Channel membership, direct-message behavior, guest acceptance, message moderation, notifications, and retention.
- Folder hierarchy, file storage vendor, access control, upload limits, scanning, download, and deletion behavior.
- Email/SMS/push vendors and triggers; current UI only mentions email invitations and says text invites are coming soon.
- Calendar integration, analytics, external APIs, payments/subscriptions, background jobs, and scheduled processes.
- Original low-code editor, workflows, plugins, API settings, and backend configuration were unavailable.

## F. Stakeholder clarification register

| ID | Question | Why it matters |
|---|---|---|
| Q-01 | Are Parent/Child and Member/Admin/Owner separate role dimensions? Which is authoritative for access? | Prevents incorrect role/permission migration. |
| Q-02 | What can each role read, create, update, delete, invite, and administer? | Required for authorization and QA acceptance. |
| Q-03 | Do Settings → Invite person and Profile → Add Family Member create the same person/invitation state? | Two forms expose different required fields and role systems. |
| Q-04 | What is the intended precedence among Private Mode, per-record Private, and profile audience settings? | Privacy is core and current UI signals differ. |
| Q-05 | Can tasks have past due dates? How does a task become Overdue? | Resolves date-picker observation and overdue semantics. |
| Q-06 | Are recurring events generated instances or one series record? What are end-date/time-zone rules? | Defines event persistence and calendar behavior. |
| Q-07 | How is goal progress calculated and how do subtasks affect it? | Needed to preserve metrics and completion rules. |
| Q-08 | What is the exact distinction between Channel Folders and Standalone Folders? | Affects data model, navigation, and sharing. |
| Q-09 | What data do channel guests see, and what does Allow guests in channels control when off? | Needed to preserve access boundaries. |
| Q-10 | Which email, SMS, push, calendar, storage, analytics, or payment integrations are active? | Browser UI does not establish vendors or backend processes. |
| Q-11 | Is “Behavior goals” duplicated intentionally? | Prevents migrating a content defect as a product rule. |
| Q-12 | What public/authentication/onboarding flows exist? | Root redirected to Dashboard in the current authenticated session. |
| Q-13 | Are subscriptions/billing present or planned? | No billing surface was visible, but absence is unverified. |
| Q-14 | Can a staging environment or controlled test family with Parent, Child, Member, Admin, Owner, and Guest accounts be provided? | Needed to complete role and cross-user verification without changing production data. |

## G. Preliminary rebuild scope and phases

These are planning suggestions only; confirm with the product owner before turning them into committed scope.

### Candidate MVP — family coordination baseline

- Family membership and clearly mapped roles.
- Dashboard and family calendar, including confirmed event type choices once recurrence rules are clarified.
- Tasks with title suggestions/custom entry, due dates, assignment, privacy, and status lifecycle.
- Goals with family/individual type, categories, priority, target dates, and subtasks.
- Profile basics and explicit privacy controls.
- Settings for family membership and invitations if confirmed as essential.

### Subsequent phase — communication and shared storage

- Channels and direct messages.
- Channel guest invitations and access rules.
- Channel/standalone folders and attachment/file operations.
- Email notifications and any verified external services.

### Later phase — confirmed operational extensions

- Account recovery/onboarding, if required for the chosen migration plan.
- Additional administrative controls, billing, integrations, analytics, or automations only if stakeholders confirm they exist and must be preserved.

No implementation order or technology stack is prescribed here.

## Second-pass completeness audit (initial UI pass, before saved-state execution)

### Checks performed

1. Revisited every visible sidebar entry: Dashboard, Tasks, Calendar, Goals, Channels, Folders (including expand control), Settings, Private Mode, and Profile Settings.
2. Traced all three dashboard View All links to Calendar, Tasks, and Goals.
3. Compared visible creation actions against the feature inventory: Add Task, Add Event, Create Goal, Create New Channel, Direct Messages, Add Folder, Invite person, and Add Family Member.
4. Revisited conditional forms: event recurrence modes, individual/family goal assignment, task suggestion/custom title, and local goal-subtask addition.
5. Cross-checked role and privacy labels across Profile Settings, Settings, invitation forms, and channel helper text.
6. Confirmed all discovered feature IDs have a functional-requirement mapping (traceability below).
7. Revisited the root URL in a separate tab; authenticated session redirected to Dashboard.

### Initial coverage report (superseded by the final execution audit below)

| Module | UI states discovered / opened | Coverage status | Sufficiently documented for initial scope? | Further investigation needed |
|---|---:|---|---|---|
| Dashboard | 1 / 1 | Partially Verified | Yes — visible panels and navigation | Populated metrics, counts, refresh, errors |
| Tasks | 3 / 3 | Partially Verified | Yes — views, filters, form, title inputs | Save/validation, assignment, state transitions, populated card actions |
| Calendar | 5 / 5 | Partially Verified | Yes — month navigation and conditional form fields | Recurrence execution, date rules, attachments, populated events |
| Goals | 3 / 3 | Partially Verified | Yes — metrics, filters, type/assignment, draft subtasks | Save/validation, progress, completion, subtask lifecycle |
| Channels | 3 / 3 | Partially Verified | Yes — list, creation fields, DM setup | Channel creation, guest acceptance, messages, notifications, permissions |
| Folders | 3 / 3 | Partially Verified | Partially — list/types/add form visible | Folder type, hierarchy, files, sharing, populated behavior |
| Family Settings | 2 / 2 | Partially Verified | Yes — sections, invitation fields, guest rule | Role enforcement, sending/acceptance, member changes |
| Private Mode | 1 control / 0 changes | Partially Verified | Partially — helper and displayed state | State persistence and effect on new/existing records |
| Profile / account | 2 / 2 | Partially Verified | Yes — fields, choices, family-member form | Save, uploads, account actions, privacy enforcement |
| Public/authentication/onboarding | Root behavior observed; public screen unavailable | Blocked | No | Requires unauthenticated session or approved test access |

At the time of this initial report, no module was **Verified**. The later authorized synthetic-data pass supersedes the empty-state limitations for record saves, messaging, uploads, and selected lifecycle operations; see the final audit below and [execution ledger](10-functional-execution-results.md).

### Traceability: discovered features to functional requirements

| Feature IDs | Requirement IDs |
|---|---|
| FEAT-001 | FS-001 |
| FEAT-002, FEAT-003, FEAT-004, FEAT-027 | FS-002 |
| FEAT-005 | FS-003 |
| FEAT-006, FEAT-029, FEAT-030 | FS-004, FS-005 |
| FEAT-007, FEAT-028 | FS-006 |
| FEAT-008, FEAT-025 | FS-007 |
| FEAT-009 | FS-008 |
| FEAT-010, FEAT-026, FEAT-031 | FS-009 |
| FEAT-011 | FS-010 |
| FEAT-018 | FS-011 |
| FEAT-019 | FS-012 |
| FEAT-012, FEAT-020 | FS-013 |
| FEAT-013 | FS-014 |
| FEAT-014 | FS-015 |
| FEAT-015 | FS-016 |
| FEAT-016 | FS-017 |
| FEAT-017, FEAT-021, FEAT-024 | FS-018 |
| FEAT-022 | FS-019 |
| FEAT-023 | FS-020 |
| FEAT-032 | FS-021 |

### Requirements without complete evidence

Every requirement has at least one screen or interaction reference. The initial report predates E-025–E-038; current confirmed outcomes and remaining unknowns are recorded in [the execution ledger](10-functional-execution-results.md) and the updated requirements in [Document 03](04-functional-requirements.md).

## Final execution audit after saved-state pass

User-authorized synthetic records were used to exercise create, update, state, member assignment, message, and file workflows. No real invitations were sent and no global privacy/account settings were changed. Current results are **Partially Verified** for every accessible module: each has meaningful saved-state evidence, but none has complete evidence for all discovered actions, failure paths, backend behavior, and relevant role sessions.

| Module | Current coverage | Verified examples | Remaining blocker / gap |
|---|---|---|---|
| Dashboard | Partially Verified | Module shortcuts were traced in the first pass. | Populated metrics, refresh timing, and loading/errors were not checked. |
| Tasks | Partially Verified | Save/edit; To Do → In Progress → Completed; private and Child-assigned shared records; status counts. | Child session, List-mode populated behavior, archive/delete, errors, and overdue rule. |
| Calendar | Partially Verified | One-time and recurring saves; Child assignment, location, attachment selection; populated details. | Daily/Monthly/Weekly output did not match selected recurrence; note/attachment persistence and edit/errors remain open. |
| Goals | Partially Verified | Family and Individual saves; subtask progress and completion; Child assignment; populated metrics. | Child session, edit/delete/errors, and `0 / 0 (%)` semantics. |
| Channels | Partially Verified | Channel creation; Child member addition; message, reply, like reaction. | Child/guest access, guest acceptance, attachments, edit and notification behavior. |
| Direct Messages | Partially Verified | Synthetic Child conversation and message send visible in Parent transcript. | Recipient-side delivery/read state, attachments, group behavior, and notifications. |
| Folders | Partially Verified | Standalone folder; file upload; populated list, Files filter, filename search, Name A–Z sort. | Another member's access, download/share/edit/delete, upload limits, immediate refresh. |
| Family Settings / Profile | Partially Verified | Synthetic Child profile saved with Child (Limited access) label. | Settings invite delivery, role mapping/enforcement, profile/account actions. |
| Private Mode / visibility | Partially Verified | Per-item private/shared states and existing audience values observed; shared records displayed in Parent view. | Cross-account enforcement, selected-person mode, and privacy precedence. |
| Public/authentication/onboarding | Blocked | Root resolved to Dashboard in signed-in session. | Requires unauthenticated access/session or test credentials. |

### Post-save findings to carry into rebuild discovery

- Recurrence output: Daily and Monthly records appeared only on the selected start date; the Weekly event appeared on Nov 17 even though Monday was selected. Treat as unresolved behavior and confirm with the product owner before specifying expected recurrence.
- Goal progress: a no-subtask Individual goal displayed `0 / 0 (%)`; a Family goal with one completed subtask moved to Completed and 100%.
- Feedback: editing a task produced the “Task Added Successfully!” toast, which does not describe the update action.
- Folder list refresh: the upload toast appeared, but the file was only visible after navigating away and reopening the folder.
- Privacy: saved shared records showed Child assignment and no lock in the Parent view; actual Child visibility is unknown. UI state alone does not prove authorization.

### Updated traceability for executed workflows

| Feature IDs | Requirement IDs | Evidence |
|---|---|---|
| FEAT-006 | FS-005, FS-022 | E-025, E-026 |
| FEAT-008, FEAT-025 | FS-007, FS-023 | E-027–E-029 |
| FEAT-009, FEAT-010, FEAT-026, FEAT-031 | FS-008, FS-009, FS-024 | E-030–E-032 |
| FEAT-018, FEAT-033 | FS-011, FS-025 | E-033, E-034 |
| FEAT-019, FEAT-034 | FS-012, FS-026 | E-035 |
| FEAT-020, FEAT-035 | FS-013, FS-027 | E-036 |
| FEAT-023 | FS-020, FS-028 | E-037, E-038 |

The principal access needed to close the most important remaining gap is a controlled Child login/session. A second account is necessary to confirm shared/private visibility, channel membership, and direct-message delivery rather than infer those behaviors from the Parent-side UI.

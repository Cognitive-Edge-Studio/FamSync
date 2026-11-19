# Document 03 — Functional Requirements Specification

**Evidence boundary:** This specification describes UI behavior observed in one signed-in Parent session. The initial forms-only pass is supplemented by authorized synthetic saved-state workflows in [Pass 3 results](10-functional-execution-results.md). Persistence and visible state changes are confirmed where evidence IDs say so; backend rules and Child-session enforcement remain open. Evidence IDs refer to [Document 01](01-initial-reconnaissance.md) and the Pass 3 ledger.

## Requirement record conventions

Each requirement gives its feature mapping, objective/story, actor and preconditions, observed workflow and data, constraints/alternatives, acceptance criteria, and verification evidence. **Unknown** means the browser session did not establish that behavior. It is not an implied requirement.

## Dashboard

### FS-001 — Show family summary cards (FEAT-001)

- **Objective / story:** As a family member, I want a summary of current family activity so that I can review the day at a glance.
- **Actor / precondition:** Signed-in member; current family workspace is loaded.
- **Observed flow and data:** Dashboard shows cards for Today's Events, Active Tasks, Overdue Task, and Active Goals. Counts in the inspected account were zero; secondary text included today's/upcoming and due-today hints.
- **Rules, states, errors:** Empty counts were visible. Calculation rules, refresh timing, loading, and error behavior are unknown.
- **Acceptance criteria:** Dashboard exposes all four summary concepts and their displayed counts; a zero-data state renders without a record list.
- **Verification:** Confirmed display only · E-001.

### FS-002 — Open schedule, task, and goal modules from dashboard (FEAT-002, FEAT-003, FEAT-004, FEAT-027)

- **Objective / story:** As a family member, I want to open a full module from its dashboard panel.
- **Actor / precondition:** Signed-in member on Dashboard.
- **Observed flow and data:** Today's Schedule has View All and Add Event; Quick Tasks and Goal Progress each have View All. View All opens Calendar, Tasks, and Goals respectively. Schedule and quick-task empty states were visible.
- **Inputs / outputs:** No form inputs; output is the selected module screen. Add Event opens the event form defined in FS-007.
- **Rules / edge cases:** Empty panel behavior is confirmed. Behavior with records, and whether Add Event carries a selected date, is unknown.
- **Acceptance criteria:** The three View All controls open Calendar, Tasks, and Goals in the same app session.
- **Verification:** Confirmed navigation · E-001, E-018.

## Tasks

### FS-003 — Browse task statuses and views (FEAT-005)

- **Objective / story:** As a family member, I want to review tasks by status and choose a board or list view.
- **Actor / precondition:** Signed-in member on Tasks.
- **Observed workflow:** All Tasks, Overdue, To Do, In Progress, and Completed controls are shown with counts; Board and List controls switch presentation. Board shows status columns; List shows a single empty result state.
- **Inputs / outputs:** Status filter and view choice; output is a filtered empty state in this account.
- **Rules / errors:** No task records existed. Search, sorting, pagination, transition behavior, and populated task actions are unknown. “Overdue” is a visible filter/column; its derivation is unknown.
- **Acceptance criteria:** The view exposes the five observed status filters and Board/List controls; with no records it shows an empty state.
- **Verification:** Controls confirmed; data behavior partially verified · E-002.

### FS-004 — Select or enter a task title (FEAT-029, FEAT-030)

- **Objective / story:** As a family member, I want to choose a suggested task or enter my own title.
- **Actor / precondition:** Add Task form is open.
- **Observed workflow / inputs:** Task Type field displays grouped suggestions; selecting “Clean room” populated the field. A generic custom string was accepted in the field. Both drafts were discarded without saving.
- **Observed suggestion groups:** Household Chores; School & Learning; Habits & Daily Routines; Health, Fitness & Wellness; Personal Responsibility; Goals & Skill Building; One-Time / Special Tasks; Family & Social Commitments. Titles include chores, homework/study, routines, wellness, responsibility, skills, special tasks, and family commitments. The full observed list is in Appendix A. “Behavior goals” appeared twice.
- **Rules / edge cases:** Custom text acceptance is confirmed; matching, duplicate handling, limits, and title validation are unknown.
- **Acceptance criteria:** Selecting a suggestion populates the title field; non-sensitive custom text can remain in the field without a catalogue selection. The duplicate option should be reviewed with the product owner.
- **Verification:** Confirmed input behavior; duplicate observed · E-020, E-021.

### FS-005 — Open and configure a task draft (FEAT-006)

- **Objective / story:** As a family member, I want to draft an assigned task with a due date and privacy choice.
- **Actor / precondition:** Signed-in member with Tasks access.
- **Inputs observed:** Task title/type; description; due date and time; required “Assign to Family Members”; “Private (only me)” checkbox, checked by default in the inspected form.
- **Observed workflow:** Add Task opens Add New Task form. Only the current member was available. Due-date picker displayed the current day and past days in that month as disabled. Save was not used.
- **Output / state:** No saved task or status transition was observed. Task status labels available elsewhere are in FS-003.
- **Validation / failures:** Title/assignment validation messages and Save outcome are unknown. Do not infer the title is required from its label; the form did not display an asterisk next to it. Past-date restriction needs verification.
- **Acceptance criteria:** Opening Add Task displays the listed controls and required assignment; form can be closed without persisting a record. Save behavior remains unverified.
- **Dependencies / evidence:** Family membership; possible interaction with Private Mode. E-002.

## Calendar and events

### FS-006 — Browse and change calendar month (FEAT-007, FEAT-028)

- **Objective / story:** As a family member, I want to browse the family calendar by month and return to today.
- **Actor / precondition:** Signed-in member on Calendar.
- **Observed workflow:** Calendar displays month/year, previous and next controls, Today, weekday headings, and a month grid. Previous changed November 2026 to October 2026; next restored November 2026. The current day was highlighted.
- **Rules / errors:** Event rendering and date-cell actions could not be verified because no events existed; clicking a day showed no observable change.
- **Acceptance criteria:** Previous/next change the displayed month by one and Today is available. Only month navigation was verified.
- **Evidence:** E-003, E-019.

### FS-007 — Draft one-time or recurring event (FEAT-008, FEAT-025)

- **Objective / story:** As a family member, I want to draft a dated event, choose a recurrence mode, assign family members, and optionally add details.
- **Actor / precondition:** Signed-in member; Add Event form open.
- **Inputs observed:** Required Event Title; Event Type (One Time, Daily, Weekly, Monthly); date/time controls; Note; Attachments drop zone; Location; required family-member assignment; Private (only me), checked by default. No file was uploaded and no Save was submitted.
- **Conditional fields:** One Time shows Event Date; Daily shows Start Date and End Date; Weekly shows Select Day (Monday–Sunday) and End Date; Monthly shows Select Date and End Date. This is form behavior only; repeat occurrence generation is unknown.
- **Validation / states:** No validation or success/error state was triggered. Date boundaries, timezone, end-date constraints, recurrence stop conditions, upload restrictions, and duplicate-event behavior are unknown.
- **Acceptance criteria:** Selecting each event type exposes the corresponding date/day fields described above; closing the form does not save a record.
- **Dependencies / evidence:** Family membership, privacy rules, file storage, notification behavior. E-003, E-016.

## Goals

### FS-008 — Browse goals and progress summaries (FEAT-009)

- **Objective / story:** As a family member, I want to review active and completed goals by type.
- **Actor / precondition:** Signed-in member on Goals.
- **Observed workflow:** Metrics show Total Goals, Active Goals, Completed, Avg Progress. Filters are All Pending Goals, Individual, Family, Completed Goal. The empty state says there are no active goals yet.
- **Rules / errors:** Counts and progress calculation were zero/blank because the account had no goals; semantics of “pending,” completion, and average progress are unknown.
- **Acceptance criteria:** Screen exposes the four metrics and four filters in the observed empty state.
- **Evidence:** E-004.

### FS-009 — Draft a family or individual goal with subtasks (FEAT-010, FEAT-026, FEAT-031)

- **Objective / story:** As a family member, I want to define a family or individual goal and add subtask entries.
- **Actor / precondition:** Signed-in member; Create Goal form open.
- **Inputs observed:** Required Goal Title; Description; Category; Priority Level; Family Goal/Individual Goal; Target Date; Sub Task field and Add; Private (only me), checked by default.
- **Options observed:** Categories: Education & Learning, Sports & Fitness, Financial & Savings, Home & Household, Hobbies & Creativity, Health & Wellness, Family & Relationships, Personal Development. Priority: High, Medium, Low.
- **Conditional rule confirmed:** Individual Goal reveals required family-member assignment; Family Goal hides it. Adding a generic subtask appended it to the open draft. Closing the form discarded the draft.
- **Validation / states:** No Save, progress update, remove-subtask action, validation, or goal status change was tested. Requiredness beyond starred title/conditional assignment is unknown.
- **Acceptance criteria:** Type selection changes assignment visibility as described; Add appends a draft subtask; closing the form leaves the goal count at zero.
- **Dependencies / evidence:** Membership and privacy settings. E-004, E-017, E-022.

## Channels and folders

### FS-010 — Browse and search channels (FEAT-011)

- **Objective / story:** As a family member, I want to find channels and direct-message conversations.
- **Actor / precondition:** Signed-in member on Channels.
- **Observed workflow / inputs:** Search field; Active Channels; Direct Messages; plus controls for channel creation and direct-message setup. Both lists were empty.
- **Rules / errors:** Search matching, empty-query behavior, channel membership rules, message rendering, and error states are unknown.
- **Acceptance criteria:** Channels screen shows search, Active Channels, Direct Messages, and empty states when the account has no records.
- **Evidence:** E-005.

### FS-011 — Draft a channel and invite people (FEAT-018)

- **Objective / story:** As a family member, I want to create a channel and invite participants.
- **Actor / precondition:** Signed-in member with channel creation access; create-channel form open.
- **Inputs observed:** Required Channel Name; emoji picker; optional image upload; Channel Topic; Channel Description; Invite people.
- **Rules/copy observed:** UI says family members are added immediately and everyone else receives an email invitation to join the channel as a guest. No channel or invitation was created.
- **Validation / outcomes:** Save behavior, invite selection, duplicate names, guest consent/acceptance, attachment limits, and email vendor are unknown. Do not submit without authorization because it can invite real users.
- **Acceptance criteria:** Form presents the observed fields and helper text; no acceptance criterion for delivery is asserted.
- **Dependencies / evidence:** Family settings, guest policy, email delivery, file storage. E-011.

### FS-012 — Start a direct message (FEAT-019)

- **Objective / story:** As a family member, I want to start a direct conversation with another family member.
- **Actor / precondition:** Signed-in member; at least one eligible recipient is required by the visible form.
- **Observed workflow / inputs:** Direct Messages plus control opens a dialog with required Assign to Family Members. The family had one visible member, so recipient selection and message composer were unavailable.
- **Rules / errors:** Recipient cardinality, self-message behavior, send, read receipts, attachments, notifications, and errors are unknown.
- **Acceptance criteria:** Opening setup displays the required assignment field. The remainder is blocked in this account.
- **Evidence:** E-012.

### FS-013 — Browse and draft a folder (FEAT-012, FEAT-020)

- **Objective / story:** As a family member, I want to organize family files in folders.
- **Actor / precondition:** Signed-in member on Family Storage.
- **Observed workflow / inputs:** Page describes organizing/sharing files across channels and shows Channel Folders. Expanded navigation separately lists Channel Folders and Standalone Folders. Both are empty. Add Folder opens required Folder Title, emoji picker, Description, Save.
- **Rules / outcomes:** Which type Add Folder creates, where standalone folders are managed, folder access, file upload/download/delete, and persistence are unknown. No folder or file was created or uploaded.
- **Acceptance criteria:** Empty states and Add Folder fields render as observed; no further behavior is asserted.
- **Evidence:** E-006, E-013.

## Family settings, privacy, and profile

### FS-014 — View family members, pending invites, and guests (FEAT-013)

- **Objective / story:** As a family settings user, I want to review family membership and guest access.
- **Actor / precondition:** Signed-in member with access to Settings.
- **Observed workflow / data:** Settings shows Members, Pending invites, Guests, and Family settings. Current account displayed one member, no pending invites, and no guests. The same user is labeled Owner here and Parent in Profile Settings.
- **Rules / edge cases:** Other-member access and whether these role labels describe different role layers are unknown.
- **Acceptance criteria:** Screen displays the four observed sections and empty states for pending invites/guests.
- **Evidence:** E-007, E-009.

### FS-015 — Draft a Member/Admin invitation (FEAT-014)

- **Objective / story:** As a family settings user, I want to invite someone by email and choose an invitation role.
- **Actor / precondition:** Settings-capable member; Invite person form open.
- **Inputs observed:** First Name, Email, optional Phone; phone helper says text invites are coming soon; Role defaults to Member and offers Admin; helper says Admins can invite people and manage Settings; Send invite.
- **Validation / outcomes:** No fields were submitted. Requiredness, email validation, duplicate invitations, invite expiration, delivery vendor, acceptance, and cancel/revoke behavior are unknown. Sending can transmit an email, so the action was not taken.
- **Acceptance criteria:** Invite form exposes the observed fields/options and default role; no delivery behavior is asserted.
- **Evidence:** E-008.

### FS-016 — Configure guest-in-channel rule (FEAT-015)

- **Objective / story:** As a settings-capable family member, I want to control whether channel invitees join only the invited channel.
- **Actor / precondition:** Settings screen is available.
- **Observed input/rule:** “Allow guests in channels” switch; helper says when on, people invited from a channel join only that channel. It appeared enabled. No change was made.
- **Rules / errors:** Enforcement, visibility, off-state behavior, and interaction with channel-level guest invitations are unknown.
- **Acceptance criteria:** Settings displays the switch/helper; current value appeared on. Do not infer access enforcement.
- **Evidence:** E-007, E-011.

### FS-017 — Toggle private-by-default creation (FEAT-016)

- **Objective / story:** As a family member, I want new events, tasks, and goals to default to private.
- **Actor / precondition:** Signed-in member; sidebar control visible.
- **Observed input/rule:** Private Mode switch helper says when enabled, new events, tasks, and goals are saved as private. It appeared enabled and was not toggled.
- **Rules / conflicts:** Creation forms also showed Private (only me) checked by default, while profile visibility choices showed Everyone in my family. Precedence and persistence are unknown.
- **Acceptance criteria:** Sidebar exposes the described switch/helper. No write or cross-user behavior is asserted.
- **Evidence:** E-010, E-014.

### FS-018 — View and edit personal profile / account actions (FEAT-017, FEAT-021, FEAT-024)

- **Objective / story:** As a signed-in user, I want to manage profile information and see activity totals.
- **Actor / precondition:** Signed-in member opens Profile Settings using the sidebar gear.
- **Inputs observed:** Required First Name and Last Name; optional Phone Number and Bio; avatar/photo controls; Save Changes. Counts show Events Created, Tasks Completed, Goals Achieved. Quick actions are Change Password, Change Email, Sign Out.
- **Validation / outcomes:** No profile edit, upload, email/password action, or sign-out was performed. Save rules and account identity flows are unknown.
- **Acceptance criteria:** Profile Settings renders the observed fields, counts, privacy section, quick actions, and family information.
- **Safety boundary:** Password/email changes and sign-out were not used during discovery.
- **Evidence:** E-014.

### FS-019 — Set personal visibility for events, tasks, and goals (FEAT-022)

- **Objective / story:** As a signed-in user, I want to choose who can see each type of family data.
- **Actor / precondition:** Profile Settings is available.
- **Observed choices:** For Calendar/events, Tasks, and Goals: Everyone in my family; Only people I choose; Only me. The first option appeared selected for each. Helper says items marked Private are only ever visible to the user.
- **Inputs / outcomes:** Choice controls exist; none was changed. Selected-person workflow and access enforcement are unknown.
- **Acceptance criteria:** Each of the three data types displays the three audience choices and current family-wide selection in the inspected account.
- **Evidence:** E-014.

### FS-020 — Add a family member (FEAT-023)

- **Objective / story:** As a family member, I want to add a Parent or Child to the family.
- **Actor / precondition:** Signed-in user; Profile Settings → Family Information → Add Family Member.
- **Inputs observed:** Optional photo; required First Name, Last Name, Email Address; Parent (Full access) or Child (Limited access); optional Age, Birthday, Phone Number, Profile Color; Save.
- **Validation / outcomes:** No member was saved. Whether Save creates an account, sends an invitation, or creates a pending record is unknown. These are distinct from the Member/Admin invitation form in Settings until verified.
- **Acceptance criteria:** Form displays the required and optional fields and role descriptions above. No role-permission enforcement is asserted.
- **Evidence:** E-015.

## Public entry and session boundary

### FS-021 — Resolve the root URL in an authenticated session (FEAT-032)

- **Objective / story:** As a signed-in user, I want the FamSync root entry point to open the authenticated workspace.
- **Actor / precondition:** Browser has an existing authenticated FamSync session.
- **Observed flow / output:** Opening `https://famsync.org/` in a separate tab resolved to `/dashboard` and displayed Dashboard.
- **Rules / edge cases:** Unauthenticated behavior, sign-in, registration, recovery, and onboarding were not observed. The existing session was not ended.
- **Acceptance criteria:** Under the inspected authenticated session, root resolves to Dashboard. No claim is made about public routes.
- **Verification:** Confirmed for current session only · E-023.

## Saved-state execution requirements and deltas

The requirements below record interactions completed after the initial empty-state pass. They supersede earlier statements in this document that no records were saved, but do not establish unobserved role access or backend behavior.

### FS-022 — Create, update, and transition a task (FEAT-006)

- **Objective / story:** As a family member, I want to create an assigned task, edit it, and move it through its visible statuses.
- **Actor / precondition:** Signed-in Parent session; a family member is available for assignment.
- **Observed workflow / data:** A synthetic Parent task was saved, its description edited, and its status moved To Do → In Progress → Completed. A separate shared task was saved with the synthetic Child as assignee and Private unchecked; the To Do board showed the Child avatar.
- **Acceptance criteria evidenced:** Save creates a task visible in the chosen status; the status action changes its board/filter; edit changes the displayed description; selecting a Child assignee and clearing Private is reflected in the Parent view.
- **Unverified:** Validation, notification, Child-session access, archive/delete, and overdue calculation. After editing, the toast text incorrectly said “Task Added Successfully!”.
- **Verification / evidence:** Confirmed Parent-session visible states · E-025, E-026.

### FS-023 — Save and inspect events, including recurrence modes (FEAT-008, FEAT-025)

- **Objective / story:** As a family member, I want to save events with optional details and assignment, then find them on the calendar.
- **Actor / precondition:** Signed-in Parent session; at least one family member is available.
- **Observed workflow / data:** Saved one-time, Daily, Weekly, and Monthly synthetic events. A shared one-time event with note, location, Child assignment, and a selected text attachment saved; the Nov 20 detail list showed Child assignee and location. A private one-time event showed Parent assignment and location.
- **Acceptance criteria evidenced:** Save closes the form and adds an event to its displayed calendar date; event details expose title, time, location when supplied, and assignee.
- **Unverified / observed anomaly:** Daily and Monthly events appeared only on the starting date; Weekly appeared on Nov 17 although Monday had been selected. No later expected occurrences appeared. Note and attachment were not reopened to confirm persistence. Do not encode recurrence output as a confirmed business rule.
- **Verification / evidence:** Save and Parent-side details confirmed; recurrence semantics unresolved · E-027–E-029.

### FS-024 — Create and complete goals with subtasks (FEAT-010, FEAT-026, FEAT-031)

- **Objective / story:** As a family member, I want to create a family or individual goal and track its subtask progress.
- **Actor / precondition:** Signed-in Parent session; assignment available for individual goals.
- **Observed workflow / data:** Saved a private Family goal with one subtask; checking the subtask moved it to Completed Goal and displayed 100%. Saved a private Parent Individual goal with no subtasks; its card displayed `0 / 0 (%)`. Also saved a shared Child Individual goal with one subtask; its card showed Child avatar and `0 / 1 (0%)`.
- **Acceptance criteria evidenced:** Family/Individual selection determines assignment field; saved goals appear in pending/completed filters; completing the only subtask completes the tested Family goal; subtask completion changes visible progress.
- **Unverified:** Goal editing, validation, deletion, Child-session access, and zero-subtask progress meaning. The `0 / 0 (%)` result is a confirmed display state, not a defined formula.
- **Verification / evidence:** Parent-side create/progress states confirmed · E-030–E-032.

### FS-025 — Create a channel and use message actions (FEAT-018, FEAT-033)

- **Objective / story:** As a family member, I want to create a channel, include a family member, post, reply, and react.
- **Actor / precondition:** Signed-in Parent session; synthetic Child profile available.
- **Observed workflow / data:** Saved a channel with topic/description, added QA Seed Child using Add Members, posted a synthetic message, replied with a second synthetic message, and liked the original. Channel details showed two members; the like count changed from 0 to 1.
- **Acceptance criteria evidenced:** Created channel appears in Active Channels; member count/details update; message and reply render with sender; like count increments after reaction.
- **Unverified:** Child-session visibility, guests/invitation acceptance, channel edit/access controls, message attachment, dislike, notification and retention behavior.
- **Verification / evidence:** Confirmed in Parent session · E-033, E-034.

### FS-026 — Start and send a direct message (FEAT-019, FEAT-034)

- **Objective / story:** As a family member, I want to start a direct conversation with another family member and send a message.
- **Actor / precondition:** Signed-in Parent session; another family member is available.
- **Observed workflow / data:** Started a direct message to the synthetic Child profile; the conversation appeared in Direct Messages, and a synthetic message appeared in its transcript.
- **Acceptance criteria evidenced:** A conversation can be initiated for the selected member and a sent message appears in the Parent-side transcript.
- **Unverified:** Recipient-side delivery, read status, notifications, group behavior, attachments, and role restrictions.
- **Verification / evidence:** Parent-side creation and send confirmed · E-035.

### FS-027 — Create a folder and find an uploaded file (FEAT-020, FEAT-035)

- **Objective / story:** As a family member, I want to organize files and locate them by name and type.
- **Actor / precondition:** Signed-in Parent session; folder creation available.
- **Observed workflow / data:** Created a standalone folder, uploaded a synthetic text fixture, reopened the folder, filtered to Files, searched the filename, and sorted by Name A–Z. The list showed one file after reopening; it did not refresh immediately after the upload toast.
- **Acceptance criteria evidenced:** Saved folder appears in Created Folders; successful upload appears in the reopened folder list and remains visible under the exercised filter/search/sort.
- **Unverified:** Immediate refresh, folder sharing/scope, download, edit/delete, another member's access, upload limits and security.
- **Verification / evidence:** Confirmed from Parent session · E-036.

### FS-028 — Add a Child profile and assign shared records (FEAT-023)

- **Objective / story:** As a signed-in user, I want to add a Child profile and use it as an assignee/member.
- **Actor / precondition:** Signed-in Parent session with Profile Settings access.
- **Observed workflow / data:** Saved the synthetic QA Seed Child profile with role Child (Limited access). The profile appeared in family information and could be selected for shared event/task/goal assignment, channel membership, and a direct-message conversation.
- **Acceptance criteria evidenced:** Saved Child profile appears in the family list and is selectable in the exercised module forms.
- **Unverified:** Account activation/invitation, Child login, and effective access restrictions. This flow is distinct from Settings → Invite person until backend behavior is known.
- **Verification / evidence:** Member save and Parent-side selection confirmed · E-026, E-029, E-032–E-035, E-037.

## Cross-feature rules and open validation requirements

- Current date shown by the application was November 17, 2026. Task date picker visibly disabled earlier dates in the displayed month; whether that is an intentional rule is unknown.
- Task, event, and goal forms each initially showed Private (only me) checked. The global Private Mode switch also appeared enabled. Profile audience controls were family-wide. The precedence among these controls must be established before rebuilding privacy behavior.
- A required family-member assignment appears in Task and Event forms and conditionally for individual Goals. The test family now includes a synthetic Child profile selectable in these forms; only Parent-side behavior was observed.
- Save toasts and visible persisted states are documented in E-025–E-037. No validation/error path or backend record was inspected; delete/archive and many edit paths remain unverified.
- No external notification vendor, payment provider, calendar integration, or analytics service was confirmed.

## Appendix A — Task title suggestion catalogue

The Add Task title chooser showed these grouped suggestions; duplicate wording is preserved as observed.

| Group | Suggested titles |
|---|---|
| Household Chores | Make bed; Clean room; Laundry (sort / fold / put away); Dishes (load/unload dishwasher); Take out trash & recycling; Feed pets / clean litter box; Vacuum / sweep / mop; Clean bathroom; Set / clear table; Yard work (mow, rake, water plants) |
| School & Learning | Homework (by subject); Study / test prep; Reading time; Online assignments; Projects & long-term assignments; Pack backpack / supplies; Parent-teacher forms; Tutoring sessions; Practice spelling/math apps |
| Habits & Daily Routines | Morning routine; Evening routine; Brush teeth (AM/PM); Shower / personal hygiene; Make lunch; Screen-free time; Gratitude or journaling; Tidy up before bed |
| Health, Fitness & Wellness | Sports practice; Exercise / outdoor play; Stretching / mobility; Drink water; Take vitamins/meds; Mental health check-in; Bedtime / sleep tracking |
| Personal Responsibility | Prepare clothes for tomorrow; Manage allowance; Track spending/saving; Care for personal items; Organize backpack/desk; Respect house rules; Follow screen-time limits |
| Goals & Skill Building | Practice instrument; Learn a new skill; Reading goals (books/month); Chore streak goals; Fitness milestones; Academic goals; Behavior goals; Behavior goals |
| One-Time / Special Tasks | Deep clean room; Help with event prep; Pack for trip; Babysit sibling; Help a neighbor; Seasonal chores; Special projects |
| Family & Social Commitments | Family events; Playdates; Birthday prep; Family meetings; Religious activities; Volunteer work; Travel prep |

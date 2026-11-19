# Functional Execution Results — Pass 3

**Inspection date:** 2026-11-17 (authenticated FamSync browser session; in-app modules retain `/dashboard`).  
**Actor:** signed-in Parent profile; Settings labels the same account Owner.  
**Purpose:** supersede empty-state assumptions in the initial inventory with observed saved-state workflows.  
**Evidence:** E-025–E-038 below. Screenshots were inspected inline but were not archived as files.

## Test data and operational boundary

The user authorized synthetic records and workflow state changes. Records prefixed `Codex QA -` and the `QA Seed Child` family profile are synthetic discovery data created in the authenticated FamSync workspace. No real invitations or emails were sent, no payments or account credentials were changed, and global privacy/settings controls were left at their observed values. A synthetic text attachment was uploaded to a folder and selected for a calendar event. The local fixture is temporary; the FamSync records remain saved for review.

The Child role shown by the UI is **Child (Limited access)**. This pass exercised item assignment and sharing from the Parent session. No Child credentials or second browser session were available, so the Child's actual read/write permissions and privacy enforcement were not verified.

## Execution evidence register

| Evidence ID | Module | Interaction and observed outcome | Confidence / limitation |
|---|---|---|---|
| E-025 | Tasks | Created `Codex QA - task lifecycle 2026-11-17`; edited its description; moved it To Do → In Progress → Completed. The completed filter showed the record and Completed count became 1. The task was private. | Confirmed from Parent session. The edit success toast said “Task Added Successfully!”; no notification or backend data was inspected. |
| E-026 | Tasks / permissions | Created `Codex QA - child assigned task 2026-11-17`, assigned to QA Seed Child, with Private unchecked. To Do count became 1; the card showed the Child avatar and had no private lock icon. | Confirmed saved record and Parent-session display; Child-session access not tested. |
| E-027 | Calendar | Created a private one-time event with title, note, location, date/time, and Parent assignment. The event appeared on Nov 20, 2026; event details showed location and Parent assignee. | Confirmed save toast and populated calendar/detail state. Note persistence after reopening was not checked. |
| E-028 | Calendar recurrence | Saved Daily and Monthly events with Nov 20 start and Nov 22/30 end dates, and a Weekly event with Monday selected. The calendar showed Daily and Monthly only on Nov 20 and the Weekly event on Nov 17 (Tuesday). No repeat instances were visible on the expected later dates. | Confirmed UI output; recurrence generation, date interpretation, and series storage remain unresolved. This is a possible defect, not a confirmed rule. |
| E-029 | Calendar / permissions | Created a non-private one-time event assigned to QA Seed Child with note, synthetic location, and a text attachment selected in the form. Nov 20 event details showed the Child assignee and location. | Save and assignee/location display confirmed. The attachment and note were not reopened after save; post-save persistence is unverified. |
| E-030 | Goals | Created a private Family goal with category, High priority, target date, and one subtask. Marking the subtask complete moved the goal to Completed Goal; completion count became 1 and average progress showed 100%. | Confirmed lifecycle transition and visible metrics from Parent session. |
| E-031 | Goals | Created a private Individual goal assigned to the Parent with category and Medium priority. Its card displayed `0 / 0 (%)` despite no subtasks. | Confirmed creation/card state. The 0/0 presentation is an observed display inconsistency; calculation semantics remain unknown. |
| E-032 | Goals / permissions | Created a shared Individual goal assigned to QA Seed Child, with Private unchecked and one subtask. The card showed the Child avatar and `0 / 1 (0%)`. | Confirmed saved record and Parent-session display; Child-session read/write access not tested. |
| E-033 | Channels | Created `Codex QA - family channel 2026-11-17` with topic and description; posted a synthetic message; added QA Seed Child. Channel details showed two members and their Parent/Child labels. | Confirmed save, post, membership, and details in the Parent session. Guest invitations/acceptance were not tested. |
| E-034 | Channels | Used Reply on the synthetic channel message to post a second synthetic response; liked the original message and its count changed from 0 to 1. | Confirmed visible reply and reaction count. Dislike and attachment controls were not exercised. |
| E-035 | Direct Messages | Started a direct message with QA Seed Child and sent a synthetic message. The conversation appeared in Direct Messages with the Child label and the sent text in its transcript. | Confirmed conversation creation and send in the Parent session; no recipient session, delivery, read receipt, or notification was verified. |
| E-036 | Folders | Created `Codex QA - standalone folder 2026-11-17` with description, uploaded a synthetic text file, then reopened the folder. It showed one file. Files filter, filename search, and Name A–Z sorting retained the result. | Confirmed save/upload/list/filter/search/sort from Parent session. The list did not update immediately after the upload toast; reopening showed the file. Download, sharing, and delete were not tested. |
| E-037 | Profile / family | Added synthetic QA Seed Child as Child (Limited access), age 12, through Profile → Family Information. The profile/family lists showed the new member. | Confirmed saved member record and role display. This did not establish that an account was activated or an invitation was delivered. |
| E-038 | Privacy / cross-member | Parent profile showed Everyone in my family for event/task/goal audiences; Private Mode remained enabled. Creation forms defaulted Private checked, while the shared Child task, goal, and event were saved with Private unchecked. Shared cards/details showed the Child assignee and no private lock. | Confirms UI controls and Parent view only. Cross-account visibility, selected-people mode, and effective privacy enforcement remain unverified. |

## Current module coverage

“Partially Verified” means at least one meaningful workflow was exercised, while at least one material behavior remains unknown. No module is marked **Verified** because the available session does not establish all discovered actions, failure paths, integrations, and role-specific access.

| Module | Coverage status | Verified in this pass | Still unverified / blocked |
|---|---|---|---|
| Dashboard | Partially Verified | Navigation destinations were followed in the earlier pass. | Populated dashboard counts, refresh behavior, loading/errors. |
| Tasks | Partially Verified | Create, edit, status transitions, private/shared records, member assignment, status counts. | Child-session permissions, full List interactions, validation/errors, archive/delete, notification behavior. |
| Calendar | Partially Verified | One-time and recurring saves, populated event details, location, Child assignment, attachment selection. | Recurrence output is inconsistent; attachment/note persistence after reopening, editing, validation, time-zone and notification behavior. |
| Goals | Partially Verified | Family/Individual creation, assignment, category/priority, subtask creation/completion, summary metrics. | Child-session permissions, edit flow, no-subtask progress semantics, validation and notifications. |
| Channels | Partially Verified | Channel create/details, member addition, message, reply, like reaction. | Guest invitation/acceptance, Child-session access, channel edit/permissions, attachments, notification/retention. |
| Direct Messages | Partially Verified | Conversation creation and message send to synthetic Child profile. | Child-session delivery/read state, attachments, group behavior, notifications. |
| Folders | Partially Verified | Folder create, upload, non-empty list, filter, search, sort. | Folder sharing/scope, download, edit/delete, access from another member, limits/security. |
| Family settings and profile | Partially Verified | Synthetic Child member created and role label confirmed. | Invite form delivery/revocation, role mapping/enforcement, profile edits, account actions. |
| Privacy / Private Mode | Partially Verified | Existing preference values and per-record Private state observed; shared records saved. | Cross-account enforcement, selected-person audience, precedence and state persistence. |
| Authentication / onboarding | Blocked | Signed-in root redirect observed. | Unauthenticated sign-in, registration, recovery, onboarding. |

## Follow-up needs

1. A controlled Child login/session is required to verify whether shared and private records, channel membership, and direct messages are actually visible/actionable as intended.
2. Product clarification is needed for the mismatch between the selected Monday recurrence and the calendar's Tuesday display, and for missing Daily/Monthly instances.
3. Reopen the saved event to confirm note and attachment persistence, and inspect event editing in a controlled environment.
4. Clarify the `0 / 0 (%)` goal-progress display and whether it should be treated as zero, complete, or undefined.
5. A test guest and explicit guest invitation are required to verify channel guest access without contacting a real person.
6. Read-only access to the original editor/backend is needed to confirm schema, authorization, notifications, integrations, and stored recurrence relationships.

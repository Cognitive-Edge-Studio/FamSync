# Document 07 — Roles and Permissions Matrix

## Evidence and role vocabulary

The UI exposes several role labels that cannot yet be treated as one hierarchy:

- **Parent** and **Child** are available in the Profile Settings → Add Family Member form; Parent is described as **Full access**, Child as **Limited access**.
- **Member** (default) and **Admin** are options in Settings → Invite person. Helper text says **Admins can invite people and manage Settings**.
- **Owner** appears beside the only member shown in Settings.
- **Guest** is described as someone who can only see channels they were invited to.

The profile for the signed-in account says **Parent**, while Settings says **Owner** (E-009). A synthetic **Child (Limited access)** profile was later saved and used as an assignee and channel member. This confirms only that a Parent session can create/select the profile; there was no Child login/session. The mapping between Parent/Child and Member/Admin/Owner and all cross-account authorization remain unverified. See E-026, E-029, E-032–E-035, E-037, E-038.

## Role-permission matrix

Legend: **Observed** = current signed-in UI exposed the screen/form; it does not prove a save endpoint will authorize it. **UI copy** = a help label states the capability. **Unknown** = not verified. Blank access must not be interpreted as denied.

| Operation / module | Current account (Profile: Parent; Settings: Owner) | Parent | Child | Member | Admin | Owner | Guest |
|---|---|---|---|---|---|---|---|
| Open Dashboard | Observed | Full access label; exact scope unknown | Limited access label; exact scope unknown | Unknown | Unknown | Current account could open; broader scope unknown | Unknown |
| Read family calendar/events | Observed empty Calendar | Full access label; exact scope unknown | Limited access label; exact scope unknown | Unknown | Unknown | Current account could open; broader scope unknown | Unknown |
| Create/read/update/delete events | Saved one-time/recurring events; Parent-side Child assignment and detail display observed; no edit/delete | Current Parent session could create/read; broader scope unknown | UI permits assignment; Child access unknown | Unknown | Unknown | Current account operations confirmed; role mapping unknown | Unknown |
| Read/manage tasks | Populated board/status filters and saved records visible | Full access label; exact scope unknown | Limited access label; Child access not tested | Unknown | Unknown | Current account could open and manage; broader scope unknown | Unknown |
| Create/read/update/delete tasks | Parent task created, edited, and transitioned; shared Child-assigned task visible in Parent session | Parent-session operations confirmed | UI permits assignment only; Child operations/access unknown | Unknown | Unknown | Current account operations confirmed; role mapping unknown | Unknown |
| Read/manage goals | Populated goal filters and progress cards visible | Full access label; exact scope unknown | Limited access label; Child access not tested | Unknown | Unknown | Current account could open and manage; broader scope unknown | Unknown |
| Create/read/update/delete goals | Family/Individual goals created; subtask completion changed state; Child-assigned shared goal visible in Parent session | Parent-session operations confirmed | UI permits assignment only; Child operations/access unknown | Unknown | Unknown | Current account operations confirmed; role mapping unknown | Unknown |
| Create channel | Channel saved; Child member added; message/reply/like tested | Parent-session creation confirmed | Added as channel member; Child-session access unknown | Unknown | Unknown | Current account creation confirmed; role mapping unknown | Unknown |
| Read channels | Populated channel and two members visible | Parent-session read confirmed | Added as member; actual access not tested | Unknown | Unknown | Current account read confirmed; broader scope unknown | **UI copy:** only channels invited to; enforcement unverified |
| Invite to channel / manage guests | Create-channel form exposed invite field; not submitted | Unknown | Unknown | Unknown | Unknown | Current Settings exposes allow-guests rule | **UI copy:** access is channel-scoped when allowed |
| Start/send direct message | Conversation with synthetic Child created and a message visible in Parent transcript | Parent-side create/send confirmed | Recipient-side delivery/read access unknown | Unknown | Unknown | Current account action confirmed; broader scope unknown | Unknown |
| Read/create folders and files | Standalone folder and file saved; file list/filter/search/sort exercised | Parent-session operations confirmed | Unknown | Unknown | Unknown | Current account operations confirmed; broader scope unknown | Unknown |
| Open Settings / family name / guest rule | Observed Settings screen | Unknown beyond full access label | Unknown | Unknown | **UI copy:** can manage Settings | Current account row shows Owner; scope unknown | Unknown |
| Invite a family person | Invite form opened; no invitation sent | Unknown beyond full access label | Unknown | Default invitation role; privileges unknown | **UI copy:** can invite people | Current account can open; exact role scope unknown | Unknown |
| Add family member | Synthetic Child profile saved and shown as Child (Limited access) | Parent-session creation confirmed | Child role label visible; activation and effective permissions unknown | Unknown | Unknown | Current account can create; mapping unknown | Unknown |
| Change personal visibility | Three audience choices visible; unchanged | Unknown beyond label | Unknown | Unknown | Unknown | Unknown | Unknown |
| Change password/email or sign out | Controls visible; not activated | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |

## CRUD and administrative certainty

- **Create:** Synthetic task, event, goal, channel, folder/file, family-member profile, and direct-message records were created from the Parent session. Settings invitation and guest flows were not submitted. Role-specific authorization is unknown.
- **Read:** Parent session read the saved records. A Child-assigned shared record appeared in the Parent view; no Child/Guest read session was available. Guest channel scope remains UI copy only.
- **Update:** A task description was edited and task status changed; goal subtask completion changed goal state. Profile/family settings values were not changed. Other record edit paths remain unverified.
- **Delete/archive:** Red trash controls were visible on some saved items but were not activated. Archive was not tested; delete/archive permissions and recovery are unknown.
- **Administrative operations:** Admin helper text explicitly states invitation and Settings management. Parent/Child access scope is only described as full/limited; no exact module permissions were tested.
- **Ownership/privacy:** Items marked Private are described as visible only to the owner. The separate family-wide visibility choices and Private Mode defaults need reconciliation. No cross-user checks were available.

## Verification gaps requiring additional access

1. A Child login/session plus controlled Member, Admin, Owner, and Guest identities are needed to compare screens and enforcement. The saved synthetic Child profile was not an authenticated Child session.
2. Product owner must clarify whether Parent/Child and Member/Admin/Owner are separate dimensions.
3. To verify shared tasks/events/goals and selected-people privacy, the family needs at least two controlled members.
4. To verify guest access, channel invitations and test guest acceptance need a non-production or explicitly authorized workflow.
5. Backend authorization rules must be reviewed independently; visible controls alone do not prove data access restrictions.

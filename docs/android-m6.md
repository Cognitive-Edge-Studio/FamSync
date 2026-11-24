# Android M6: Family Base

Implemented locally on 24 November 2026; not deployed. Scope: M6 in the [Android and chat spec](android-app-spec.md), using the existing [real graph](family-base-real-graph.md) and [entry APIs](family-base-entries.md). Physical-phone testing remains deferred at the user's request.

## Action audit

| Web action | Android |
|---|---|
| Explore the real graph | Searchable, virtualized list with connected-record detail screens |
| Search and filter | Names, notes and locations; nine record kinds; direct connections to a selected person |
| Open connected work | Native family, task, goal, event, chat and file screens |
| Memories, places and ideas | Create, read, edit and delete; only the author can edit or delete |
| Audiences | Family, selected members or only me; new entries use the server's default audience |
| Entry connections | People, goals, events and other entries; up to 50 links, with a searchable picker |
| Concurrent edits | Version conflict notice, use latest or merge personal changes over the latest version |
| Lost create response | Retry the same UUID; recover the saved entry and retain newer draft changes for an explicit update |
| AI questions, maps and entry photos | Outside the approved Android scope |

## Behavior

- Graph and entry reads use the authenticated API and its existing access rules. Connections appear only when both endpoints are readable. A connection does not share its target. There are no server-provided navigation URLs.
- Family Base reads bypass the persistent read cache. Browse and detail data clear on leaving the screen, reload on focus and foreground, and refresh once a minute while active. A failed refresh can retain the last result on the current screen with a stale notice; a denied request clears it. Forms retain unsaved drafts in memory, including through temporary connection failures; they are not saved across app restarts.
- Search covers the bounded graph returned by the API. A notice identifies capped record kinds, and native module screens remain available for more records. The picker shows 30 matches at a time. Readable existing links outside the graph cap remain editable; server rules preserve existing links hidden from the caller.
- Dates on memories are civil dates, displayed without shifting across family time zones. Place location text and memory dates are normalized when changing kind. Selected audiences exclude the author and departed members.
- Editing returns to the existing detail screen after saving. The browser check caught and verified a fix for duplicate detail screens after repeated edits. Creation and recovery open the created detail screen. Delete requires confirmation and the current version.

No API, database schema or shared-client changes were needed. The deployed web graph and entry APIs remain an M6 staging prerequisite; these checks used local services, and no deployment was performed.

## Basic checks

- All 57 mobile tests passed, including 11 new tests covering filters, visible connections, native routes, civil dates, audience normalization, entry validation, conflict merging and lost-create comparison.
- Mobile TypeScript passed after the final navigation change.
- The Android Hermes bundle passed with one Metro worker after closing the temporary preview and browser.
- All six existing Family Base graph API tests and the database `family-entries-access.sql` assertions passed.
- A browser-preview workflow at 390 × 844 passed private entry creation, access denial for another member's private record, native goal navigation, a real version conflict and merge, conversion to a selected-audience place, selected/unselected member access, location search, kind filtering, hidden-record search, recovery after a committed create response was dropped, and deletion. It verified one saved entry after the retry and retained the newer title. The local fixture entries were removed afterward.
- Screenshots and runnable workflow scripts are under `output/playwright/m6-*`. Browser console failures correspond to deliberately denied reads, the version conflict, the dropped response and deleted records; no application exception was observed.

The browser preview exercises the Expo web target, not a physical Android installation. No APK was produced.

## Deferred acceptance and next work

- Install a development APK and check native keyboard/back behavior, accessibility, scrolling, date selection, offline/foreground behavior and revocation while screens are open.
- Deploy and verify the graph and entry APIs in staging, then repeat multi-account acceptance against that environment.
- Finish the shared staging prerequisites, Firebase/push configuration and physical-device media and push acceptance before external testing. The [minimum supported app-version gate](android-version-check.md) is now implemented locally; its staging and device checks remain.

M6 is the last planned development milestone in this spec. M0–M6 now have local implementations; staging, device acceptance and beta readiness remain outstanding. No M7 has been defined.

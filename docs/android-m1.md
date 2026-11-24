# Android M1: everyday family work

Implemented locally on 24 November 2026; not released. Scope: M1 in the [Android and chat spec](android-app-spec.md). Builds on [M0](android-m0.md).

## Action audit

Every action on the web Today, Tasks, Calendar and Goals screens. Exclusions and adaptations need client approval.

| Web action | Android |
|---|---|
| Today: plans, week, due and overdue work, task status and undo | Included |
| Today: family progress chart per member | Adapted: the three first active goals with progress |
| Today: switch between my and family tasks | Adapted: on Tasks |
| Tasks: mine/family, open, overdue, completed, archived, counts, load more | Included |
| Tasks: board | Included, swiped sideways |
| Tasks: drag a card between columns | Adapted: the status menu on each task |
| Tasks: cover pictures | Excluded, decorative |
| Task: create, suggested titles, repeat with server preview, due date and time, audience, assignee, reminder, linked event | Included |
| Task: edit one, edit one occurrence, edit the series, status with undo, archive and restore | Included |
| Task: source chat message | Excluded until chat is on Android (M2) |
| Calendar: month and agenda, previous, today, next | Included, plus a day view |
| Event: create, all day, repeat with server preview, location, note, audience, reminder | Included |
| Event: attach a file when creating | Excluded until M3; opening an existing attachment is included |
| Event: linked tasks, add a linked task, move or cancel one occurrence, move linked tasks along | Included |
| Event: edit details of an existing event | Not on web either; there is no API for it |
| Event: linked chat messages | Excluded until M2 |
| Goals: filters, summary, create, edit, archive, restore, complete, reopen, numeric progress | Included |
| Goals: steps add, complete, rename, remove; link and unlink tasks | Included |

## How it works

- **Server rules:** recurrence, previews, permissions and family time zones come from the API. Date, task, goal, reminder and form rules are shared with web in `packages/core`.
- **Conflicts:** a save refused because someone else changed the item keeps everything typed and shows what is saved now. "Keep my changes" saves only the fields the person touched and takes the latest for the rest. Leaving a form with unsaved text asks first.
- **Offline:** screens opened before can be read for seven days, and say so. Changes need a connection. The app opens offline even after its sign-in token has expired, because the server refuses that token for anything new.
- **Saved data** is kept per account and family in the app's private storage, outside device backups. It is removed on sign-out, when the account or family changes, and when the server says access has ended. It is not encrypted beyond Android's own storage encryption.
- **Retries:** new items keep one ID per form, so trying again cannot create a second copy.

## Verified

Type check, 19 mobile unit tests, an Android bundle with one React, the web build, 36 API tests and 19 database test files. On screen through Expo's web target, against the local API: create with preview, status and undo, discard prompt, task and goal conflicts with another session, month/day/agenda, a repeating event, moving an occurrence with its linked task, cancelling one, goal steps and task linking, offline reading and refused offline changes, switching accounts, and a private task staying hidden from another member. Dates were checked in the family's zone (America/Chicago) from a computer in another zone.

## Not verified

- **Nothing has run on Android.** The offline store (SQLite), UUID generation, the system back button with the discard prompt, keyboards, TalkBack and large text are untested on a device. The web target keeps saved data in memory only, so reading after a restart is covered by unit tests alone.
- Chore series editing and archiving, numeric and manual goals, and opening an attachment were not exercised on screen.
- Android's own date and time formatting may differ slightly from the browser's.

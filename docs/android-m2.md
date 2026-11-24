# Android M2: chat

Implemented locally on 24 November 2026; not released. Scope: M2 in the [Android and chat spec](android-app-spec.md). Builds on [M1](android-m1.md) and web chat [W1](chat-w1.md), [W2](chat-w2.md) and [W3](chat-w3.md). No API or database change was needed.

## Action audit

Every action on the web chat screens. Exclusions and adaptations need client approval.

| Web action | Android |
|---|---|
| Chat list: newest first, pinned, previews, unread, muted, find, channels or direct | Included |
| Chat list: pin, mark unread or read, archive for me | Included, by holding a chat |
| New direct message, new channel, edit channel and members | Included |
| Channel picture | Excluded until M3 |
| Guest access to a channel, guest channels | Excluded until M3 |
| Admin roles, handover, leave, mute, archive or restore for everyone | Included |
| History, unread line, jump to a message, jump to latest | Included |
| Send with states, retry, discard, edit a refused message, drafts | Included |
| Reply, mention, react, see who reacted, copy, forward, star, pin | Included, by holding a message |
| Edit (15 minutes), delete for everyone (48 hours), message info | Included |
| Receipts, typing, online and last seen | Included |
| Receipt and presence privacy settings | Excluded until M3 (settings) |
| Search all chats or one, starred messages | Included |
| Attach photos, files, a saved file; upload progress, cancel, retry | Included, plus the camera |
| Photos in the conversation | Included, with a larger view |
| Other files | Adapted: opened by another app on the phone |
| Voice and video: play in the conversation, record voice | Excluded until M5; they open as files |
| Create a task from a message, link an event, unlink | Included, without the optional reminder |
| Task and event: source chat message | Included (left over from M1) |
| Notifications for messages | Excluded until M3 (in-app) and M4 (push) |

## How it works

- **Shared rules:** previews, receipts, grouping, mentions and the send queue are in `packages/core` and tested there. Web now uses its message text and attachment labels; its own send queue was left as it is.
- **Sending:** each message has one ID from the moment it is written. An unconfirmed message is sent again with the same ID, on return to the app, on opening the chat, and every 15 seconds while the chat is open. The server stores it once. A message the server refuses is not sent again by itself.
- **Live updates:** one connection, closed in the background and opened again in front. Signals carry no content; data always comes from the API. Without a live connection an open chat checks every 15 seconds and the list every 20.
- **Reading:** a message counts as read only when the newest one is on screen and the app is in front. Opening at the first unread message, or at a search result, does not mark later ones read.
- **Offline:** the chat list and the last 50 messages of each chat opened can be read for seven days. Drafts and unsent messages stay until sent or discarded.
- **Losing access:** a chat's saved messages, unsent messages and draft are removed when the server refuses that chat, whether it is open or not. Saved chats missing from the list are checked when the app opens or returns, and at most once a minute while it is in front. All saved chat data goes on sign-out or account change.
- **Photos** are resized to 2048 pixels and re-encoded, which leaves out their location. The camera permission is asked for on first use; choosing photos needs no permission. Microphone access is blocked until M5.

## Verified

Type check, 31 mobile unit tests, an Android bundle with one React (19.3.0) and the web build. On screen through Expo's web target, with a second account acting through the API:

- Messages both ways, live arrival within a second, typing, online, last seen, sent and read ticks, mentions.
- A lost response and a send while offline each ended with exactly one message, without pressing Retry.
- Reply, reaction, star, pin, forward to two chats, edit keeping the unsent draft, delete, message info.
- A task made from a message and an event link, and the way back from both.
- A photo and a PDF sent together; an unsupported file refused with a reason.
- Search and opening a result 225 messages back; starred messages; draft kept after leaving.
- Opening at the first of 25 unread messages left all 25 unread until the newest was shown.
- Channel create, rename with a member added, admin role, mute, archive and restore for everyone, leave; pin and archive for me.
- Saved messages shown offline. A member removed while the chat was closed, and again while it was open, lost the chat, its draft, its search results and its place in the list.

Fixed during testing: the chat list reloading without end, messages marked read on opening a long unread chat, far jumps stopping short, and a brief duplicate row as a sent message arrived.

## Not verified

- **Nothing has run on Android.** SQLite storage, camera, photo and document pickers, native upload, opening files, keyboard behavior, system back, TalkBack, large text and live updates over a phone network are untested on a device. The web target keeps saved data only in memory, so restarting with unsent messages was not tested on screen.
- Checked at 375 and 320 points wide only. Screen-reader labels were read from the page, not heard.
- Guest accounts, upload cancel and retry, handover, unlinking, conflicting channel edits and the larger photo view were not exercised on screen.
- API and database tests were not run again, because neither changed.
- More than 500 chats: only the newest 500 are listed.

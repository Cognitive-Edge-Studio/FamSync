# Chat W2: message actions, groups and uploads

Implemented locally on 23 November 2026; not deployed. Scope: W2 in the [Android and chat spec](android-app-spec.md). Builds on [W1](chat-w1.md).

## Defaults used, awaiting the client

| Decision | Used now | Where |
|---|---|---|
| Edit window | 15 minutes | `app.edit_message` and `editableUntil` in `channels.service.ts` |
| Delete window | 48 hours | `app.delete_message` and `deletableUntil` |
| File limit | Unchanged: 5 MB, existing types, five per message | `file-validation.ts`, `stored_files` check, `chat-upload.ts` |
| Pinned messages | Three per conversation, any family member | `app.pin_message` |

Larger files are the only W2 item not delivered; the limit depends on the storage decision.

## What it does

- **Edit and delete:** author only. Deleting blanks the text in the database and removes mentions, reactions, pins, stars, alerts and file links. Replies, search, previews and linked work show no deleted text. A late send retry cannot restore it.
- **Files sent from the chat** go to the conversation's "Chat files" folder, created when needed. Deleting a message archives its files there unless another message uses them; the file itself stays in storage and can be restored from the archive by its uploader.
- **Forward:** up to five chats in the same family. Files are copied using the sender's own access.
- **Reactions:** any single emoji, one per person, with who reacted.
- **Pin** for everyone, **star** privately, and a starred list.
- **Chat list:** pin, mark unread and archive for yourself. Channel archive for everyone is unchanged.
- **Groups:** several admins, handover, and leaving. The last admin cannot leave an active channel. Admins can do what the manager could, including guests; only the manager can hand over, and the manager cannot be removed by an admin. Guests can leave and cannot become admins.
- **Uploads:** paste, drag or choose several files, with progress, cancel and retry. Text is optional when a file is attached.

## Deployment order

Migration `20261203000000_add_chat_actions.sql`, then the API, then the web app. Deploy API and web close together: an open older web page cannot show the new actions and shows a deleted message as empty.

## Verified

All 17 database access-test files, 31 API unit tests, API checks with three local accounts (including parallel first uploads and parallel forwards), and the local preview: paste upload, refused file type, photo-only message, edit with draft kept, star, pin, custom reaction and who reacted, forward, delete, list options, leaving, last-admin refusal, and phone width.

## Not verified or known limits

- Hosted staging, a real phone, a screen reader, dragging real files from the desktop, guests in the browser, and role changes through the menu (checked through the API only).
- Starring on one device appears on another after a reload.
- Cancelling an upload that had already arrived leaves the file in "Chat files".

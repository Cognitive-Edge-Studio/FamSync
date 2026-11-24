# Chat W1: WhatsApp-like feel on web

Implemented locally on 23 November 2026; not deployed. Scope: W1 in the [Android and chat spec](android-app-spec.md).

- One **Chats** list for channels and direct messages, newest activity first, with last message, time and unread. Filters: All, Channels, Direct, Archived. `/channels/` and `/messages/` still work.
- Enter sends, Shift+Enter adds a line; on touch keyboards Enter adds a line.
- Messages appear at once and are sent in order. Each keeps its ID until saved or discarded. Only a message the server refused can be edited, so an uncertain send cannot become a duplicate by editing.
- Drafts and unsent messages are kept per account and conversation on the device, and removed on sign-out or loss of access.
- Day and unread separators, sender grouping, links, `@` mentions, emoji, copy, replies to replies, jump to original and from search, inline photos.
- Updates fetch only changed messages: `GET …/messages?changedSince=&from=`, using `latestChange` and `nextChange`.

## Deployment order

Migration `20261202000000_add_chat_changes.sql`, then the API, then the web app. The readiness check requires the new table. The channel list is now ordered by newest activity for every client.

## Verified

All 16 database access-test files, 31 API unit tests, API checks with three local accounts (including parallel sends, duplicate IDs and parallel task links), and the local preview in a browser: send, mention, lost response, refused send and edit, draft restore, reaction on an old message, jump, photo, access removal, sign-out, phone width and dark mode. One live message appeared promptly with the local job runner attached.

## Not verified or known limits

- Hosted staging, the guest screen in a browser, a real phone, a screen reader, and two tabs editing the same draft.
- Discarding an uncertain message does not recall it if it had arrived.
- Opening an old message loads every page back to it.
- A conversation with more than 50 unread messages opens at the oldest loaded one, until earlier messages are loaded.

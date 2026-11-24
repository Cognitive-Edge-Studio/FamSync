# FamSync Android app and chat spec

**Date:** 23 November 2026; progress updated 24 November 2026. **Status:** Draft for client review. [W1](chat-w1.md), [W2](chat-w2.md), [W3](chat-w3.md) and [W4](chat-w4.md) and Android [M0](android-m0.md), [M1](android-m1.md), [M2](android-m2.md) and [M3](android-m3.md) are implemented locally, not deployed. [M4 push](android-m4.md), [M5 voice/video](android-m5.md) and [M6 Family Base](android-m6.md) have local implementations and basic checks; staging deployment, Firebase setup, an APK and physical-device acceptance remain pending. Device testing was deferred by the user. M6 is the final planned development milestone; beta readiness is still outstanding. Larger files in W2 await the media decision.

The subsequent [UI and motion polish](android-ui-polish.md) improves Today, More, sign-in and shared controls, using Reanimated and native navigation transitions with reduced-motion support. It is implemented locally; native-device acceptance is still pending.

**Decided:** Expo (React Native), Android only for now, covering the **whole platform**. The client also wants chat with WhatsApp-like features. A 23 November code review found the web chat does not provide them yet, so chat is built **web and API first** (section 3), then on Android.
**Scope change:** the [implementation plan](implementation-plan.md) defers native apps and web push until after the pilot. Approving this spec changes that order.

## 1. Outcome

A family member signs in on an Android phone, manages their family's day, tasks, calendar, goals, files and conversations, and is notified when something needs attention. Everything a web user can do is available on Android unless listed as an exception below. Chat gains its WhatsApp-like features on web first, on an API both apps share.

**Success:** testers complete the acceptance scenarios in section 6 on a physical Android phone. Reliability and adoption targets are to be set with the client before the beta.

### Not in this release

- iOS. Avoid needless Android-only code, but do not build or test iOS.
- Voice/video calls, status/stories, disappearing messages, end-to-end encryption.
- AI features. Web has AI questions in Family Base, switched off and not deployed; Android excludes them as an approved exception. See the [unresolved under-18 terms concern](family-base-ai.md).
- The public marketing landing page.
- WhatsApp branding or look. FamSync keeps its own visual system.

## 2. Current state

| Area | What exists | Consequence |
|---|---|---|
| API | Separate NestJS service under `/api/v1`, Bearer tokens | Mobile can use it directly |
| API client | `packages/api-client`, TypeScript source using `openapi-fetch` | Shared; React Native compatibility must be proven first |
| Conversations | List, DM, create, history, replies, reactions, read position, mute, search, mentions, up to five files | Server rules are reusable |
| Conversation list | Name, unread and positions, but **no last message preview or time** | Needs an additive API field for a WhatsApp-like list |
| Posting | Client supplies the message UUID; body required, 1–4,000 characters. An identical repeat is accepted once; the same UUID with different content is refused | Safe retry exists if the UUID is kept. The web app makes a new UUID when the draft is edited, so a lost response can still cause a duplicate. Media-only messages need an API change |
| Replies | Only to original messages; the server refuses a reply to a reply | Server rule must change |
| Groups | Single manager; no leave or manual handover; archive applies to everyone | New API and database work |
| Files | 5 MB; PDF, JPEG, PNG, WebP, TXT, CSV; an upload needs a conversation folder | Larger media, audio and video need new validation and storage rules |
| Alerts | Direct messages and mentions only | Ordinary group messages alert nobody |
| Edit/delete | No endpoints | New API and database work |
| Live updates | Supabase Realtime private "refresh" broadcasts with no content, one topic per conversation and user, sent by an Inngest job; clients also refresh every 15 seconds and reload all loaded history each time | Reusable signal, but delivery and reloads must be lighter. Receipts, typing and presence need new signals |
| Push | No web-push or service-worker code found | New |
| Auth | Supabase with PKCE; email and Google; callbacks derived from the web origin | Mobile deep links need new redirect URLs |
| Environments | Staging was verified on 19 November 2026; see [staging status](staging-status.md). Later work, including the one-family limit and Family Base, is not deployed there. Inngest, Realtime and email are listed as unfinished | Deploy current work and finish Realtime and Inngest before W1 staging tests; finish email before M3 |
| Family Base | Real graph, memories, places and ideas work locally on web and Android; not deployed | M6 basic checks passed locally; staging and device acceptance remain |

## 3. Version 1 scope

### Chat gap

Reviewed in code on 23 November 2026, before W1. All rows are now implemented locally, except larger files.

| Area | Exists | Missing or partial | Phase |
|---|---|---|---|
| Chat list | Unread, name search, mute label | Last message and time, newest first, one combined list | W1 |
| | | Pin chat, mark unread, personal archive | W2 |
| Sending | Text, files | Enter to send, instant bubble, per-message sent/failed and retry, saved drafts, clickable links, emoji picker | W1 |
| Reading | Own/other bubbles, older history | Day and unread separators, sender grouping, reply to a reply, jump to original | W1 |
| Mentions | Checkbox list | Type `@`, inline highlight | W1 |
| Search | In one or all chats | Jump to the message in its chat; direct-message names in results | W1 |
| Media | Up to 5 files, image preview | Inline photos | W1 |
| | | Paste/drag, upload without a folder, larger and media-only messages | W2 |
| Actions | Link task or event, five reactions | Copy | W1 |
| | | Edit, delete, forward, pin, star, any emoji, who reacted | W2 |
| Groups | Manager, guests, image | Leave, several admins, handover | W2 |
| Status | Read position stored | Ticks, seen by, typing, online | W3 |
| Voice and video | None | Voice notes, video | W4 |
| Alerts | Inbox for direct messages and mentions | Group alerts | W3 |
| | | Browser push | W4 |

Text formatting, link previews, polls, location, contact cards, and media/links/docs filters are later candidates.

### W1 — Web chat feel (implemented locally, see [results](chat-w1.md))

- One chat list for channels and direct messages inside the existing grouped sidebar, newest activity first, with last message and time limited to what the caller may read. Guests keep their restricted view.
- Enter sends, Shift+Enter adds a line. Messages appear at once with sending, sent, failed and retry states; the message keeps one UUID until it is sent or discarded.
- Drafts are saved per account and conversation on the device and removed on sign-out or loss of access.
- Day and unread separators, sender grouping, clickable links, `@` mentions, copy, emoji picker, replies to replies, jump to original, jump from search, inline photos.
- Fetch only new and changed messages, instead of all loaded history. Add a change marker to the API so reactions, and later edits and deletions, are not missed.

### W2 — Core message actions (implemented locally except larger files, see [results](chat-w2.md))

- **Edit:** author only, marked "edited". Proposed window: 15 minutes.
- **Delete for everyone:** author only, leaves a placeholder. Proposed window: 48 hours. Replies, search, notifications and linked work must not expose deleted text.
- Forward only to conversations the sender may post in; recheck access to attached files.
- Pin for the conversation; star privately. Any single emoji reaction, with who reacted.
- Personal chat pin, mark unread and personal archive.
- Leave group, several admins and manager handover. A group always keeps an admin unless it is archived.
- Paste/drag upload without choosing a folder, larger files, previews, progress, cancel, retry, and media-only messages, within the agreed limits.

### W3 — Live status and alerts (implemented locally, see [results](chat-w3.md))

- Send the live signal right after commit, with the existing job as fallback.
- Sent, delivered and read indicators and group "seen by", with a privacy setting. "Delivered" is a new per-device acknowledgement, not inferred from a broadcast.
- Typing and online/last seen. Typing is transient and not stored.
- In-app alerts for ordinary group messages, subject to mute.

### W4 — Voice, video and browser push (implemented locally at 5 MB, see [results](chat-w4.md))

- Voice notes: record, preview, cancel, send, play and seek. Video within the agreed limits.
- Browser push under the same rules as Android push in M4.

### Platform coverage

| Module | Web routes | Android behavior | Milestone |
|---|---|---|---|
| Accounts | `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `auth/callback` | Native forms and deep links | M0, M3 |
| Families | `families`, `family`, `join` | Default family only: settings, members, invitations, ownership; create or join only when the user has no family | M0, M3 |
| Today | `today` | Due work, agenda and progress, phone-first | M1 |
| Tasks | `tasks`, `task` | List and status board, create/edit, recurrence, reminders, links | M1 |
| Calendar | `calendar`, `event` | Agenda, day and month; create/edit and recurrence | M1 |
| Goals | `goals`, `goal` | Progress and linked tasks | M1 |
| Chat | `channels`, `channel`, `messages`, `message`, `direct` | Web chat after W1–W3; voice and video after W4 | M2, M5 |
| Files | `folders`, `folder` | Browse, upload, camera/gallery, preview, share | M3 |
| Guests | `guests`, `guest-channel`, `join-channel` | Invite, join and restricted chat | M3 |
| Notifications | `notifications` | Inbox, preferences and push | M3, M4 |
| Account | `account` | Profile, privacy, theme, preferences | M3 |
| Family Base | `family-base` | Searchable list/2D view of real data, including memories, places and ideas | M6 |

Before each milestone, audit its web screens and record every action as *included*, *adapted* or *excluded with approval*. This table is based on routes, not yet on an action-by-action audit.

### M0 — Android foundation (implemented locally, see [results](android-m0.md))

- `apps/mobile`: Expo, TypeScript and Expo Router in the existing npm workspace. Pick the current stable Expo SDK at implementation; React versions must not break `apps/web`.
- Email/password sign-in, sign-out and session restore. Secure device storage for tokens; nothing sensitive in logs.
- One default family per user, opened automatically. **No family list or switcher is shown.** Use the first family returned by the API, remember it per account, and choose again only if access is lost. Clear cached data when that happens or the account changes.
- The web app also hides switching (done 23 November 2026) but stores its default per browser (`apps/web/src/lib/default-family.ts`). Store the default on the server so web and Android agree; this API and web change is part of M0.
- Navigation, light/dark FamSync tokens, loading/empty/error/offline states, system back button.
- Navigation for every module; modules not yet built are hidden in testers' builds.
- Read-only Today screen as the first real data screen.

Sign-up, password recovery and Google sign-in stay on the web in M0. They move to mobile in M3.

### M1 — Everyday family work (implemented locally, see [results and action audit](android-m1.md))

- Today, Tasks, Calendar and Goals with the same permissions as web.
- Use server recurrence and family time-zone rules; do not reimplement them in the app.
- Surface version conflicts without losing the user's draft.
- Read cached recent data offline; edits require a connection in this release.

### M2 — Chat on Android (implemented locally, see [results and action audit](android-m2.md))

- Matches web after W1, W2 and W3, on the same API. Cannot complete before them.
- History, sending with states and retry, replies, reactions, mentions, search, mute, message actions, media, groups, receipts, typing and presence.
- Reconnect, refresh on foreground, read position and unread counts.
- Cached recent conversations readable offline, removed on sign-out or loss of access.
- Camera, gallery and file attachment.

### M3 — Files, family and account (implemented locally, see [results and action audit](android-m3.md))

- Folders and files: browse, upload with progress, preview, download and share sheet.
- Family settings, members, invitations, ownership transfer, guests and guest channels.
- Notification inbox and preferences, profile, privacy and theme.
- Sign-up, recovery, Google sign-in and invitation deep links.
- Destructive actions require confirmation and show their consequences.

### M4 — Push notifications (local implementation; [device acceptance pending](android-m4.md))

- FCM push through a development build (Expo Go on Android does not support remote push).
- Device registration, token rotation, and removal on sign-out; invalid tokens are retired.
- Respect mute, existing notification preferences and family/channel access **at send time**.
- Push is sent only for the default family; the device registers that family with the server. Tapping opens the correct item, or a safe message if access was lost.
- Lock-screen text defaults to generic ("New message") until the client chooses previews.
- Push for the notification types supported by web, including tasks, events and messages.

### M5 — Voice and video on Android (implemented locally; [device checks deferred](android-m5.md))

- Matches W4, with native recording and playback.

### M6 — Family Base (implemented locally; [results and deferred checks](android-m6.md))

- Requires the web graph and entries to be deployed.
- Search, filters, connected records and links into the native module screens.
- Family-authored memories, places and ideas, with the same audiences as web.

## 4. Technical rules

1. The API remains the only authority for access. Mobile never reads the database directly.
2. API changes are additive, regenerate `packages/api-client`, and keep the current web app working.
3. Schema changes extend the access tests in `supabase/tests`. Guests are tested explicitly.
4. Broadcasts and push payloads stay content-light; the app fetches authorized data.
5. Installed apps update slowly. The [minimum supported version check](android-version-check.md) is implemented locally and basic-tested; deploy its API endpoint before distributing the next APK, and verify it on a phone before external testing.
6. Media limits, formats and retention are agreed before W2; video and voice are not assumed to be accepted by current file validation.
7. Use staging with test accounts, never production family data, for development.

## 5. Testing and delivery

W1–W4 are checked with access tests, API checks and two accounts in browsers, locally and then on staging.

| Stage | Method | Limitation |
|---|---|---|
| M0–M3 | Type check, Android bundle, Expo Go on a phone | On-screen behavior needs a person with a phone until an emulator is installed |
| M4 onward | Development build via local Android SDK or EAS | EAS uploads code to Expo and needs account approval |
| Beta | APK or Play internal testing | Play needs a developer account and privacy disclosures |

On this machine Node 24 and Java 21 were found; the Android SDK was not found in its default location and `adb` was not on the path. Check the chosen Expo release's Java requirement before local builds.

Check Play policies on account deletion, user-generated content reporting/blocking and data safety before beta.

## 6. Acceptance scenarios

**W1**
- A new message moves its chat to the top with the correct preview; no preview appears for a conversation the user cannot read.
- Losing the connection during send, then retrying, leaves exactly one message. A draft survives leaving and returning.
- Live updates do not reload history already loaded, and reactions on older loaded messages still update.

**W2–W3**
- Permission, edit/delete window, replay and conflict cases are tested through the API, including guests.
- Deleted content is absent from history, previews, replies, search and subsequent notifications.
- The last admin cannot leave a group without handover or archiving.
- Two browsers see messages, ticks and typing without waiting for the 15-second refresh; a target time is set with the client. With the live signal off, the fallback still delivers.
- Privacy settings suppress the corresponding receipt and presence signals.

**W4**
- Oversized or unsupported media is refused clearly; muted conversations and removed members receive no push.

**M0**
- Valid sign-in shows the correct families; invalid sign-in shows a clear error.
- Restarting keeps the session; expired sessions return to sign-in; sign-out removes local session data.
- A user with several families sees only the default and no switcher. Losing access to it, or changing account, never shows the old family's records.
- A user without families sees a useful empty state. Offline failure offers retry.
- Web, API and Android bundle builds succeed.

**M1**
- Create, edit, complete and reopen tasks; recurring tasks and events match the web result across time zones.
- Private records remain hidden from other members on Today, search and caches.
- A conflicting edit made on web is reported on Android without overwriting it.

**M2**
- Two accounts exchange messages between web and Android, including replies and reactions.
- Connection loss during send ends with exactly one message after retry.
- A removed member cannot load, search, cache or receive that conversation after the app next checks access.
- Large text, screen reader labels, keyboard and back behavior work on a small phone.

**M3**
- Upload interruption can be retried; inaccessible or archived files cannot be opened.
- Member, guest and owner accounts see only their allowed actions.
- Invitation links work when signed in, signed out and expired.
- A user who already has a family is told only one family is supported; the invitation is not silently accepted or discarded. (Done in the API and on web, 23 November 2026: status 409.)

**M4**
- Background and closed-app notifications open the right conversation.
- Muted conversations, removed members and signed-out devices receive no push.

**M5**
- Recording, interruption, cancel and playback work on a physical phone; denied microphone permission is handled.

**M6**
- A record or link hidden from the user on web is also hidden on Android, in search and in caches.

## 7. Delivery order

**W1 → W2 → W3 → M0 → M1 → M2 → M3 → M4**, then **W4 → M5**, then **M6**. If staffing allows, M0 and M1 can run alongside W1–W3, since they do not depend on chat. M2 waits for W1–W3 so chat is not built twice. **Platform parity (except push, voice/video and Family Base) is reached at M3; the recommended first client beta is M4.** Each stage ends with a working build and recorded results. Effort estimates follow the answers below and the M0 compatibility check.

This folder is not currently a Git checkout, but staging was deployed from a Git repository (commit `15c18bd` in [staging status](staging-status.md)). Reconnect that history before W1 instead of starting a new one.

## 8. Open decisions

| Decision | Owner | Proposed default | Needed before |
|---|---|---|---|
| Confirm chat and Android move ahead of the pilot | Client | Yes | W1 |
| Reconnect the existing Git repository | Product owner | Yes | W1 |
| Build web chat before Android chat | Client | Yes | W1 |
| One combined chat list | Client | Yes, keeping the grouped sidebar | W1 |
| Alert on ordinary group messages by default | Client | Yes, with mute | W3 |
| Deploy current work and finish staging Realtime and Inngest | Engineering | Yes | W1 staging tests |
| Members already in several families, and invitations to a second one | Client | Web and Android both hide switching, so a second family is not reachable through navigation; the API now refuses new second families. Decide how an owner leaves or merges a family to join another | M0 (invitations: M3) |
| Minimum Android version | Client/engineering | Chosen Expo SDK's minimum | M0 |
| Approve platform coverage and exceptions | Client | Section 3 table | M0 |
| First beta milestone | Client | M4 | M0 |
| Offline expectation | Client | Read recent data; retry message sends; other edits online only | M1 |
| Application ID and Firebase/Play owners | Client | Client-owned accounts | M3 |
| Show message text on lock screen | Client | No | M4 |
| Edit and delete windows | Client | 15 minutes / 48 hours | W2 |
| Media limits and retention | Client/engineering | Decide from storage cost | W2 |
| Read receipt and last-seen defaults | Client | Opt-out available | W3 |
| Are calls expected later? | Client | Excluded | W1 scope sign-off |

# Chat W4: voice, video and browser push

Implemented locally on 24 November 2026; not deployed. Scope: W4 in the [Android and chat spec](android-app-spec.md). Builds on [W1](chat-w1.md), [W2](chat-w2.md) and [W3](chat-w3.md).

## Voice and video

- **Voice messages:** record, listen, record again, discard and send; play, pause and seek. Up to ten minutes. Nothing uploads before Send, and a failed upload can be retried without storing it twice. Recorded as AAC/MP4 where the browser can, otherwise Opus/WebM.
- **Video:** MP4 and WebM, loaded only when someone presses Play.
- **Limit unchanged: 5 MB per file.** About 20 minutes of voice at the bitrate used, but only a short video clip. Larger files still depend on the storage decision. Nothing is converted on the server.
- Recordings and video follow the same access, forwarding and deletion rules as other chat files.

## Browser push

- Account → Notifications → Push on this device. Covers every in-app notification: messages, mentions, reminders, assignments and schedule changes.
- **Checked as the recipient at send time:** the notification still exists, is unread, under a day old and visible to them; the chat is not muted; and it belongs to the family registered for that browser. Quiet hours make push silent rather than holding it.
- **Lock-screen text is generic** ("New message"). Titles, names and message text are never sent.
- Nothing is shown while FamSync is focused on screen. A chat's newer push replaces its older one.
- Signing out removes the browser. Signing in as someone else moves it. Addresses a push service reports as gone are deleted.
- The server only sends to Google, Mozilla, Microsoft and Apple push hosts, since it makes requests to addresses browsers supply.

## Hosting setup

1. Generate keys once per environment with `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (the site address or a monitored mailto: address) on the API only. Push stays off until all three are set. The keys in `apps/api/.env.example` are for local use only. Changing keys later makes each browser subscribe again on its next visit.
2. Leave `PUSH_TEST_HOST` unset; it is for local tests.
3. Upload the new `.htaccess`. The earlier one blocked the microphone everywhere, so voice messages would not record.
4. Deploy migration `20261205000000_add_media_and_push.sql`, then the API, then the web app. `web-push` 3.6.7 is a new API dependency.

Message push goes out at once. Reminder and assignment push follows the job scheduler, so those still need Inngest.

## Verified

All 19 database access-test files, 36 API tests, the 3 job tests, and both builds. Push was sent to a local HTTPS receiver and decrypted: generic text, one per browser, mute, read, unregistered family, removed browser, gone address, refusal, server error, lost access, and an assignment through the local scheduler. No address or text appeared in the logs. First push arrived 0.4 s after the send request began. The service worker was tested in Node. In the browser, with a simulated microphone: denied permission, recording, failed upload and retry, playback, seek, reply, list previews, a WebM clip, and phone width; forwarding through the API.

## Not verified

- **Push on a real browser or phone.** The built-in test browser blocks notifications, so subscribing and real delivery have not been seen.
- A real microphone, real phones, Safari and Firefox, MP4 video from a phone, and hosted staging.
- iPhone and iPad need FamSync on the Home Screen for push; FamSync has no web app manifest yet, which that requires.
- WebM recordings may not play in older Safari.
- Signing out of other devices remotely does not remove their push by itself.

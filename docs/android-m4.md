# Android M4: push notifications

Local implementation started and built on 24 November 2026; not deployed. Scope: M4 in the [Android and chat spec](android-app-spec.md), building on [M3](android-m3.md). **Device acceptance is pending:** no Android APK or real FCM delivery has been tested.

**24 November follow-up:** the user deferred physical-device testing and requested basic checks for now. This leaves M4's device acceptance open while allowing local M5 development to proceed. M5's native voice/video work uses the existing W4 media API and does not depend on Firebase push setup. External beta still requires the outstanding device checks.

## Action audit

| Web action or M4 requirement | Android |
|---|---|
| Enable or disable push on this device | Included under Account → Notification settings → Push on this phone; asks Android permission only after the user enables it |
| Messages, mentions, reminders, assignments and schedule changes | Included through the existing notification outbox |
| Quiet hours | Included: select a silent Android channel; in-app notices remain visible |
| Notification opening | Adapted: the payload contains identifiers; fetch the notification with current authorization before choosing a native screen |
| Generic lock-screen text | Included; no message text, titles, family names or sender names leave the server in push payloads |
| Default family only | Included and checked by the server at registration and delivery, using the same first-joined rule as the family API |
| Guest-channel push outside the default family | Excluded by M4's default-family-only requirement; guest inbox and chat still work |
| Registration, rotation and removal | Included, with session binding, account changes, explicit disable/sign-out, and retirement of invalid provider tokens |

Email preferences control email only, as on web. Push has its own device opt-in; mute and quiet hours are checked at delivery.

## How it works

- The phone obtains a native FCM token using `expo-notifications`; the API sends directly through FCM HTTP v1. Expo's push relay is not used.
- A secure installation ID stays the same when FCM rotates its token. Up to ten registrations are retained per account. Database access rules hide tokens from other users and suppress devices whose sign-in session has expired or whose registered family is no longer their default.
- Removing an auth session deletes its device registration. A sign-out also removes the registration before discarding auth tokens, clears visible notifications, and asks Android to unregister the native token.
- Offline sign-out keeps a secure removal proof consisting of the installation ID and native token, without keeping a login token. Removal retries at app start, foreground and reconnect, including while signed out. The revocation endpoint can only delete an exact matching ID/token pair; an old token cannot delete a rotated replacement. **If both the server and FCM are unreachable, immediate remote revocation is impossible until one succeeds. Already sent notifications can also arrive later.**
- Registration and removal are serialized; sign-out cancels setup already in progress. The app refreshes the token on startup/foreground and token-change signals, with a foreground retry each minute for enabled devices.
- Both browser and Android delivery use the same current-recipient checks for unread notices under a day old, item access and conversation mute. Android additionally requires its registered default family. Quiet hours use that family's time zone.
- FCM's explicit invalid/unregistered/sender-mismatch responses retire only the token that was sent, so a concurrent rotation is safe. Payload, authorization and transient errors stay retryable. Rate limits and unavailable responses honor `Retry-After`, with at least one minute of delay, alongside the existing outbox backoff.
- Foreground push updates the inbox without an extra banner. Background and cold-start taps resolve the notice through the API. Missing access, another account or a different family shows a safe message; an offline failure offers retry. Notification payloads never supply a URL to navigate to.

## Setup needed for a phone build

1. Choose the client-owned Android application ID and Firebase project. Enable FCM HTTP v1 and register an Android app whose package matches that ID. Obtain its `google-services.json` and a service account authorized to send FCM messages. Use staging test accounts.
2. In the mobile build environment, set `FAMSYNC_ANDROID_APPLICATION_ID` and `FAMSYNC_GOOGLE_SERVICES_FILE` (the path to the Android config). Examples are in `apps/mobile/.env.example`. The config preserves the existing invitation/app-link setup. No application ID has been invented or Firebase project provisioned.
3. On the API only, set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`. The last accepts a PEM with real newlines or literal `\n` escapes. Keep the service-account key out of the mobile app. Android push stays unavailable until all three values are set. Browser VAPID keys remain separate.
4. Apply `20261206000000_add_android_push.sql` and `20261206010000_add_android_push_revocation.sql`, then deploy the API and mobile build. The local database has both migrations. Inngest remains necessary for scheduled reminders and fallback delivery.
5. Install the Android SDK and use `npm run build:android:local --workspace @famsync/mobile`, then `npm run start:dev-client --workspace @famsync/mobile`. `expo-dev-client` and the notifications plugin are configured. Expo Go is still suitable for earlier modules, but cannot test Android remote push. EAS is an alternative requiring a separate account/upload decision; no EAS build or upload was performed.

The application ID, Firebase config and server credentials remain unset. This machine has Java 21 but no `adb` or Android SDK in the checked default locations. An Android JavaScript bundle is not an APK or a phone test.

References: [Expo native push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [direct FCM delivery](https://docs.expo.dev/push-notifications/sending-notifications-custom/), and [FCM error handling](https://firebase.google.com/docs/cloud-messaging/error-codes).

## Local verification

- Passed: 64 API unit tests, 39 mobile unit tests, all 20 database access-test files, and four job integration tests. Mobile TypeScript, the API build, Android JavaScript bundle and web build passed. Loopback tests and web export needed execution outside the Windows sandbox; their reruns passed.
- Follow-up basic checks: mobile TypeScript and 39 mobile tests; API build and 33 focused push/media/service-worker tests; and the M4 database access test passed. No real phone, APK or FCM credentials were used.
- API build and regenerated OpenAPI/shared client; mobile TypeScript check.
- API unit tests cover generic payloads for all seven notification kinds, default-family checks, mute, read/old/hidden notices, quiet channels, token retirement, provider failures and retry delays.
- Database access tests cover token privacy, registration replay, rotation, account moves, session ownership, non-default families, guests, proof-based removal, explicit sign-out, expired/revoked sessions, lost membership, content-free outbox payloads and preserving browser delivery.
- Mobile unit tests cover identifier-only push links and cancellation/serialization during sign-out and token rotation, alongside the existing mobile tests.
- Job integration tests cover provider retry delays and the existing outbox claim/retry behavior. Web build checks shared-client compatibility. Android bundle checks native module resolution.

## Remaining acceptance work

- Install a development APK on a physical phone and enable/deny notification permission. Exercise disable/re-enable and Android settings.
- Send messages, mentions, task/event reminders, assignments and changes. Verify foreground, background and closed-app behavior, and tapping into each native screen.
- Check generic lock-screen text and quiet hours on the phone. Test real token rotation/reinstallation and invalid-token retirement against FCM.
- Repeat with a muted chat, removed participant, deleted message, revoked session, signed-out device and account change. Test offline sign-out, reconnect removal, lost family access and tapping an old notification.
- Verify staging Inngest delivery. Add the minimum supported app version gate and complete the spec's other beta prerequisites before external testing.

M4 is not yet accepted for beta; the physical-device scenarios above remain open.

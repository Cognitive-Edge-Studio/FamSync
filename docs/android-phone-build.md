# Android phone build

Prepared on 24 November 2026. **The first developer APK was built that day** in Expo's cloud (project `shibly_noman/famsync`, test ID `com.famsync.dev`, build 1; link expires 8 December 2026). It has not been installed on a phone. [Build page](https://expo.dev/accounts/shibly_noman/projects/famsync/builds/3f18498e-f58a-417e-8d44-e6b2e1f39d0a).

## Where it stands

| Item | Status |
|---|---|
| Android configuration | Checked without generating a native project. One React in the bundle; the duplicate-React warning from `expo-doctor` is the known, accepted one |
| Permissions | Internet, camera, microphone, notifications, vibration and audio settings. Storage writing is only for the camera on Android 9 and older. Storage reading and drawing over other apps are blocked |
| Build profiles | `apps/mobile/eas.json`: `development` (with developer tools) and `preview` (self-contained), both APKs |
| Cloud upload filter | `.easignore` leaves out every `.env` file, backups, database files, docs, and the API and web source |
| This computer | Java 21 only. No Android SDK, about 2 GB free of 237 GB, 6 GB memory, and no phone connected. A local build needs roughly 20 GB free and will be slow |
| Application ID | `com.famsync.dev` for development; `com.goppopi.famsync` for the self-contained preview/release APK |
| Firebase | Android app registered in `famsync-staging`. The matching client config is Git-ignored at `apps/mobile/google-services.json` and included in EAS uploads. API service-account authentication passed; phone push delivery remains untested |

## Choose one way to build

**A. Expo's cloud (suggested).** Needs an Expo account. The app's source, shared packages and public addresses are uploaded, and Expo keeps the signing key. From `apps/mobile`:

1. Sign in: `npx eas-cli@latest login`
2. The project is already linked in `app.json`.
3. The test ID and Node version are in `eas.json`. For `preview`, set every `EXPO_PUBLIC_…` address on expo.dev to HTTPS staging.
4. PowerShell: `$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT='../..'; $env:FAMSYNC_ANDROID_APPLICATION_ID='com.famsync.dev'; npx eas-cli@latest build --platform android --profile development`

Step 4 uploads source. Run `npx eas-cli@latest build:inspect --platform android --profile development --stage archive --output ../../output/eas-check` with the same variables first, to see exactly what would be sent.

**B. This computer.** Free about 20 GB, install Android Studio or the command-line SDK, accept its licences, set `ANDROID_HOME`, then run `npm run build:android:local --workspace @famsync/mobile` with `FAMSYNC_ANDROID_APPLICATION_ID` set. Turn on Windows long paths first.

**C. Another computer** with Android Studio, using the same steps as B.

## Trying the development APK against this computer

Needs Android platform-tools (`adb`) and a phone with USB debugging.

1. Start Docker services and the API on port 4000.
2. Connect the phone, then run `adb reverse tcp:8081 tcp:8081`, `adb reverse tcp:4000 tcp:4000`, `adb reverse tcp:55431 tcp:55431` and `adb reverse tcp:55436 tcp:55436`. The phone then reaches this computer at 127.0.0.1.
3. Run `npm run start:dev-client --workspace @famsync/mobile` and open the app.

Live chat may fall back to checking every 15 seconds, because the local live address may not resolve on a phone. Invitation and sign-up emails are in the local test mailbox.

## First checks on the phone

1. Sign in, close the app fully, reopen: still signed in. Turn on airplane mode: saved screens open.
2. Chat with a web account: send, receive, reply, react. Airplane mode during send, then back: exactly one message.
3. Keyboard over the composer, system back from chats, sheets and forms, and the discard prompt.
4. Camera photo, gallery photo, PDF, download and share.
5. Voice: deny the microphone, allow it, record, review, send, play, seek. A video. A call during recording.
6. Sign-up and reset links from a mail app on the phone; a `famsync://join?token=…` link.
7. TalkBack, and the largest text size.
8. Sign out: nothing of the family remains after opening the app offline.
9. Family Base list and graph: pinch, drag, select.

Push checks follow once Firebase is set up; see [M4](android-m4.md).

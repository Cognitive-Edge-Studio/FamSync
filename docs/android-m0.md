# Android M0: foundation

Implemented locally on 24 November 2026; not released. Scope: M0 in the [Android and chat spec](android-app-spec.md).

## What exists

- `apps/mobile`: Expo SDK 58, React Native 0.88, Expo Router, TypeScript, in the npm workspace. Android only; a web target is kept for checking screens during development.
- Email and password sign-in, session restore and sign-out. The session is kept in Android secure storage, in parts because of its size, and app backup is off. Sign-out clears the device even without a connection. An expired session that cannot be refreshed offline is kept (from M1 it also opens saved data); a refused one returns to sign-in.
- One family, opened automatically, with no list or switcher.
- Today (read-only in M0; see [M1](android-m1.md)): plans, next seven days, own open and overdue tasks, in the family's time zone.
- Navigation for every module; modules not built yet are hidden unless `EXPO_PUBLIC_SHOW_UNBUILT=1` in development. Light, dark and device themes; loading, empty, error, offline and lost-access states.
- `packages/core`: date and event rules shared by web and Android.
- **Default family on the server:** `GET /families` returns `isDefault`, the family joined first. It is calculated, not stored, so it needs no migration. Web uses it too. Someone already in several families may see web move once from the family their browser remembered.

## Run on a phone

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set the staging API address, the Supabase Auth address ending in `/auth/v1`, and the publishable key. Never a secret key.
2. Install Expo Go for SDK 58 on the phone, on the same network.
3. Run `npm start --workspace @famsync/mobile` and scan the code.

The staging API must be updated first. An older one omits `isDefault`; the app then opens the first family returned.

## Verified

Type check, 8 unit tests (session storage with the real auth client, configuration, family choice, modules), and a Hermes Android bundle with exactly one React (19.3.0). Web, API and its Docker image build; 19 database test files and 36 API tests pass. On screen through the web target: wrong password, sign-in, Today, themes, server unavailable and recovery, sign-out, no family, and losing the family while open.

## Not verified

- **Nothing has run on Android.** No emulator or phone was available, so secure storage, the system back button, keyboard behavior, splash screen, TalkBack and large text are untested.
- Session restore after closing the app is tested with the storage and auth code, not on a device.
- The hosted API and sign-in from a phone.

## Notes

- Expo requires React 19.3.0 while web resolves 19.3.1. Each keeps its own copy. `expo-doctor` reports this as its only failure; the Android bundle was checked to contain one copy.
- The API Dockerfile now copies the new workspaces' package files. Without them its install can fail.
- The app has no Android application ID yet; that decision is needed before a development build (M4).

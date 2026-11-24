# Android minimum supported version

Implemented locally on 24 November 2026; not deployed. This completes the minimum supported app-version check required before external testing in the [Android spec](android-app-spec.md). An Android APK and physical-device acceptance remain pending.

## How it works

The Android app checks `GET /api/v1/mobile/android/version` before mounting sign-in or family screens. The public response contains only `minimumBuild` and an optional `updateUrl`, with `Cache-Control: no-store`. It works without a session or database connection.

The comparison uses `expo-application`'s installed `nativeBuildVersion`, which is Android's integer `versionCode`, rather than comparing version names or trusting a JavaScript manifest. The initial app config explicitly sets build **1**, version **0.1.0**. Missing or invalid native build information blocks opening the app. Expo Go and the normal development web preview skip this check because they are not FamSync Android binaries; actual development APKs do enforce it.

- A build below the minimum shows **Update FamSync to continue**. It can open the configured HTTPS distribution page and check again. If no real page is configured, it asks the tester to obtain the latest installation. Opening a failed link gives a retryable message.
- The check runs at startup, on foreground and every five minutes while active. A freshly raised minimum unmounts the app screens, closes message outboxes and stops active media. Saved sign-in, read caches and queued messages are retained for an in-place app update. Unsaved forms remain subject to their existing in-memory lifetime.
- A successful policy is kept in secure storage, bound to the exact API base URL. A previously accepted build can continue offline for up to 24 hours after that check, assessed at startup and subsequent checks. Without a usable recent decision, opening the app requires a connection and offers **Try again**. A known rejected build remains blocked even when its policy is old or a refresh fails. Only a valid live policy rollback or an acceptable newer installed build can reopen it.
- Malformed responses, HTTP errors, missing endpoints and request timeouts do not accept a new build. Requests have the existing 15-second API timeout. Late superseded responses cannot undo newer decisions, and policy writes are serialized. A failed cache write attempts to remove the old decision, so restart requires a connection rather than reusing an obsolete acceptance; if secure storage also refuses deletion, its previous record can remain until it expires.

This is an app compatibility gate. Existing API authentication and per-record authorization remain authoritative. Web API clients are unchanged, and this does not add a global rejection header for other clients.

## Release setup

Set these **API environment variables**, not Expo public build settings:

| Variable | Value |
|---|---|
| `ANDROID_MINIMUM_BUILD` | Integer Android version code, 1–2100000000; defaults to `1` |
| `ANDROID_UPDATE_URL` | Actual HTTPS Play listing or trusted APK distribution page; optional until distribution exists |

Malformed settings fail API startup. The policy is read at startup, so changing it requires an API restart/deployment. No destination URL was invented or configured for hosted use.

For each release, increment `apps/mobile/app.json` → `expo.android.versionCode`; update `expo.version` for the human-readable release as appropriate. Build and distribute the replacement APK with the same final application ID and signing key, verify testers can install it in place, then raise the API minimum if older builds must stop. Do not ask testers to uninstall to update. To roll back a bad minimum, lower it on the API and restart; testers can use **Check again** or foreground the app.

Deploy the new API endpoint **before distributing a build containing this gate**. A server without it cannot validate a first launch. Configure the real application ID, signing/distribution setup and hosted update URL before external testing. `expo-application` is now an explicit SDK-compatible dependency; use a newly built APK to verify the native module.

## Basic checks

- All **68 API tests** passed, including four new release-policy tests. They cover defaults, invalid settings, unsafe update destinations and an actual unauthenticated HTTP request with the no-store response header.
- All **68 mobile tests** passed, including 11 new tests for numeric build comparison, invalid policies, server-bound cache, first launch, 24-hour expiry, durable rejection, upgrade/rollback, storage failure, superseded responses and serialized persistence. The session test needs loopback access; the initial sandbox run could not reach its local mock auth server, and the full suite passed outside that sandbox. The final cache-failure refinement passed the focused version tests again.
- Mobile and web TypeScript passed against the regenerated shared API contract. The final Android Hermes bundle passed with one Metro worker after the cache-failure refinement. No database schema or access rules changed, so database tests were not repeated.
- The automated 390 × 844 browser preview passed ten checks: real API rejection of build 1 under minimum 2; HTTPS update destination; offline rejection; no-link fallback; accepted build opening sign-in; recent offline acceptance; active polling blocking an open app; first launch offline blocking access; retry recovery; and a deep link failing to bypass the gate. No account sign-in or family mutations were needed. The HTTPS page was fulfilled locally by the test, without contacting a distribution service.
- Browser screenshots and the runnable workflow are in `output/playwright/version-*`. A development web preview can exercise these screens with `EXPO_PUBLIC_TEST_ANDROID_BUILD=1`; this simulation is restricted to development web builds and cannot replace the native build number on Android.

Temporary API/browser/preview processes were stopped; no deployment or APK upload was performed.

## Deferred acceptance

On physical Android builds, verify native build numbers, secure-store persistence across restart and in-place update, update-link launch/failure, foreground revocation, back/deep-link behavior, media/outbox shutdown, large text and TalkBack. Verify the real staging policy and distribution page before external testing. Phone testing remains deferred at the user's request.

Reference: [Expo application versions](https://docs.expo.dev/versions/latest/sdk/application/) and [build version management](https://docs.expo.dev/build-reference/app-versions/).

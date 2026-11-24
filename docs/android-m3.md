# Android M3: files, family and account

Implemented locally on 24 November 2026; not released. Scope: M3 in the [Android and chat spec](android-app-spec.md). Builds on [M2](android-m2.md). No API or database change was needed.

## Action audit

Exclusions and adaptations need client approval.

| Web action | Android |
|---|---|
| Sign in, create an account, reset a password, change email or password | Included |
| Google sign-in | Included, in the phone's browser; shown only where the server has it on |
| Create a family; join a family or a channel by invitation | Included |
| Family: members, settings, invitations (send, resend, revoke), transfer ownership, remove a member | Included |
| Channel guests: allow or disable, invite, resend, revoke | Included |
| Guest channels: list, chat, search, folders | Included |
| Channel picture: add, change, remove | Included (left over from M2) |
| Folders: list, find, filter, create, edit, archive; conversation folders | Included |
| Files: find, filter, sort, archive; image, text and spreadsheet preview | Included; opened one at a time, without thumbnails in the list |
| Upload | Included, several at once, with progress, cancel, retry and the camera |
| Download | Adapted: open in another app, or share and save with the phone's share sheet |
| Audio and video preview | Excluded until M5; they open in another app |
| Event: attach a file when creating | Included (left over from M1) |
| Notification inbox, mark one or all read | Included, for the person's family and guest channels only |
| Email and quiet-hour settings | Included |
| Browser push setting | Excluded; phone push is M4 |
| Profile, activity, privacy defaults, chat privacy, theme | Included |

## How it works

- **Links:** `famsync://join`, `famsync://join-channel` and `famsync://auth/callback` open the app. An invitation is accepted only by pressing Accept. It is kept for one day in secure storage, through sign-up or sign-in, and stays if it is refused.
- **Email and Google sign-in** use a one-time code that works only on the phone that asked for it. A wrong or old link does not spoil the right one.
- **Guest channels** use the same chat screens. Their saved data is kept apart from the family's, and is removed when the grant ends.
- **Files:** each open, preview or share asks the server for a new short link, so access is checked each time. A shared copy stays in the app's cache until the next share or sign-out.
- **Confirmations** say what will happen: transfer, removal, disabling guests, revoking, and archiving.
- **Settings** open only with current values, so an old saved copy is never written back.

## Needed before release

- **Sign-in server:** allow `famsync://auth/callback**`. The local setup has it; staging and production do not.
- **Website links** (`https://…/join/`) open the website until the domain is final. Then set `FAMSYNC_APP_LINK_HOST` for the build and serve `assetlinks.json` for the app's ID and signing key.
- Until then, set `NEXT_PUBLIC_ANDROID_APP=1` on the website to offer "Open in the FamSync app" on its invitation pages. It is off by default.

## Verified

Type checks, 36 mobile unit tests, an Android bundle with one React (19.3.0), and the web build. On screen through Expo's web target against the local API, sign-in server and test mailbox:

- A new account: sign-up email, reset by email after a wrong link was tried first, a new password, then a password change.
- A channel invitation opened while signed out and accepted after signing in; a family invitation accepted while signed in; a used, a malformed and a second-family invitation each refused with a reason.
- Guest: chat, search and folders of one channel only; after the grant was revoked, the list and the chat closed.
- Owner: settings, invitations, guests, transfer of ownership. Member: no settings, invitations or emails of others. A removed member was returned to "No family yet".
- Files: private folder, several uploads, an unsupported file refused, a lost response retried with one stored copy, spreadsheet preview, archived file and folder closed.
- Channel picture, event attachment, notification list and opening, privacy, quiet hours, profile.

## Not verified

- **Nothing has run on Android.** Links opening the app from a mail app, Google sign-in, secure random values and SHA-256 on the phone, camera, pickers, uploads, share sheet, keyboard, system back, TalkBack and large text are untested on a device.
- The sign-up confirmation was tested only as far as the email, because a wrong link was tried first (since fixed). The same step was completed for password reset.
- Google sign-in: not switched on locally. Email change, upload cancel, conflicting folder edits, expired invitations, removing a channel picture, resend and revoke from the family list, and open and share of a file were not exercised on screen.
- API and database tests were not run again, because neither changed.

# Android UI and motion polish

Implemented locally on 24 November 2026. This is a polish pass across the Android app after M6; it is not a new numbered milestone or a deployment. Physical-device testing remains deferred at the user's request.

## Visible changes

- **Today:** a family summary with the local date, direct New task/New event actions, clearer count cards and icon-led sections for tasks, agenda and goals.
- **More:** account summary, a responsive Explore grid with descriptions and unread counts, and compact light/dark/device appearance controls. Cards flow to a single column on narrow screens and expand on tablets.
- **Sign-in:** a clear FamSync identity and welcome heading, calmer spacing, a stronger primary action and a quieter password-recovery action. Email Next still focuses the password field through the shared input ref.
- **Shared controls:** consistent card and button corners, spacing, 48–56 px primary touch targets, visible input focus borders and selected-row backgrounds. Icons added to text buttons are decorative; button and tab accessible names stay readable.
- **Navigation and sheets:** native stack transitions, Android tab crossfades, animated active-tab indicators, subtle page/sheet entrances, and tactile press feedback across shared buttons, chips, task/goal rows, chats and Family Base. Back labels use Home instead of an internal route-group name. Existing modal close, backdrop, Escape and system-back behavior remains in place.
- **Goals:** progress changes animate to the actual value; progressbar accessibility values update immediately.

## Libraries and motion rules

The app already includes **React Native Reanimated 4.7.1**, **React Native Worklets 0.13.0**, **Gesture Handler 3.3.0** and **Expo Router**. This pass uses those installed libraries, with no new dependency. The root now includes `GestureHandlerRootView`; sheets retain React Native Modal and its native dismissal/accessibility behavior. This pass does not add swipe-to-dismiss gestures.

Reanimated shared values animate transforms, opacity and progress. Press/release lasts 90/160 ms, entrances 220 ms and tab changes 180 ms. The Explore stagger is bounded to 160 ms. Shared entrances keep content in normal layout flow; a web-preview issue with layout-animation clones hiding form content was found and fixed during verification. The web preview uses content/indicator motion instead of native tab crossfades.

`MotionProvider` combines Reanimated's synchronous initial reduced-motion value with React Native AccessibilityInfo changes while the app is open. Each animation uses the current preference explicitly, so a startup-only library snapshot cannot prevent movement from being enabled again later. Reduced motion disables travel/scale animation, navigation animation and modal fading. This adds no artificial loading delays, looping decorative motion or delayed removal of access-revoked content.

The shared entry animation runs on mount, rather than on every query refresh. Message-list scrolling and delivery behavior were not changed.

## Basic checks

- All **68 existing mobile regression tests** passed. No API or database changes were made.
- Final mobile TypeScript and the Android Hermes bundle passed. The native export used one Metro worker after closing the temporary browser and preview/API servers.
- The Playwright workflow `output/playwright/ui-polish-smoke.js` passed against the local API using a demo account, without saving the test forms or sending messages. It checked sign-in, email-to-password keyboard focus, Today quick actions, actual press-scale feedback, visible field focus, sheet selection, Escape after the modal opens, both cancel and accept of the unsaved-draft prompt, Explore tile sizes and overlap, dark mode, dynamic reduced motion, Family Base kind selection, 320/390/768 px layouts and chat-sheet navigation. No application exception was observed.
- The browser workflow also found and verified fixes for decorative icon labels, overlapping grid cards and hidden form content. Screenshots of sign-in, Today, More, dark mode and the date sheet were visually checked under `output/playwright/ui-polish-*.png`.

Browser checks exercise the Expo web preview. Native transition smoothness, Android back/keyboard behavior, TalkBack, large text, modal focus and frame rate on lower-end phones remain part of device acceptance. No APK or hosted deployment was produced.

References: [Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/), [reduced-motion behavior](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/) and [Expo Router stack transitions](https://docs.expo.dev/router/advanced/stack/).

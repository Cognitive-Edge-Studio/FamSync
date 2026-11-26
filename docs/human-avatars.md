# Human avatars

Personalized photo-to-avatar generation is now implemented separately; see [Personalized profile avatars](personal-avatars.md). The six characters described below remain the web defaults.

## Execution plan

1. Follow Shadcn Space's circular image-and-fallback pattern using the existing Base UI Avatar primitive. Generate six original cartoonish 3D human characters; keep assets local and choose consistently from an account ID, without inferring gender or age from names.
2. Replace person initials in account menus, messages, participant lists and work assignments. Add avatars to the family member directory, direct-conversation header and landing demo. Family workspaces and regular channels keep their own identities. Do not introduce profile-upload or server changes in this visual slice.
3. Verify the static build, person consistency, loading/error fallbacks, and desktop/mobile appearance in ChatGPT's browser.

Status: Complete locally. The user clarified cartoonish 3D human avatars. The realistic samples are not used by the app.

Reference: https://shadcnspace.com/components/avatar

## Result

Six individual transparent cartoon characters were generated with the built-in imagegen tool and exported as locally served WebP images. The shared Base UI Avatar component displays a character chosen from the stable account ID, with initials as its loading/error fallback. These are illustrative defaults; they do not infer or represent an account holder's actual appearance. An optional image source is supported by the component for future profile-photo integration; no profile upload or persistence was added.

Updated placements include account triggers and menus, the profile form, family member directory, chat authors and participants, direct-conversation headers, source-message authors, task and goal assignees, goal creators, and the landing-page audience demo. Family workspace rows use the family module icon. Regular channels retain their saved image or emoji. The DM list retains its conversation identity because its current response does not include the other participant's ID; the open DM header uses that participant's account ID.

## Assets and exact prompts

- Runtime images: `apps/web/public/avatars/3d/person-01.webp` through `person-06.webp`, with matching `@2x.webp` files (96 px and 192 px).
- Original PNGs and exact prompt set: `output/imagegen/human-avatars/`, including `generation.json`.
- Size report: `output/imagegen/human-avatars/asset-sizes.json`. Standard assets are approximately 3.8–4.4 KB each; high-density assets are approximately 8.9–10.0 KB each.
- Asset export command: `node scripts/prepare-human-avatars.mjs`, using saved originals when available.

## Verification

The production web build passed TypeScript and exported all 30 pages statically. No API or database changes were required.

ChatGPT's in-app browser confirmed successful image loading and matching characters in the account trigger, account menu, profile form, family directory and conversation participant pane. The 390 px iframe preview showed the loaded profile avatar with matching body content and scroll widths of 375 px after the scrollbar. The Base UI primitive supplies image loading and error fallbacks; a forced image-error scenario was not separately exercised.

Evidence: `output/imagegen/human-avatars/account.jpg`, `members.jpg`, `chat.jpg` and `mobile.jpg`.

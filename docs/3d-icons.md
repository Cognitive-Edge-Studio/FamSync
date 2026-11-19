# Generated 3D icons

Requested replacement of the existing module icons, 18 November 2026.

## Execution slices

1. Generate individual transparent icons with the built-in imagegen tool. Use rounded clay/ceramic forms, soft studio lighting and simple silhouettes suited to small sizes. Save the original images and exact prompts in this workspace.
2. Produce optimized transparent WebP assets and a typed shared component. Replace module icons in desktop/mobile navigation, quick-create and account menus, Today cards, and module empty states. Keep small interaction symbols such as close, arrows and checkboxes recognizable.
3. Run the static build, verify the updated screens in ChatGPT's browser, and record asset sizes and visual evidence.

## Status

Complete locally. Generated 14 individual transparent icons using the built-in imagegen tool: Today, Calendar, Tasks, Goals, Channels, Messages, Families, Folders, Guests, Account, Notifications, Home, Schedule and Overdue.

The shared `apps/web/src/components/ui/module-icon.tsx` component supplies decorative images with empty alternative text; existing links and buttons retain their accessible labels. Desktop and mobile navigation share the same artwork. Quick-create/account menus, notification previews, Today cards, module empty states, folder cards and matching inline module icons use the new assets. Existing account avatars and personalized channel images remain user content.

## Saved assets and prompts

- Runtime assets: `apps/web/public/icons/3d/`, 96 px and 192 px transparent WebP variants. Standard-size assets are approximately 2.7–5.2 KB each, and high-density variants are approximately 6.6–11.7 KB each.
- Original generated PNGs: `output/imagegen/famsync-icons/`.
- Exact prompt set and generator record: `output/imagegen/famsync-icons/generation.json`.
- Export size report: `output/imagegen/famsync-icons/asset-sizes.json`.
- Rebuild optimized assets from the saved originals: `node scripts/prepare-3d-icons.mjs`.

## Verification

The production build passed TypeScript and exported all 30 pages statically. No application server behavior was added to Next.js.

ChatGPT's in-app browser verified the Today dashboard, active and inactive desktop navigation, the quick-create menu, a module empty state, and the mobile navigation drawer. All inspected icon images loaded successfully. The existing 390 px iframe preview had matching content and scroll widths of 371 px after the scrollbar, with no horizontal overflow. The browser viewport override did not resize this environment; responsive evidence uses the actual narrow iframe instead.

Screenshots: `output/imagegen/3d-icons-dashboard.jpg` and `output/imagegen/3d-icons-mobile.jpg`. Hosted visual verification remains pending staging.

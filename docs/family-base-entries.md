# Family Base — Phase 2: memories, places and ideas

Implemented locally on 23 November 2026; not deployed. Builds on [Phase 1](family-base-real-graph.md).

- Migration `20261130000000_add_family_entries.sql` adds `app.family_entries` and `app.family_entry_links`.
- Any member can add an entry in Family Base, with the existing Family / Selected members / Only me audiences. Private mode makes new entries default to Only me. Only the author can edit or delete, and deleting is permanent.
- An entry links to people, goals, events and other entries. A link is visible only to someone who can see both ends, and linking never shares its target. Links hidden from the author survive their edits.
- Events linked from an entry stay in the graph after the usual 30 days.
- API: `/api/v1/families/{familyId}/base/entries`. Access checks: `supabase/tests/family-entries-access.sql`.

## Deployment order

Apply the migration, then deploy the API, then the web app. The API readiness check requires the new tables.

## Known limits

- The graph shows the newest 150 memories, 100 places and 150 ideas. There is no separate list for older ones.
- Only events already in the graph can be newly linked, so a past event older than 30 days cannot be picked.
- Photos, maps and entry notifications are not included.
- Like goals, a departed author's shared entries remain visible but cannot be edited.

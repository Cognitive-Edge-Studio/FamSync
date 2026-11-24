# Family Base — Phase 1: real family graph

Replaces the fictional data from [FB-D01](family-base-demo-graph.md). Implemented locally on 23 November 2026; not deployed.

- `GET /api/v1/families/{familyId}/base/graph` returns people, tasks, goals, events, conversations and files, plus their stored relationships. No schema change.
- Every query runs as the caller, so existing row-level security decides visibility. Links to records the caller cannot see are dropped. Selected-audience member lists are never exposed.
- Archived records are excluded. Tasks completed and events ended more than 30 days ago are excluded. A repeating chore appears once. Limits: 150 tasks, 60 goals, 80 events, 60 conversations, 80 files; the screen says when a limit applies.
- Selecting a node shows its details and opens the real task, goal, event, conversation, folder or family page.

## Known limits

- The graph does not generate new chore occurrences; they appear after the normal task or goal reads create them.
- A goal step linked to a chore occurrence other than the one shown has no line.
- The graph loads on opening or Refresh, without live updates.
- Reduced motion and the WebGL fallback are implemented but were not forced in verification.

[Phase 2](family-base-entries.md) adds family-authored memories, places and ideas. [Phase 3](family-base-ai.md) adds AI questions, not activated.

# Today dashboard audit — November 19, 2026

## Findings and changes

- **Inconsistent date range.** “Next 7 days” counted today's events, while the upcoming list covered only six future days. Both now use tomorrow through the seventh following day. Events spanning several days count once in the total.
- **Unused space.** Separate schedule panels produced a large gap below today's short list. Today and upcoming events now share one agenda panel, beside a family progress panel.
- **Missing member insight.** Added a member selector, a radar chart of goal completion across the eight existing goal categories, and counts for open tasks, tasks completed in the last seven calendar days, and overdue tasks.
- **Misleading loading values.** Schedule totals now show a dash while unavailable rather than a false zero. Task summary failures also show a dash.
- **Unclear scope.** Task summary labels explicitly say “My” or “Family,” matching the task scope selector.

## Analytics definitions

Only records returned by the authenticated family APIs contribute. All list pages are fetched; archived records are excluded. The family view includes shared and individual goals. A selected member shows individual goals and tasks assigned to that member; unassigned shared work is not attributed to a child.

Each radar axis is the average recorded percentage of goals in that category. Completed goals contribute 100%. Active manual goals without a percentage do not enter the average. Missing measurements display “—,” rather than a fabricated percentage. The chart is a current goal snapshot; task completions use the last seven calendar days, including today, in the family's time zone.

The member data currently stores owner/member roles, not child/adult identities. The selector lets a parent inspect a child who is already a family member. Automatic child-only reporting needs an explicit child designation in the data model. No age, wellbeing, grades, or attendance are inferred.

## Validation

Build and TypeScript checks; aggregation checks for assignment, missing measurements, archived items, completed goals, and time-zone boundaries. Browser verification covers family and member selection, empty data, and agenda totals.

# FamSync Discovery Documents

This directory contains the functional discovery baseline for the FamSync rebuild. Exploration began from an authenticated, empty-state session on 2026-11-17, then continued with user-authorized synthetic records to exercise saved workflows. Findings distinguish confirmed UI behavior from inferred models and unverified workflows.

## First deliverable and coverage

- [Initial reconnaissance: sitemap, module inventory, feature inventory, evidence register, and tracker](01-initial-reconnaissance.md)
- [Final scope and gap analysis, second-pass audit, and traceability report](09-rebuild-scope-gap-analysis.md)
- [Functional execution results: saved records, state changes, evidence, and current coverage](10-functional-execution-results.md)

## Eight handoff documents

1. [Product Overview](02-product-overview.md)
2. [Complete Feature Inventory (Observed Scope)](03-feature-inventory.md)
3. [Functional Requirements Specification](04-functional-requirements.md)
4. [Screens and Navigation Specification](05-screens-navigation.md)
5. [User Journeys and Workflow Specification](06-user-journeys.md)
6. [Domain and Data Model](07-domain-data-model.md)
7. [Roles and Permissions Matrix](08-roles-permissions.md)
8. [Rebuild Scope and Gap Analysis](09-rebuild-scope-gap-analysis.md)

## Coverage status

Tasks, calendar, goals, channels, direct messages, folders, and family-member creation now have saved-state evidence; see [Pass 3 results](10-functional-execution-results.md). Modules remain **Partially Verified** because meaningful workflows do not establish every validation, edit/access path, integration, or edge case. In particular, no Child login was available to verify cross-account permissions, and recurrence rendering showed unresolved behavior. The final audit lists remaining access and product questions.

No implementation code or architecture decisions are included.

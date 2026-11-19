# Family Base — 3D demo graph

## Execution slice FB-D01

Requested: implement the selected large-graph visual reference with demo data; discuss product features later.

1. Add the React 3D force-graph renderer and its Three.js dependency. Load the universe only in the browser from the existing static Family Base route, after the existing account/family gates.
2. Create a deterministic fictional graph with colored clusters, larger hubs and fine links. Add a restrained star field, orbit/zoom controls, reset view, selection and a compact details panel. Provide search and a keyboard-accessible list so node selection is not pointer-only. Clearly label the universe as demo data.
3. Support responsive sizing, reduced motion, a paused rotation default, and an intelligible fallback if WebGL is unavailable. Keep all graph data local; no family records, AI calls, backend endpoints or database changes are part of this demo.
4. Verify static export, real WebGL rendering and node/search/reset interactions in ChatGPT's browser, plus a narrow layout. Record the result and any environment limits.

Reference: https://vasturiano.github.io/3d-force-graph/example/large-graph/  
Renderer API: https://github.com/vasturiano/react-force-graph

Status: Complete locally, 18 November 2026. The E02–E07 product improvement slices remain separate planned work.

## Delivered

The static Family Base route now lazy-loads a browser-only `react-force-graph-3d` / Three.js universe after the existing account and family gates. It contains 151 fictional nodes and 204 connections across six colored constellations, a star field, orbit/zoom, optional rotation, camera reset, fit-to-visible controls, node dragging, search, category filters, connected-node details and a keyboard-accessible node list. Selection details move below the canvas on smaller screens. Graph changes are temporary and reset on reload.

All graph data is local demo content. This slice adds no API endpoints, database changes, live family relationships or AI behavior. Product features and real data semantics remain for a later discussion.

## Verification

- Static Next.js production build passed TypeScript and exported all 31 pages.
- Fixture validation passed: deterministic data, unique IDs, valid endpoints, a fully connected graph and isolated mutable renderer instances.
- ChatGPT's in-app browser rendered the actual WebGL graph. Canvas selection opened “Our universe” with six neighbors; search for “Maya” produced three results, and selecting Maya showed five connected nodes. Connected-node navigation, reset, constellation filtering (151 to 126 visible nodes and back), and keyboard selection from the node list worked.
- A 390 px iframe check rendered the graph and placed selected-node details below it. Content and scroll widths were both 375 px, with no horizontal overflow.
- Final browser warning/error logs were empty. Preview evidence: `output/family-base-demo/overview.jpg`, `selected-node.jpg` and `mobile-selection.jpg`.

Reduced-motion behavior and a WebGL-error fallback are implemented but were not forced in the browser acceptance run. Mobile verification used a narrow browser frame rather than a physical touch device.

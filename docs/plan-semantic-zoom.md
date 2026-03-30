# Plan: Semantic Zoom (Navigable Depth)

## What This Is

Clicking a boundary node navigates INTO it — the boundary's children become the
map, and you can navigate back via breadcrumb. This makes the map navigable, not
just viewable.

## Core Behavior

1. **Click a boundary node** → auto-create a perspective from its children →
   switch to that perspective → update URL
2. **Click a non-boundary node** → open inspector (existing behavior, unchanged)
3. **Breadcrumb** → shows navigation path (`Overview > SERVICE`) → click any
   segment to go back
4. **Perspective tabs** → concern-based perspectives stay as tabs (unchanged)

## Files to Change

### `ui/src/components/CartographerMap.tsx`
- Detect click on a boundary node vs non-boundary node
- Boundary click: call `onBoundaryClick(boundaryId)` callback
- Non-boundary click: call `onNodeClick(entityId)` as before

### `ui/src/components/Breadcrumb.tsx` (NEW)
- Receives a navigation path: `[{ id, name }]`
- Renders: `Overview > SERVICE > ...`
- Click any segment → call `onNavigate(perspectiveId | null)`
- Positioned top-left, below status bar

### `ui/src/App.tsx`
- Add `navigationPath` state: array of `{ id: string, name: string }`
- `handleBoundaryClick(boundaryId)`:
  1. Find or create perspective from boundary's children (call API)
  2. Push `{ id: perspectiveId, name: boundaryName }` onto navigation path
  3. Set `clientPerspective` to the new perspective
  4. Update URL
- `handleBreadcrumbNavigate(perspectiveId)`:
  1. Pop navigation path back to that level
  2. Set `clientPerspective` (null for Overview)
  3. Update URL
- Pass `navigationPath` to `Breadcrumb` component
- Move `PerspectiveSelector` to only show concern-based perspectives (non-boundary-derived)

### `src/api/routes.ts`
- Add `POST /api/perspective/from-boundary` endpoint:
  - Input: `{ boundaryId: string }`
  - Creates a perspective from the boundary's children if it doesn't exist
  - Returns: `{ perspectiveId, name, entityCount, created }`
- Uses a new store method

### `src/store.ts`
- Add `createPerspectiveFromBoundary(boundaryId)` method:
  - Finds all entities where `parentBoundary === boundaryId`
  - Creates a perspective named after the boundary (e.g., `perspective:service`)
  - Populates `entityIds` with the children's IDs
  - Also includes the boundary itself if it has sub-boundaries as children
  - Returns the perspective
  - If perspective already exists for this boundary, returns it (idempotent)

### `ui/src/lib/api.ts`
- Add `createPerspectiveFromBoundary(boundaryId: string)` fetch function

### `ui/src/components/BoundaryNode.tsx`
- Add visual affordance that boundaries are clickable/navigable
  (e.g., subtle arrow or "enter" indicator on hover)

## What NOT to Build

- No agent-driven depth amplification (that's a future agent skill enhancement)
- No sub-boundary discovery (the agent can do this when asked, but the UI
  doesn't auto-trigger it)
- No changes to the MCP tools (the agent can already create perspectives)
- No changes to the data model (perspectives already support this)
- No merging of breadcrumb and perspective tabs — they're separate UI elements

## Sequence

1. `src/store.ts` — add `createPerspectiveFromBoundary` method
2. `src/api/routes.ts` — add boundary-to-perspective API endpoint
3. `ui/src/lib/api.ts` — add fetch function
4. `ui/src/components/Breadcrumb.tsx` — new component
5. `ui/src/components/BoundaryNode.tsx` — hover affordance
6. `ui/src/components/CartographerMap.tsx` — distinguish boundary vs entity clicks
7. `ui/src/App.tsx` — navigation path state, boundary click handler, breadcrumb wiring
8. Build, test, push

## Test

1. Open map with existing model (SERVICE, BROWSER-UI boundaries)
2. Click SERVICE boundary → map should show only service contents
3. Breadcrumb shows `Overview > SERVICE`
4. Click Overview in breadcrumb → back to full map
5. URL updates on each transition
6. If concern perspectives exist (auth, etc.), tabs still appear alongside breadcrumb

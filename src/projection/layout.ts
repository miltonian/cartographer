import {
  type WorldModelSnapshot,
  type WorldEntity,
  type WorldRelationship,
  type EntityKind,
  type Confidence,
  CONFIDENCE_RANK,
} from '../ontology.js';

// ─── Projection Types ──────────────────────────────────────────
// These are rendering-layer types. They do NOT leak into the stored model.

export interface MapNode {
  id: string;
  kind: EntityKind;
  name: string;
  description?: string;
  parentBoundary?: string;
  bestConfidence: Confidence;
  evidenceCount: number;
  x: number;
  y: number;
  // Group node fields (for boundaries rendered as containers)
  isGroup?: boolean;
  width?: number;
  height?: number;
  parentId?: string;  // React Flow parent nesting
  contextual?: boolean; // True for ghost entities (connected but not in perspective)
}

export interface MapEdge {
  id: string;
  kind: string;
  source: string;
  target: string;
  bestConfidence: Confidence;
}

export interface MapProjection {
  nodes: MapNode[];
  edges: MapEdge[];
  activePerspective: string;
  perspectives: { id: string; name: string; entityCount: number; isDefault?: boolean }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

// ─── Layout Constants ──────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 44;
const NODE_GAP_X = 16;
const NODE_GAP_Y = 12;
const GROUP_PAD_X = 20;
const GROUP_PAD_Y = 16;
const GROUP_LABEL_H = 28;  // Space for the boundary label
const GROUP_GAP = 48;      // Gap between boundary groups
const COLS = 3;            // Max columns inside a group
const MAX_ROW_WIDTH = 1200; // Wrap top-level groups past this width
const SUB_MAX_ROW = 1000;   // Wrap nested sub-boundaries past this width

// ─── Layout Computation ────────────────────────────────────────

export function computeMapProjection(snapshot: WorldModelSnapshot): MapProjection {
  const { entities, relationships, perspectives, activePerspectiveId } = snapshot;

  const perspectiveSummaries = (perspectives ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    entityCount: p.isDefault ? entities.length : p.entityIds.length,
    isDefault: p.isDefault,
    source: p.source,
  }));

  const empty: MapProjection = {
    nodes: [], edges: [],
    activePerspective: activePerspectiveId ?? 'perspective:default',
    perspectives: perspectiveSummaries,
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  };

  if (entities.length === 0) return empty;

  const entityIndex = new Map<string, WorldEntity>();
  for (const e of entities) entityIndex.set(e.id, e);

  // ── Perspective filtering ──────────────────────────────────
  const activePerspective = (perspectives ?? []).find(
    (p) => p.id === activePerspectiveId,
  );
  const isDefault = !activePerspective || activePerspective.isDefault;

  // Focused entity IDs: perspective members, or ALL if default
  const focusedIds = new Set<string>(
    isDefault ? entities.map((e) => e.id) : activePerspective!.entityIds,
  );

  // Contextual entity IDs: connected to focused entities but not focused themselves
  const contextualIds = new Set<string>();
  if (!isDefault) {
    for (const rel of relationships) {
      if (focusedIds.has(rel.source) && !focusedIds.has(rel.target) && entityIndex.has(rel.target)) {
        contextualIds.add(rel.target);
      }
      if (focusedIds.has(rel.target) && !focusedIds.has(rel.source) && entityIndex.has(rel.source)) {
        contextualIds.add(rel.source);
      }
    }
  }

  // Visible = focused + contextual
  const visibleIds = new Set([...focusedIds, ...contextualIds]);
  const visibleEntities = entities.filter((e) => visibleIds.has(e.id));

  // When inside a boundary-derived perspective, the boundary's children ARE the
  // world (the boundary itself isn't focused), so they fall through to top-level
  // naturally. We only use this to widen the orphan grid.
  const isBoundaryPerspective = !isDefault && activePerspective?.source === 'boundary';

  // ── Build the visible hierarchy ────────────────────────────
  // Entities nest under a parent ONLY when that parent is a visible boundary.
  // Boundaries can be children of other boundaries (sub-boundaries) — the previous
  // version excluded boundaries from the child set, so a boundary whose only
  // children were sub-boundaries vanished, and sub-boundaries never nested.
  const visibleById = new Map<string, WorldEntity>();
  for (const e of visibleEntities) visibleById.set(e.id, e);
  const isVisibleBoundary = (id: string): boolean => {
    const e = visibleById.get(id);
    return !!e && e.kind === 'boundary';
  };

  const kindOrder: Record<string, number> = {
    actor: 0, capability: 1, entity: 2,
    'side-effect': 3, invariant: 4, 'failure-point': 5,
    transition: 6, dependency: 7, 'async-process': 8,
  };
  const sortByKind = (arr: WorldEntity[]) =>
    arr.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));

  const leafChildrenOf = new Map<string, WorldEntity[]>();   // boundaryId → non-boundary children
  const subBoundariesOf = new Map<string, WorldEntity[]>();  // boundaryId → boundary children
  const pushInto = (map: Map<string, WorldEntity[]>, key: string, val: WorldEntity) => {
    const list = map.get(key);
    if (list) list.push(val); else map.set(key, [val]);
  };

  const rootBoundaries: WorldEntity[] = [];
  const rootLeaves: WorldEntity[] = [];
  for (const e of visibleEntities) {
    const nested = !!e.parentBoundary && isVisibleBoundary(e.parentBoundary);
    if (nested) {
      if (e.kind === 'boundary') pushInto(subBoundariesOf, e.parentBoundary!, e);
      else pushInto(leafChildrenOf, e.parentBoundary!, e);
    } else if (e.kind === 'boundary') {
      rootBoundaries.push(e);
    } else {
      rootLeaves.push(e);
    }
  }
  for (const arr of leafChildrenOf.values()) sortByKind(arr);
  sortByKind(rootLeaves);

  // A boundary is worth rendering iff it (transitively) contains a leaf entity.
  const contentMemo = new Map<string, boolean>();
  const hasContent = (bId: string): boolean => {
    const cached = contentMemo.get(bId);
    if (cached !== undefined) return cached;
    contentMemo.set(bId, false); // cycle guard
    const leaves = leafChildrenOf.get(bId) ?? [];
    const subs = subBoundariesOf.get(bId) ?? [];
    const result = leaves.length > 0 || subs.some((s) => hasContent(s.id));
    contentMemo.set(bId, result);
    return result;
  };

  const nodeFields = (e: WorldEntity) => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    description: e.description,
    parentBoundary: e.parentBoundary,
    bestConfidence: bestConfidenceOf(e),
    evidenceCount: e.evidence.length,
  });

  // Recursively lay out a boundary's interior. Child positions are RELATIVE to
  // the boundary (React Flow parentId semantics). Returns the boundary's size and
  // an ORDERED node list where every group node precedes its children, so React
  // Flow can resolve parentId. The boundary's OWN node is emitted by the caller.
  const layoutBoundary = (b: WorldEntity): { w: number; h: number; nodes: MapNode[] } => {
    const nodes: MapNode[] = [];
    const leaves = leafChildrenOf.get(b.id) ?? [];
    const subs = (subBoundariesOf.get(b.id) ?? []).filter((s) => hasContent(s.id));

    const originX = GROUP_PAD_X;
    let cursorY = GROUP_LABEL_H + GROUP_PAD_Y;
    let maxRowW = 0;

    // Leaf children in a grid
    leaves.forEach((leaf, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      nodes.push({
        ...nodeFields(leaf),
        x: originX + col * (NODE_W + NODE_GAP_X),
        y: cursorY + row * (NODE_H + NODE_GAP_Y),
        parentId: b.id,
        contextual: contextualIds.has(leaf.id),
      });
    });
    if (leaves.length > 0) {
      const cols = Math.min(leaves.length, COLS);
      const rows = Math.ceil(leaves.length / COLS);
      maxRowW = Math.max(maxRowW, cols * (NODE_W + NODE_GAP_X) - NODE_GAP_X);
      cursorY += rows * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y;
      if (subs.length > 0) cursorY += GROUP_GAP;
    }

    // Sub-boundaries (recursively) placed below the leaf grid in a wrapping row
    let sx = originX;
    let sy = cursorY;
    let subRowMaxH = 0;
    for (const sub of subs) {
      const laid = layoutBoundary(sub);
      if (sx > originX && (sx - originX) + laid.w > SUB_MAX_ROW) {
        sy += subRowMaxH + GROUP_GAP;
        sx = originX;
        subRowMaxH = 0;
      }
      nodes.push({
        ...nodeFields(sub),
        x: sx,
        y: sy,
        isGroup: true,
        width: laid.w,
        height: laid.h,
        parentId: b.id,
        contextual: contextualIds.has(sub.id),
      });
      nodes.push(...laid.nodes);
      sx += laid.w + GROUP_GAP;
      subRowMaxH = Math.max(subRowMaxH, laid.h);
      maxRowW = Math.max(maxRowW, sx - originX - GROUP_GAP);
    }
    if (subs.length > 0) cursorY = sy + subRowMaxH;

    return {
      w: Math.max(maxRowW + GROUP_PAD_X * 2, 180),
      h: Math.max(cursorY + GROUP_PAD_Y, 80),
      nodes,
    };
  };

  // ── Place top-level boundaries (wrapping row) + orphan leaves below ──
  const mapNodes: MapNode[] = [];
  const renderRoots = rootBoundaries.filter((b) => hasContent(b.id));
  let curX = 0;
  let curY = 0;
  let rowMaxH = 0;
  for (const b of renderRoots) {
    const laid = layoutBoundary(b);
    if (curX > 0 && curX + laid.w > MAX_ROW_WIDTH) {
      curY += rowMaxH + GROUP_GAP;
      curX = 0;
      rowMaxH = 0;
    }
    mapNodes.push({
      ...nodeFields(b),
      x: curX,
      y: curY,
      isGroup: true,
      width: laid.w,
      height: laid.h,
      contextual: contextualIds.has(b.id),
    });
    mapNodes.push(...laid.nodes);
    curX += laid.w + GROUP_GAP;
    rowMaxH = Math.max(rowMaxH, laid.h);
  }

  if (rootLeaves.length > 0) {
    const orphanCols = isBoundaryPerspective ? 4 : COLS;
    const orphanY = renderRoots.length > 0 ? curY + rowMaxH + GROUP_GAP * 2 : 0;
    rootLeaves.forEach((o, i) => {
      const col = i % orphanCols;
      const row = Math.floor(i / orphanCols);
      mapNodes.push({
        ...nodeFields(o),
        x: col * (NODE_W + NODE_GAP_X),
        y: orphanY + row * (NODE_H + NODE_GAP_Y),
        contextual: contextualIds.has(o.id),
      });
    });
  }

  // Edges — only where both endpoints are rendered
  const nodeIds = new Set(mapNodes.map((n) => n.id));
  const mapEdges: MapEdge[] = relationships
    .filter((r) => nodeIds.has(r.source) && nodeIds.has(r.target))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      source: r.source,
      target: r.target,
      bestConfidence: bestConfidenceOfRel(r),
    }));

  // Bounds from TOP-LEVEL nodes only (nested nodes use parent-relative coords).
  // Empty top level (e.g. only childless boundaries) → degenerate finite box, so
  // Math.min(...[]) = Infinity never reaches the client as null/NaN.
  const topLevel = mapNodes.filter((n) => !n.parentId);
  const allX: number[] = [];
  const allY: number[] = [];
  for (const n of topLevel) {
    allX.push(n.x, n.x + (n.width ?? NODE_W));
    allY.push(n.y, n.y + (n.height ?? NODE_H));
  }
  const bounds = topLevel.length === 0
    ? { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    : {
        minX: Math.min(...allX) - 40,
        maxX: Math.max(...allX) + 40,
        minY: Math.min(...allY) - 40,
        maxY: Math.max(...allY) + 40,
      };

  return {
    nodes: mapNodes,
    edges: mapEdges,
    activePerspective: activePerspectiveId ?? 'perspective:default',
    perspectives: perspectiveSummaries,
    bounds,
  };
}

function bestConfidenceOf(entity: WorldEntity): Confidence {
  let best: Confidence = 'speculative';
  for (const ev of entity.evidence) {
    if (CONFIDENCE_RANK[ev.confidence] > CONFIDENCE_RANK[best]) best = ev.confidence;
  }
  return best;
}

function bestConfidenceOfRel(rel: WorldRelationship): Confidence {
  let best: Confidence = 'speculative';
  for (const ev of rel.evidence) {
    if (CONFIDENCE_RANK[ev.confidence] > CONFIDENCE_RANK[best]) best = ev.confidence;
  }
  return best;
}

import {
  type WorldModelSnapshot,
  type WorldEntity,
  type WorldRelationship,
  type Perspective,
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

  // Separate boundaries from their contents (among visible entities)
  const allBoundaries = visibleEntities.filter((e) => e.kind === 'boundary');
  const nonBoundaries = visibleEntities.filter((e) => e.kind !== 'boundary');

  // When inside a boundary-derived perspective, don't group children under
  // their parent — they ARE the world now. The parent is the context (breadcrumb),
  // not a container on the map.
  const isBoundaryPerspective = !isDefault && activePerspective?.source === 'boundary';
  const parentBoundaryId = isBoundaryPerspective
    ? entities.find((e) => e.kind === 'boundary' && `perspective:${e.name}` === activePerspectiveId)?.id
    : null;

  // Group children by parent boundary
  const childrenOf = new Map<string, WorldEntity[]>();
  const orphans: WorldEntity[] = [];
  for (const e of nonBoundaries) {
    // If we're inside a boundary perspective, treat direct children as top-level
    if (isBoundaryPerspective && e.parentBoundary === parentBoundaryId) {
      orphans.push(e);
    } else if (e.parentBoundary && visibleIds.has(e.parentBoundary)) {
      const list = childrenOf.get(e.parentBoundary) ?? [];
      list.push(e);
      childrenOf.set(e.parentBoundary, list);
    } else {
      orphans.push(e);
    }
  }

  // Only show boundaries that have children
  const boundaries = allBoundaries.filter(
    (b) => (childrenOf.get(b.id) ?? []).length > 0,
  );

  // Sort children within each group by kind for visual consistency
  const kindOrder: Record<string, number> = {
    actor: 0, capability: 1, entity: 2,
    'side-effect': 3, invariant: 4, 'failure-point': 5,
    transition: 6, dependency: 7, 'async-process': 8,
  };
  for (const children of childrenOf.values()) {
    children.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));
  }
  orphans.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));

  const mapNodes: MapNode[] = [];

  // Compute sizes and positions for each boundary group
  // Arrange boundaries in rows that wrap to avoid overly wide layouts
  const groupSizes: { id: string; w: number; h: number }[] = [];
  for (const boundary of boundaries) {
    const children = childrenOf.get(boundary.id) ?? [];
    const cols = Math.min(children.length, COLS);
    const rows = Math.max(1, Math.ceil(children.length / COLS));
    const w = cols * (NODE_W + NODE_GAP_X) - NODE_GAP_X + GROUP_PAD_X * 2;
    const h = rows * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y + GROUP_PAD_Y * 2 + GROUP_LABEL_H;
    groupSizes.push({ id: boundary.id, w: Math.max(w, 180), h: Math.max(h, 80) });
  }

  // Lay out groups in a wrapping row (wrap after ~2 groups to keep it compact)
  const MAX_ROW_WIDTH = 1200;
  let curX = 0;
  let curY = 0;
  let rowMaxH = 0;
  const groupPositions = new Map<string, { x: number; y: number; w: number; h: number }>();

  for (const gs of groupSizes) {
    if (curX > 0 && curX + gs.w > MAX_ROW_WIDTH) {
      // Wrap to next row
      curY += rowMaxH + GROUP_GAP;
      curX = 0;
      rowMaxH = 0;
    }
    groupPositions.set(gs.id, { x: curX, y: curY, w: gs.w, h: gs.h });
    curX += gs.w + GROUP_GAP;
    rowMaxH = Math.max(rowMaxH, gs.h);
  }

  // Emit boundary group nodes + their children
  for (const boundary of boundaries) {
    const pos = groupPositions.get(boundary.id)!;
    const children = childrenOf.get(boundary.id) ?? [];

    // Boundary as a group node
    mapNodes.push({
      id: boundary.id,
      kind: boundary.kind,
      name: boundary.name,
      description: boundary.description,
      bestConfidence: bestConfidenceOf(boundary),
      evidenceCount: boundary.evidence.length,
      x: pos.x,
      y: pos.y,
      isGroup: true,
      width: pos.w,
      height: pos.h,
    });

    // Children positioned in a grid relative to the group
    children.forEach((child, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      mapNodes.push({
        id: child.id,
        kind: child.kind,
        name: child.name,
        description: child.description,
        parentBoundary: child.parentBoundary,
        bestConfidence: bestConfidenceOf(child),
        evidenceCount: child.evidence.length,
        x: GROUP_PAD_X + col * (NODE_W + NODE_GAP_X),
        y: GROUP_LABEL_H + GROUP_PAD_Y + row * (NODE_H + NODE_GAP_Y),
        parentId: boundary.id,
        contextual: contextualIds.has(child.id),
      });
    });
  }

  // Orphan nodes — when inside a boundary perspective these are the primary
  // content, so use wider layout. Otherwise placed below groups.
  if (orphans.length > 0) {
    const orphanCols = isBoundaryPerspective ? 4 : COLS;
    const orphanY = boundaries.length > 0 ? curY + rowMaxH + GROUP_GAP * 2 : 0;
    orphans.forEach((o, i) => {
      const col = i % orphanCols;
      const row = Math.floor(i / orphanCols);
      mapNodes.push({
        id: o.id,
        kind: o.kind,
        name: o.name,
        description: o.description,
        bestConfidence: bestConfidenceOf(o),
        evidenceCount: o.evidence.length,
        x: col * (NODE_W + NODE_GAP_X),
        y: orphanY + row * (NODE_H + NODE_GAP_Y),
        contextual: contextualIds.has(o.id),
      });
    });
  }

  // Edges — only where both endpoints exist in the output
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

  // Bounds
  const allX: number[] = [];
  const allY: number[] = [];
  for (const n of mapNodes) {
    allX.push(n.x, n.x + (n.width ?? NODE_W));
    allY.push(n.y, n.y + (n.height ?? NODE_H));
  }
  const bounds = {
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

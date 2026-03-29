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
  const { entities, relationships } = snapshot;

  if (entities.length === 0) {
    return { nodes: [], edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  const entityIndex = new Map<string, WorldEntity>();
  for (const e of entities) entityIndex.set(e.id, e);

  // Separate boundaries from their contents
  const allBoundaries = entities.filter((e) => e.kind === 'boundary');
  const nonBoundaries = entities.filter((e) => e.kind !== 'boundary');

  // Group children by parent boundary
  const childrenOf = new Map<string, WorldEntity[]>();
  const orphans: WorldEntity[] = [];
  for (const e of nonBoundaries) {
    if (e.parentBoundary && entityIndex.has(e.parentBoundary)) {
      const list = childrenOf.get(e.parentBoundary) ?? [];
      list.push(e);
      childrenOf.set(e.parentBoundary, list);
    } else {
      orphans.push(e);
    }
  }

  // Only show boundaries that have children — empty ones add noise
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
      });
    });
  }

  // Orphan nodes (no parent boundary) — placed below all groups
  if (orphans.length > 0) {
    const orphanY = curY + rowMaxH + GROUP_GAP * 2;
    orphans.forEach((o, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      mapNodes.push({
        id: o.id,
        kind: o.kind,
        name: o.name,
        description: o.description,
        bestConfidence: bestConfidenceOf(o),
        evidenceCount: o.evidence.length,
        x: col * (NODE_W + NODE_GAP_X),
        y: orphanY + row * (NODE_H + NODE_GAP_Y),
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

  return { nodes: mapNodes, edges: mapEdges, bounds };
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

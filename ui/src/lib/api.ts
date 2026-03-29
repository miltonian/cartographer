const BASE = '/api';

export interface MapProjection {
  nodes: MapNode[];
  edges: MapEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface MapNode {
  id: string;
  kind: string;
  name: string;
  description?: string;
  parentBoundary?: string;
  bestConfidence: string;
  evidenceCount: number;
  x: number;
  y: number;
  isGroup?: boolean;
  width?: number;
  height?: number;
  parentId?: string;
}

export interface MapEdge {
  id: string;
  kind: string;
  source: string;
  target: string;
  bestConfidence: string;
}

export interface MapCluster {
  id: string;
  name: string;
  entityIds: string[];
  x: number;
  y: number;
  radius: number;
}

export interface SourceAnchor {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
}

export interface Evidence {
  id: string;
  anchors: SourceAnchor[];
  confidence: string;
  provenance: string;
  reasoning?: string;
  tool?: string;
  supportingFacts?: string[];
  createdAt: string;
}

export interface WorldEntity {
  id: string;
  kind: string;
  name: string;
  description?: string;
  evidence: Evidence[];
  parentBoundary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorldRelationship {
  id: string;
  kind: string;
  source: string;
  target: string;
  description?: string;
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityDetails {
  entity: WorldEntity;
  incoming: WorldRelationship[];
  outgoing: WorldRelationship[];
  relatedEntities: WorldEntity[];
}

export interface SliceStep {
  entityId: string;
  label?: string;
}

export interface BehaviorSlice {
  id: string;
  name: string;
  description?: string;
  steps: SliceStep[];
  createdAt: string;
}

export interface ModelSummary {
  projectRoot: string;
  entityCount: number;
  relationshipCount: number;
  entitiesByKind: Record<string, number>;
  relationshipsByKind: Record<string, number>;
  confidenceDistribution: Record<string, number>;
  lastUpdated: string;
}

export async function fetchProjection(): Promise<MapProjection> {
  const res = await fetch(`${BASE}/projection/map`);
  return res.json();
}

export async function fetchEntityDetails(id: string): Promise<EntityDetails> {
  const res = await fetch(`${BASE}/entities/${encodeURIComponent(id)}`);
  return res.json();
}

export async function fetchSlices(): Promise<BehaviorSlice[]> {
  const res = await fetch(`${BASE}/slices`);
  const data = await res.json();
  return data.slices;
}

export async function fetchSummary(): Promise<ModelSummary> {
  const res = await fetch(`${BASE}/summary`);
  return res.json();
}

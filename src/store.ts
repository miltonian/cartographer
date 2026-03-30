import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  type WorldEntity,
  type WorldRelationship,
  type WorldModelSnapshot,
  type ModelSummary,
  type Evidence,
  type EntityKind,
  type RelationshipKind,
  type Confidence,
  type BehaviorSlice,
  type SliceStep,
  type Perspective,
  CONFIDENCE_RANK,
} from './ontology.js';

// ─── Query Types ───────────────────────────────────────────────

export interface EntityQuery {
  kind?: EntityKind;
  namePattern?: string;  // regex
  involves?: string;     // entity ID (as source or target in any relationship)
  minConfidence?: Confidence;
  parentBoundary?: string;
  limit?: number;
}

export interface RelationshipQuery {
  kind?: RelationshipKind;
  source?: string;
  target?: string;
  involves?: string;  // either source or target
  minConfidence?: Confidence;
  limit?: number;
}

export interface EntityDetails {
  entity: WorldEntity;
  incoming: WorldRelationship[];
  outgoing: WorldRelationship[];
  relatedEntities: WorldEntity[];
}

// ─── Store Events ──────────────────────────────────────────────

export interface StoreEvents {
  'entity:added': [entity: WorldEntity];
  'entity:updated': [entity: WorldEntity];
  'relationship:added': [relationship: WorldRelationship];
  'relationship:updated': [relationship: WorldRelationship];
  'slice:added': [slice: BehaviorSlice];
  'slice:updated': [slice: BehaviorSlice];
  'model:cleared': [];
}

// ─── World Model Store ─────────────────────────────────────────

export class WorldModelStore extends EventEmitter<StoreEvents> {
  private entities = new Map<string, WorldEntity>();
  private relationships = new Map<string, WorldRelationship>();
  private slices = new Map<string, BehaviorSlice>();
  private perspectives = new Map<string, Perspective>();
  private activePerspectiveId = 'perspective:default';
  private modelId: string;
  private rootPath: string;
  private persistPath: string;
  private createdAt: string;
  private updatedAt: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private evidenceCounter = 0;

  constructor(rootPath: string, dataDir?: string) {
    super();
    this.rootPath = rootPath;
    const resolvedDataDir = dataDir ?? path.join(rootPath, '.cartographer');
    this.persistPath = path.join(resolvedDataDir, 'model.json');
    this.modelId = `model:${path.basename(rootPath)}`;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;

    // Ensure the default perspective always exists
    this.ensureDefaultPerspective();

    fs.mkdirSync(resolvedDataDir, { recursive: true });
    this.loadFromDisk();
  }

  private ensureDefaultPerspective(): void {
    if (!this.perspectives.has('perspective:default')) {
      const now = new Date().toISOString();
      this.perspectives.set('perspective:default', {
        id: 'perspective:default',
        name: 'default',
        description: 'Full system overview — all entities',
        entityIds: [],
        sliceIds: [],
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ─── Write Operations ──────────────────────────────────────

  writeEntity(input: {
    kind: EntityKind;
    name: string;
    description?: string;
    evidence: Omit<Evidence, 'id' | 'createdAt'>;
    parentBoundary?: string;
    metadata?: Record<string, unknown>;
  }): { id: string; created: boolean } {
    const id = this.entityId(input.kind, input.name);
    const now = new Date().toISOString();
    const evidenceEntry: Evidence = {
      ...input.evidence,
      id: this.nextEvidenceId(),
      createdAt: now,
    };

    const existing = this.entities.get(id);
    if (existing) {
      // Update: append evidence, merge description/metadata
      existing.evidence.push(evidenceEntry);
      if (input.description) existing.description = input.description;
      if (input.parentBoundary) existing.parentBoundary = input.parentBoundary;
      if (input.metadata) {
        existing.metadata = { ...existing.metadata, ...input.metadata };
      }
      existing.updatedAt = now;
      this.addEntityToActivePerspective(id);
      this.markDirty();
      this.emit('entity:updated', existing);
      return { id, created: false };
    }

    const entity: WorldEntity = {
      id,
      kind: input.kind,
      name: input.name,
      description: input.description,
      evidence: [evidenceEntry],
      parentBoundary: input.parentBoundary,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.entities.set(id, entity);
    this.addEntityToActivePerspective(id);
    this.markDirty();
    this.emit('entity:added', entity);
    return { id, created: true };
  }

  writeRelationship(input: {
    kind: RelationshipKind;
    source: string;
    target: string;
    description?: string;
    evidence: Omit<Evidence, 'id' | 'createdAt'>;
    metadata?: Record<string, unknown>;
  }): { id: string; created: boolean } {
    const baseId = `${input.source}>${input.kind}>${input.target}`;
    const now = new Date().toISOString();
    const evidenceEntry: Evidence = {
      ...input.evidence,
      id: this.nextEvidenceId(),
      createdAt: now,
    };

    const existing = this.relationships.get(baseId);
    if (existing) {
      existing.evidence.push(evidenceEntry);
      if (input.description) existing.description = input.description;
      if (input.metadata) {
        existing.metadata = { ...existing.metadata, ...input.metadata };
      }
      existing.updatedAt = now;
      this.markDirty();
      this.emit('relationship:updated', existing);
      return { id: baseId, created: false };
    }

    const rel: WorldRelationship = {
      id: baseId,
      kind: input.kind,
      source: input.source,
      target: input.target,
      description: input.description,
      evidence: [evidenceEntry],
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.relationships.set(baseId, rel);
    this.markDirty();
    this.emit('relationship:added', rel);
    return { id: baseId, created: true };
  }

  writeSlice(input: {
    name: string;
    description?: string;
    kind?: 'flow' | 'changeset';
    steps: SliceStep[];
    evidence: Omit<Evidence, 'id' | 'createdAt'>;
  }): { id: string; created: boolean } {
    const id = `slice:${input.name}`;
    const now = new Date().toISOString();
    const evidenceEntry: Evidence = {
      ...input.evidence,
      id: this.nextEvidenceId(),
      createdAt: now,
    };

    const existing = this.slices.get(id);
    if (existing) {
      existing.steps = input.steps;
      existing.evidence.push(evidenceEntry);
      if (input.description) existing.description = input.description;
      existing.updatedAt = now;
      this.addSliceToActivePerspective(id);
      this.markDirty();
      this.emit('slice:updated', existing);
      return { id, created: false };
    }

    const slice: BehaviorSlice = {
      id,
      name: input.name,
      description: input.description,
      kind: input.kind,
      steps: input.steps,
      evidence: [evidenceEntry],
      createdAt: now,
      updatedAt: now,
    };
    this.slices.set(id, slice);
    this.addSliceToActivePerspective(id);
    this.markDirty();
    this.emit('slice:added', slice);
    return { id, created: true };
  }

  // ─── Read Operations ───────────────────────────────────────

  getEntity(id: string): WorldEntity | undefined {
    return this.entities.get(id);
  }

  getEntityDetails(id: string): EntityDetails | null {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const incoming: WorldRelationship[] = [];
    const outgoing: WorldRelationship[] = [];
    const relatedIds = new Set<string>();

    for (const rel of this.relationships.values()) {
      if (rel.target === id) {
        incoming.push(rel);
        relatedIds.add(rel.source);
      }
      if (rel.source === id) {
        outgoing.push(rel);
        relatedIds.add(rel.target);
      }
    }

    const relatedEntities = Array.from(relatedIds)
      .map(rid => this.entities.get(rid))
      .filter((e): e is WorldEntity => e !== undefined);

    return { entity, incoming, outgoing, relatedEntities };
  }

  queryEntities(query: EntityQuery): WorldEntity[] {
    const limit = query.limit ?? 50;
    const results: WorldEntity[] = [];
    const minRank = query.minConfidence
      ? CONFIDENCE_RANK[query.minConfidence]
      : 0;

    // If `involves` is set, find all entities connected to that entity
    let involvedIds: Set<string> | null = null;
    if (query.involves) {
      involvedIds = new Set<string>();
      for (const rel of this.relationships.values()) {
        if (rel.source === query.involves) involvedIds.add(rel.target);
        if (rel.target === query.involves) involvedIds.add(rel.source);
      }
    }

    let nameRegex: RegExp | null = null;
    if (query.namePattern) {
      try { nameRegex = new RegExp(query.namePattern, 'i'); }
      catch { nameRegex = new RegExp(query.namePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    }

    for (const entity of this.entities.values()) {
      if (results.length >= limit) break;
      if (query.kind && entity.kind !== query.kind) continue;
      if (nameRegex && !nameRegex.test(entity.name)) continue;
      if (query.parentBoundary && entity.parentBoundary !== query.parentBoundary) continue;
      if (involvedIds && !involvedIds.has(entity.id)) continue;
      if (minRank > 0) {
        const best = this.bestConfidence(entity.evidence);
        if (CONFIDENCE_RANK[best] < minRank) continue;
      }
      results.push(entity);
    }
    return results;
  }

  queryRelationships(query: RelationshipQuery): WorldRelationship[] {
    const limit = query.limit ?? 50;
    const results: WorldRelationship[] = [];
    const minRank = query.minConfidence
      ? CONFIDENCE_RANK[query.minConfidence]
      : 0;

    for (const rel of this.relationships.values()) {
      if (results.length >= limit) break;
      if (query.kind && rel.kind !== query.kind) continue;
      if (query.source && rel.source !== query.source) continue;
      if (query.target && rel.target !== query.target) continue;
      if (query.involves && rel.source !== query.involves && rel.target !== query.involves) continue;
      if (minRank > 0) {
        const best = this.bestConfidence(rel.evidence);
        if (CONFIDENCE_RANK[best] < minRank) continue;
      }
      results.push(rel);
    }
    return results;
  }

  getSummary(): ModelSummary {
    const entitiesByKind: Partial<Record<EntityKind, number>> = {};
    const relationshipsByKind: Partial<Record<RelationshipKind, number>> = {};
    const confidenceDistribution: Partial<Record<Confidence, number>> = {};

    for (const e of this.entities.values()) {
      entitiesByKind[e.kind] = (entitiesByKind[e.kind] ?? 0) + 1;
      for (const ev of e.evidence) {
        confidenceDistribution[ev.confidence] =
          (confidenceDistribution[ev.confidence] ?? 0) + 1;
      }
    }
    for (const r of this.relationships.values()) {
      relationshipsByKind[r.kind] = (relationshipsByKind[r.kind] ?? 0) + 1;
      for (const ev of r.evidence) {
        confidenceDistribution[ev.confidence] =
          (confidenceDistribution[ev.confidence] ?? 0) + 1;
      }
    }

    return {
      projectRoot: this.rootPath,
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
      sliceCount: this.slices.size,
      perspectiveCount: this.perspectives.size,
      activePerspective: this.activePerspectiveId,
      entitiesByKind,
      relationshipsByKind,
      confidenceDistribution,
      lastUpdated: this.updatedAt,
    };
  }

  // ─── Model Management ─────────────────────────────────────

  setProject(rootPath: string): void {
    if (this.entities.size > 0) this.saveSnapshot('pre-switch');
    this.persistToDisk();
    this.entities.clear();
    this.relationships.clear();
    this.slices.clear();
    this.perspectives.clear();
    this.activePerspectiveId = 'perspective:default';
    this.evidenceCounter = 0;
    this.rootPath = rootPath;
    const dataDir = path.join(rootPath, '.cartographer');
    fs.mkdirSync(dataDir, { recursive: true });
    this.persistPath = path.join(dataDir, 'model.json');
    this.modelId = `model:${path.basename(rootPath)}`;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.ensureDefaultPerspective();
    this.loadFromDisk();
    this.emit('model:cleared');
  }

  getSlices(): BehaviorSlice[] {
    return Array.from(this.slices.values());
  }

  // ─── Perspective Operations ────────────────────────────────

  createPerspective(input: {
    name: string;
    description?: string;
  }): Perspective {
    const id = `perspective:${input.name}`;
    const now = new Date().toISOString();
    const existing = this.perspectives.get(id);
    if (existing) {
      if (input.description) existing.description = input.description;
      existing.updatedAt = now;
      this.markDirty();
      return existing;
    }
    const perspective: Perspective = {
      id,
      name: input.name,
      description: input.description,
      entityIds: [],
      sliceIds: [],
      source: 'agent',
      createdAt: now,
      updatedAt: now,
    };
    this.perspectives.set(id, perspective);
    this.markDirty();
    return perspective;
  }

  switchPerspective(id: string): Perspective | null {
    const perspective = this.perspectives.get(id);
    if (!perspective) return null;
    this.activePerspectiveId = id;
    this.markDirty();
    // Don't emit model:cleared — perspective switching is client-side via URL.
    // Emitting here causes a race condition where loadData() fires with stale state.
    return perspective;
  }

  getActivePerspective(): Perspective {
    return this.perspectives.get(this.activePerspectiveId)
      ?? this.perspectives.get('perspective:default')!;
  }

  listPerspectives(): Perspective[] {
    return Array.from(this.perspectives.values());
  }

  addEntityToPerspective(entityId: string, perspectiveId: string): boolean {
    const perspective = this.perspectives.get(perspectiveId);
    if (!perspective || perspective.isDefault) return false;
    if (!perspective.entityIds.includes(entityId)) {
      perspective.entityIds.push(entityId);
      perspective.updatedAt = new Date().toISOString();
      this.markDirty();
    }
    return true;
  }

  removeEntityFromPerspective(entityId: string, perspectiveId: string): boolean {
    const perspective = this.perspectives.get(perspectiveId);
    if (!perspective || perspective.isDefault) return false;
    const idx = perspective.entityIds.indexOf(entityId);
    if (idx >= 0) {
      perspective.entityIds.splice(idx, 1);
      perspective.updatedAt = new Date().toISOString();
      this.markDirty();
    }
    return true;
  }

  createPerspectiveFromBoundary(boundaryId: string): Perspective | null {
    const boundary = this.entities.get(boundaryId);
    if (!boundary || boundary.kind !== 'boundary') return null;

    const id = `perspective:${boundary.name}`;
    const existing = this.perspectives.get(id);
    if (existing && !existing.isDefault) return existing;

    const childIds: string[] = [];
    for (const e of this.entities.values()) {
      if (e.parentBoundary === boundaryId) {
        childIds.push(e.id);
      }
    }
    if (childIds.length === 0) return null;

    // Find slices where at least half the steps involve children of this boundary
    const childSet = new Set(childIds);
    const relevantSliceIds: string[] = [];
    for (const s of this.slices.values()) {
      const hits = s.steps.filter((step) => childSet.has(step.entityId)).length;
      if (hits >= Math.ceil(s.steps.length / 2)) {
        relevantSliceIds.push(s.id);
      }
    }

    const now = new Date().toISOString();
    const perspective: Perspective = {
      id,
      name: boundary.name,
      description: `Inside boundary: ${boundary.name}`,
      entityIds: childIds,
      sliceIds: relevantSliceIds,
      source: 'boundary',
      createdAt: now,
      updatedAt: now,
    };
    this.perspectives.set(id, perspective);
    this.markDirty();
    return perspective;
  }

  private addEntityToActivePerspective(entityId: string): void {
    const perspective = this.perspectives.get(this.activePerspectiveId);
    if (!perspective || perspective.isDefault) return;
    if (!perspective.entityIds.includes(entityId)) {
      perspective.entityIds.push(entityId);
      perspective.updatedAt = new Date().toISOString();
    }
  }

  private addSliceToActivePerspective(sliceId: string): void {
    const perspective = this.perspectives.get(this.activePerspectiveId);
    if (!perspective || perspective.isDefault) return;
    if (!perspective.sliceIds.includes(sliceId)) {
      perspective.sliceIds.push(sliceId);
      perspective.updatedAt = new Date().toISOString();
    }
  }

  clear(): void {
    if (this.entities.size > 0) this.saveSnapshot('pre-clear');
    this.entities.clear();
    this.relationships.clear();
    this.slices.clear();
    this.perspectives.clear();
    this.activePerspectiveId = 'perspective:default';
    this.ensureDefaultPerspective();
    this.evidenceCounter = 0;
    this.updatedAt = new Date().toISOString();
    this.markDirty();
    this.emit('model:cleared');
  }

  getSnapshot(): WorldModelSnapshot {
    return {
      id: this.modelId,
      rootPath: this.rootPath,
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values()),
      slices: Array.from(this.slices.values()),
      perspectives: Array.from(this.perspectives.values()),
      activePerspectiveId: this.activePerspectiveId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // ─── Persistence ───────────────────────────────────────────

  private loadFromDisk(): void {
    if (!fs.existsSync(this.persistPath)) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf-8');
      const data: WorldModelSnapshot = JSON.parse(raw);
      this.modelId = data.id;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
      for (const e of data.entities) {
        this.entities.set(e.id, e);
      }
      for (const r of data.relationships) {
        this.relationships.set(r.id, r);
      }
      for (const s of data.slices ?? []) {
        this.slices.set(s.id, s);
      }
      for (const p of data.perspectives ?? []) {
        this.perspectives.set(p.id, p);
      }
      if (data.activePerspectiveId) {
        this.activePerspectiveId = data.activePerspectiveId;
      }
      this.ensureDefaultPerspective();
      // Restore evidence counter from existing evidence IDs
      for (const e of data.entities) {
        for (const ev of e.evidence) {
          const num = parseInt(ev.id.replace('ev:', ''), 10);
          if (num >= this.evidenceCounter) this.evidenceCounter = num + 1;
        }
      }
      for (const r of data.relationships) {
        for (const ev of r.evidence) {
          const num = parseInt(ev.id.replace('ev:', ''), 10);
          if (num >= this.evidenceCounter) this.evidenceCounter = num + 1;
        }
      }
    } catch (err) {
      console.error('[cartographer] WARNING: model.json is corrupted or unreadable. Starting with empty model.', err);
      // Save the corrupted file for debugging
      try {
        const backupPath = this.persistPath + '.corrupted';
        fs.copyFileSync(this.persistPath, backupPath);
        console.error(`[cartographer] Corrupted file saved to: ${backupPath}`);
      } catch { /* best effort */ }
    }
  }

  private markDirty(): void {
    this.updatedAt = new Date().toISOString();
    // Persist synchronously on every write. A model with hundreds of entities
    // serializes in <5ms, and data loss from kill -9 is worse than a small write cost.
    this.persistToDisk();
  }

  persistToDisk(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const snapshot = this.getSnapshot();
    fs.writeFileSync(this.persistPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  // ─── Snapshots ─────────────────────────────────────────────

  private get snapshotDir(): string {
    return path.join(path.dirname(this.persistPath), 'snapshots');
  }

  saveSnapshot(label?: string): string {
    if (!fs.existsSync(this.persistPath)) return '';
    fs.mkdirSync(this.snapshotDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = label ? `-${label.replace(/[^a-zA-Z0-9-]/g, '_')}` : '';
    const filename = `model.${ts}${suffix}.json`;
    const dest = path.join(this.snapshotDir, filename);
    fs.copyFileSync(this.persistPath, dest);
    this.pruneSnapshots(10);
    return filename;
  }

  listSnapshots(): { filename: string; size: number; created: string }[] {
    if (!fs.existsSync(this.snapshotDir)) return [];
    return fs.readdirSync(this.snapshotDir)
      .filter((f) => f.startsWith('model.') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => {
        const stat = fs.statSync(path.join(this.snapshotDir, f));
        return { filename: f, size: stat.size, created: stat.mtime.toISOString() };
      });
  }

  restoreSnapshot(filename: string): boolean {
    const src = path.join(this.snapshotDir, filename);
    if (!fs.existsSync(src)) return false;
    // Save current state as a snapshot before restoring
    this.saveSnapshot('pre-restore');
    // Replace current model
    fs.copyFileSync(src, this.persistPath);
    // Reload
    this.entities.clear();
    this.relationships.clear();
    this.slices.clear();
    this.perspectives.clear();
    this.evidenceCounter = 0;
    this.ensureDefaultPerspective();
    this.loadFromDisk();
    this.emit('model:cleared');
    return true;
  }

  private pruneSnapshots(keep: number): void {
    const snapshots = this.listSnapshots();
    if (snapshots.length <= keep) return;
    for (const s of snapshots.slice(keep)) {
      fs.unlinkSync(path.join(this.snapshotDir, s.filename));
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  private entityId(kind: EntityKind, name: string): string {
    return `${kind}:${name}`;
  }

  private nextEvidenceId(): string {
    return `ev:${this.evidenceCounter++}`;
  }

  private bestConfidence(evidence: Evidence[]): Confidence {
    let best: Confidence = 'speculative';
    for (const ev of evidence) {
      if (CONFIDENCE_RANK[ev.confidence] > CONFIDENCE_RANK[best]) {
        best = ev.confidence;
      }
    }
    return best;
  }
}

// ─── Entity Kinds ──────────────────────────────────────────────
// These are the foundational types in the world-model.
// Language-specific constructs (React component, Go handler, etc.)
// map INTO these kinds via the agent's reasoning — they are not
// the ontology themselves.

export const ENTITY_KINDS = [
  'boundary',        // A named region with a public interface (module, package, subsystem)
  'capability',      // Something the system can do (function, method, handler)
  'actor',           // An entrypoint where external intent enters (route, CLI command, listener)
  'entity',          // A thing with state that persists or transforms (DB row, session, cache)
  'transition',      // A state change or causal link between capabilities
  'dependency',      // A structural reliance of one thing on another
  'side-effect',     // An observable consequence outside the current boundary
  'async-process',   // A behavior spanning time or execution contexts
  'invariant',       // A property that must hold true across operations
  'failure-point',   // A location where the system can fail or degrade
] as const;

export type EntityKind = typeof ENTITY_KINDS[number];

// ─── Relationship Kinds ────────────────────────────────────────

export const RELATIONSHIP_KINDS = [
  'contains',    // Boundary → any: structural containment
  'invokes',     // Capability → Capability: one calls another
  'renders',     // Capability → Capability: UI composition
  'reads',       // Capability → Entity: accesses state
  'writes',      // Capability → Entity: mutates state
  'depends-on',  // any → any: structural dependency
  'triggers',    // Capability → SideEffect: causes external effect
  'produces',    // Capability → Entity: creates new instance
  'consumes',    // Capability → Entity: destroys/absorbs
  'guards',      // Invariant → Transition: constrains
  'exposes',     // Boundary → Capability: public interface
  'enters-at',   // Actor → Boundary: where intent arrives
] as const;

export type RelationshipKind = typeof RELATIONSHIP_KINDS[number];

// ─── Confidence ────────────────────────────────────────────────
// Hard line between proven and everything else.

export const CONFIDENCE_LEVELS = [
  'proven',       // Deterministic analysis from source. Verifiable.
  'high',         // Strong evidence, one inference step.
  'medium',       // Plausible inference from multiple signals.
  'low',          // Weak inference, likely but uncertain.
  'speculative',  // Hypothesis, not yet supported by evidence.
] as const;

export type Confidence = typeof CONFIDENCE_LEVELS[number];

// Numeric ordering for filtering (higher = more certain)
export const CONFIDENCE_RANK: Record<Confidence, number> = {
  proven: 5,
  high: 4,
  medium: 3,
  low: 2,
  speculative: 1,
};

// ─── Provenance ────────────────────────────────────────────────

export const PROVENANCE_KINDS = [
  'deterministic',  // Produced by a deterministic tool (AST parser, etc.)
  'inferred',       // Synthesized by the agent from other facts
  'annotated',      // Provided by a human (user correction, annotation)
] as const;

export type Provenance = typeof PROVENANCE_KINDS[number];

// ─── Source Anchors ────────────────────────────────────────────
// Every fact grounded in source code carries at least one anchor.

export interface SourceAnchor {
  filePath: string;   // Relative to project root
  lineStart: number;
  lineEnd: number;
  snippet: string;    // Verbatim source text
}

// ─── Evidence ──────────────────────────────────────────────────
// The proof behind a fact. Separates what we know from how we know it.

export interface Evidence {
  id: string;
  anchors: SourceAnchor[];
  confidence: Confidence;
  provenance: Provenance;
  reasoning?: string;          // Required when confidence !== 'proven'
  tool?: string;               // Which capability produced this (e.g., 'Read', 'Grep', 'ast-parser')
  supportingFacts?: string[];  // Fact IDs this was inferred from
  createdAt: string;
}

// ─── Core Entities ─────────────────────────────────────────────

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  name: string;
  description?: string;
  evidence: Evidence[];
  parentBoundary?: string;   // Entity ID of containing boundary
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorldRelationship {
  id: string;
  kind: RelationshipKind;
  source: string;  // Entity ID
  target: string;  // Entity ID
  description?: string;
  evidence: Evidence[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Behavior Slices ───────────────────────────────────────────
// A named, ordered path through the graph — a storyline.
// "When X happens, these things fire in this order."
// kind: 'flow' = runtime behavior, 'changeset' = PR/change review

export type SliceKind = 'flow' | 'changeset';

export type ChangeType = 'added' | 'modified' | 'removed' | 'affected';

export interface SliceStep {
  entityId: string;        // Reference to an entity in the model
  label?: string;          // What happens at this step
  changeType?: ChangeType; // For changesets: what type of change at this entity
}

export interface BehaviorSlice {
  id: string;
  name: string;           // "Fact write lifecycle" or "PR #123: Add auth"
  description?: string;   // "What happens when..." or PR description
  kind?: SliceKind;       // 'flow' (default) or 'changeset'
  steps: SliceStep[];     // Ordered path through entities
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
}

// ─── Perspectives ──────────────────────────────────────────────
// A named lens over the shared entity pool. Defines which entities
// and slices are in focus for a particular concern or question.
// The "default" perspective is virtual — it always includes everything.

export interface Perspective {
  id: string;             // "perspective:auth"
  name: string;           // "auth"
  description?: string;   // "Authentication and authorization subsystem"
  entityIds: string[];    // Entities in focus for this perspective
  sliceIds: string[];     // Behavior slices relevant to this perspective
  isDefault?: boolean;    // True only for the virtual "default" perspective
  createdAt: string;
  updatedAt: string;
}

// ─── World Model ───────────────────────────────────────────────

export interface WorldModelSnapshot {
  id: string;
  rootPath: string;
  entities: WorldEntity[];
  relationships: WorldRelationship[];
  slices: BehaviorSlice[];
  perspectives: Perspective[];
  activePerspectiveId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelSummary {
  projectRoot: string;
  entityCount: number;
  relationshipCount: number;
  sliceCount: number;
  perspectiveCount: number;
  activePerspective: string;
  entitiesByKind: Partial<Record<EntityKind, number>>;
  relationshipsByKind: Partial<Record<RelationshipKind, number>>;
  confidenceDistribution: Partial<Record<Confidence, number>>;
  lastUpdated: string;
}

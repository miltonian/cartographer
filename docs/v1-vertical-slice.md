# Cartographer — V1 Vertical Slice

## End-to-End Proof

The first proof that this architecture works:

### Step 1: Plugin triggers analysis
User runs `/cartographer analyze` or asks Claude "analyze this codebase."
The `analyze` skill guides Claude through systematic discovery.

### Step 2: Agent reads and records
Claude uses native Read/Grep/Glob to inspect the codebase.
For each discovery, Claude calls MCP tools:
- `cartographer_write_entity` — record boundaries, actors, capabilities
- `cartographer_write_relationship` — record invocations, containment, data flow
Each call includes source evidence (file path, line range, snippet, confidence).

### Step 3: Service stores and broadcasts
The local service:
- Validates and stores the entity/relationship
- Assigns a stable ID
- Persists to `.cartographer/model.json`
- Broadcasts the update via WebSocket

### Step 4: Browser shows map
User opens `http://localhost:3847` (or plugin opens it via `cartographer_open_map`).
Browser renders:
- Entities as colored nodes (color = entity kind)
- Relationships as directional edges
- Spatial layout computed by d3-force
- Clusters for boundary containment

### Step 5: Click into evidence
User clicks an entity on the map.
Inspector panel shows:
- Entity kind, name, description
- Evidence: source anchors with file path, line range, code snippet
- Confidence badge (proven/high/medium/low/speculative)
- Connected entities (incoming/outgoing relationships)

### Step 6: Grounded question answering
User asks Claude: "What calls the payment handler?"
Claude calls `cartographer_query` with `{ involves: "actor:payment-handler" }`.
Claude responds with evidence-grounded answer citing stored facts.

## What This Proves

- The world-model is the real substrate (not a visualization byproduct)
- Facts survive between conversations (persisted to disk)
- Evidence is always inspectable (source anchors)
- The map is a projection of structured knowledge (not a static diagram)
- Claude can both write and read the model (bidirectional)
- The browser UI is live-connected (WebSocket updates)

## What This Defers

- Autonomous exploration loops (agent only works when directed)
- Language-specific extractors (agent reads code generically)
- Change-impact analysis (no graph-based propagation yet)
- Multiple projects (one model per service instance)
- Session isolation (facts accumulate, no rollback)
- Advanced projections (flow tracing, invariant overlays)
- Deterministic confidence amplifiers (AST-based proof)

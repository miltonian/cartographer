---
name: analyze
description: Systematically analyze a codebase and build a persistent world-model of its structure, behavior, and properties using Cartographer MCP tools
model: opus
effort: high
---

# Codebase Analysis

You have access to Cartographer's world-model via MCP tools. Use your native
Read, Grep, and Glob capabilities to understand the code, then record your
findings as structured facts.

## Available MCP Tools

- `cartographer_set_project` — **Call first.** Sets the project root so the model is stored in the right place.
- `cartographer_write_entity` — Record an entity (boundary, capability, actor, entity, etc.)
- `cartographer_write_relationship` — Record a relationship between entities
- `cartographer_write_slice` — Record a behavior flow (ordered path through entities)
- `cartographer_query` — Query what's already in the world-model
- `cartographer_get_entity` — Get full details for an entity
- `cartographer_get_summary` — See model statistics
- `cartographer_open_map` — Open the browser visualization
- `cartographer_clear` — Reset the model (destructive)

## Analysis Workflow

### 0. Set Project
**Before anything else**, call `cartographer_set_project` with the absolute path to the
project you're analyzing. This ensures the world-model is stored in `{project}/.cartographer/`
and loads any existing model for that project.

```
cartographer_set_project(rootPath: "/Users/me/my-project")
```

### 1. Orient
Read the project root: README, package.json or equivalent, top-level directory structure.
Get a sense of what this project is, what stack it uses, and where the main code lives.

Record the project itself as a top-level boundary:
```
cartographer_write_entity(kind: "boundary", name: "<project-name>", ...)
```

### 2. Map Boundaries
Examine directory structure and key files to identify subsystems.
Look for patterns: `/auth`, `/api`, `/db`, `/lib`, `/components`, service directories, etc.

For each subsystem, record a boundary entity with evidence from the directory structure
and key files that define it.

### 3. Find Actors (Entrypoints)
Identify where external intent enters the system:
- Web routes / pages
- API endpoints
- CLI commands
- Event listeners / webhook handlers
- Cron jobs / scheduled tasks

Record each as an `actor` entity with its containing boundary.

### 4. Trace Key Capabilities
For the most important actors, read their source and trace what they do.
Record the functions/handlers they invoke as `capability` entities.
Record `invokes` relationships between them.

Focus on what matters — don't try to record every utility function.

### 5. Identify Entities (State)
Look for persistent or meaningful state:
- Database models / schemas / migrations
- State stores (Redux, Zustand, context)
- Cache structures
- Configuration objects
- Session / auth tokens

Record as `entity` kind with `reads` and `writes` relationships from capabilities.

### 6. Note Side Effects
Look for external interactions:
- HTTP calls to external services
- Database writes
- Queue publishes
- Email / notification sends
- File system writes

Record as `side-effect` entities with `triggers` relationships.

### 7. Surface Patterns (if you notice them)
As you analyze, you may notice:
- **Invariants**: patterns that always hold ("every write checks auth")
- **Failure points**: unchecked errors, missing validation, race conditions
- **Async processes**: retry loops, queue consumers, webhooks

Record these with appropriate confidence levels. Don't force them — only record
what you actually observe.

## Evidence Rules

**Every fact MUST have evidence.**

When calling `cartographer_write_entity` or `cartographer_write_relationship`, always include:

- `anchors`: at least one source anchor with filePath (relative to project root), lineStart, lineEnd, and a snippet of the actual source code
- `confidence`:
  - `proven` — you directly read this in source code
  - `high` — one inference step from what you read (e.g., "this directory is the auth boundary" based on its name and contents)
  - `medium` — synthesized from multiple observations
  - `low` — educated guess
  - `speculative` — hypothesis you haven't verified
- `provenance`: `inferred` for most agent analysis, `deterministic` only if produced by a tool that guarantees correctness
- `reasoning`: required for anything below `proven` — explain your inference in one sentence

## Depth Control

Start broad, then go deep where it matters:

1. **First pass** — boundaries + actors (the skeleton). 5-10 minutes of reading.
2. **Second pass** — key capabilities and relationships (the flows).
3. **Third pass** — entities, side effects, invariants (the behavior).

Don't try to record every function. Focus on the ones that matter for understanding
the system's behavior and structure.

## Trace Behavior Flows

After recording entities and relationships, trace the key storylines through the system.
A behavior flow answers: "When X happens, what fires in what order?"

Use `cartographer_write_slice` to record each flow:

```
cartographer_write_slice(
  name: "Fact write lifecycle",
  description: "What happens when Claude records a finding via MCP",
  steps: [
    { entityId: "actor:MCP stdio", label: "receives tool call" },
    { entityId: "capability:registerTools", label: "dispatches to handler" },
    { entityId: "entity:WorldModelStore", label: "stores fact in memory" },
    { entityId: "side-effect:JSON persistence", label: "persists to disk" },
    { entityId: "capability:broadcast", label: "pushes via WebSocket" }
  ],
  evidence: { ... }
)
```

Good flows to look for:
- **Request paths**: user action → handler → processing → storage → response
- **Data lifecycles**: creation → transformation → consumption → deletion
- **Event chains**: trigger → handler → side effects → downstream updates
- **Error paths**: input → validation → failure → recovery/notification

Aim for 3-5 flows per codebase. Each should tell a coherent story that helps
someone understand how the system actually behaves, not just what it contains.

## After Analysis

Once you've recorded enough facts to be useful:

1. Call `cartographer_get_summary` to report what you found
2. Call `cartographer_open_map` to show the user the visual map
3. Tell the user the map is available at http://localhost:3847
4. Offer to go deeper on any area they're interested in

## Answering Questions About the Codebase

When the user asks questions like "what calls X?" or "how does Y work?":

1. First check the world-model: `cartographer_query` or `cartographer_get_entity`
2. If the answer is in the model, respond with evidence citations
3. If not, read the relevant code, answer the question, AND record what you learn
4. Always ground your answers in specific source evidence

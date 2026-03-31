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
- `cartographer_create_perspective` — Create a named perspective (lens) for focused analysis
- `cartographer_switch_perspective` — Switch the active perspective
- `cartographer_list_perspectives` — List all perspectives
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

### 0b. Choose Perspective (Optional)
If the user asked to analyze a specific concern (e.g., "analyze the auth system"),
create a focused perspective before analyzing:

```
cartographer_create_perspective(name: "auth", description: "Authentication and authorization subsystem")
cartographer_switch_perspective(name: "auth")
```

Entities and slices you write will automatically join this perspective. The map will
show only auth-related entities (plus ghosted neighbors for context).

If the user asks for a general analysis, stay on the "default" perspective — it
includes everything.

### 1. Orient
Read the project root: README, package.json or equivalent, top-level directory structure.
Get a sense of what this project is, what stack it uses, and where the main code lives.

Record the project itself as a top-level boundary:
```
cartographer_write_entity(kind: "boundary", name: "<project-name>", ...)
```

### 2. Map Boundaries
Identify the system's major **concerns** — not its directory structure. Ask:
"What are the major things this system does? What would break together if
I changed something?"

Good boundaries are based on purpose:
- "Authentication" (not `/auth`)
- "Data persistence" (not `/db`)
- "User-facing API" (not `/routes`)

Bad boundaries mirror directories:
- "src" — meaningless, just a folder
- "lib" — organizational, not conceptual
- "components" — too generic

A concern might span multiple directories. An auth boundary might include
middleware from `/middleware`, handlers from `/api`, and models from `/db`.
That's correct — the boundary represents the concern, not the folder.

For each concern, record a boundary entity with evidence from the code that
defines it.

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

## Writing Descriptions

Descriptions should be readable by anyone — not just engineers. The map is
a shared understanding surface. A PM, a designer, or a new team member should
be able to read entity names and descriptions and understand what the system does.

- Name entities by **what they do**, not how they're implemented.
  Good: "Validate cart before checkout"
  Bad: "validateCart middleware handler"
- Write descriptions in **plain English** that explains the purpose.
  Good: "Ensures the shopping cart is valid and all items are in stock before allowing payment"
  Bad: "Express middleware that calls cartService.validate() and throws 400 on failure"
- Behavior flow names should read like **stories**.
  Good: "Customer checkout flow"
  Bad: "POST /api/checkout handler chain"
- Technical detail belongs in the **evidence** (source anchors, code snippets),
  not in the description. The description is the "what and why." The evidence is the "where and how."

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

## Going Deeper (Increasing Resolution)

When the user asks to "go deeper" on a specific entity or area, increase the
resolution by creating sub-structure inside it.

For example, if the user says "go deeper on WorldModelStore":

1. Read the source code for WorldModelStore more carefully
2. Create a sub-boundary for its internals:
   ```
   cartographer_write_entity(
     kind: "boundary",
     name: "WorldModelStore internals",
     description: "Internal structure of the WorldModelStore class",
     parentBoundary: "boundary:service",
     evidence: { ... }
   )
   ```
3. Record its internal capabilities as children of that boundary:
   ```
   cartographer_write_entity(
     kind: "capability",
     name: "writeEntity",
     parentBoundary: "boundary:WorldModelStore internals",
     ...
   )
   ```
4. Record internal relationships, invariants, failure points

The sub-boundary will appear on the map as a clickable container. The user
can click into it (semantic zoom) to see the internal structure, and use
the breadcrumb to navigate back.

This works recursively — any boundary can contain sub-boundaries. The depth
is limited only by how far the user wants to go.

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

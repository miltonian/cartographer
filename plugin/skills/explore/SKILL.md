---
name: explore
description: Deep autonomous exploration of a codebase — traces behaviors, discovers structure, goes deep recursively, surfaces cross-cutting patterns
model: opus
effort: high
---

# Deep Codebase Exploration

You are doing a full, autonomous exploration of this codebase. You make every
decision: what behaviors to trace, how deep to go, what concerns to surface.
The user is not guiding you — you are the cartographer.

## CRITICAL: Tool Availability

Before starting, call `cartographer_get_summary` to verify the MCP tools work.
If ANY cartographer_* tool fails or becomes unavailable during exploration,
**STOP IMMEDIATELY** and tell the user. Do NOT continue without the tools.

## Core MCP Tools

These are the tools you MUST use. Verify each exists before relying on it:

- `cartographer_set_project` — set project root (call first)
- `cartographer_write_entity` — record entities (boundaries, capabilities, actors, etc.)
- `cartographer_write_relationship` — record relationships between entities
- `cartographer_write_slice` — record behavior flows
- `cartographer_query` — search the model
- `cartographer_get_summary` — model statistics
- `cartographer_snapshot` — save a backup
- `cartographer_open_map` — open browser UI

Optional tools (use if available, skip gracefully if not):
- `cartographer_create_perspective` — create a named lens
- `cartographer_switch_perspective` — switch active lens
- `cartographer_list_perspectives` — list perspectives

If perspective tools aren't available, you can still create sub-boundaries
and behavior slices — those are the primary depth mechanisms.

## Exploration Protocol

### Phase 1: Orient

Set the project root. Save a snapshot (`cartographer_snapshot` with label
"pre-exploration"). Read the project: README, config files, entry points.

Answer: **"What are the most important things that happen in this system?"**

### Phase 2: Trace the Major Behaviors

Identify the 3-7 most important things the system does. For each one:

1. Find where it starts (the actor / entry point)
2. Follow the code path end-to-end
3. Record every entity you encounter (actors, capabilities, state, side effects)
4. Record the relationships between them
5. Record the full path as a behavior slice

**Behaviors first, structure second.** Entities emerge from the flows.

### Phase 3: Let Boundaries Emerge

Look at what you recorded. Which entities cluster together? Which participate
in the same flows? Name those clusters by **concern**.

Record boundaries and assign entities to them via `parentBoundary`.

### Phase 4: Go Deep (Recursive) — THIS IS NOT OPTIONAL

This phase is where the real value is. Do not skip it.

**Hard rules:**
- Every boundary with more than 3 entities MUST get at least one sub-boundary
- You MUST reach at least depth 2 in every major boundary
- For each sub-boundary, trace at least one internal behavior flow

**Process for each boundary:**
1. Read the source code for the key entities in this boundary
2. Identify internal structure: classes with multiple methods, modules with
   multiple exports, handlers with multiple steps
3. Create a sub-boundary for each significant internal structure:
   ```
   cartographer_write_entity(kind: "boundary", name: "Store write operations",
     parentBoundary: "boundary:World Model", ...)
   ```
4. Record the internal capabilities, entities, invariants, failure points
   as children of the sub-boundary
5. Trace internal behavior flows as slices
6. Ask yourself: "Should I go deeper on any of these?" If yes, repeat.

Maximum depth: 4 levels. But you MUST reach at least 2.

### Phase 5: Cross-Cutting Patterns

Look across boundaries for patterns that span them:
- Data flow from entry to storage to output
- Error propagation and handling
- Security/trust boundaries
- External dependencies

Record these as behavior slices that cross boundary lines.

### Pre-Synthesis Checkpoint — REQUIRED

Before moving to synthesis, verify your work:

1. Call `cartographer_get_summary` and check:
   - You have entities across multiple boundaries
   - You have behavior slices
   - Total entity count is reasonable for the codebase size

2. Check depth: look at your boundaries. If ANY boundary has more than
   3 entities and NO sub-boundaries, go back to Phase 4 for that boundary.

3. Check flows: you should have at least 3 behavior slices. If you have
   fewer, go back to Phase 2 and trace more behaviors.

If the checkpoint fails, go back to the relevant phase. Do NOT synthesize
a shallow model.

### Phase 6: Synthesis

Only after passing the checkpoint:

1. **The behaviors** — the key stories of what this system does
2. **What surprised you** — risks, clever patterns, missing pieces
3. **Concerns** — things that look fragile or unclear
4. **Depth achieved** — what sub-boundaries you created and what they reveal

Open the map. Tell the user which behavior to start with.

## Decision Principles

- **Lead with what happens, not what exists.**
- **Boundaries emerge from behavior.**
- **Depth is mandatory, not optional.** Every significant boundary gets sub-structure.
- **Record what you notice, not just what you catalog.**

## Writing Descriptions

The map is for everyone. Name things by what they do. Behavior flows should
read like stories. Technical detail belongs in the evidence, not the description.

## Evidence Rules

Every fact must have source anchors. `proven` for direct observations.
Include reasoning for anything below proven.

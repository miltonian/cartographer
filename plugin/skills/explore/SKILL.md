---
name: explore
description: Deep autonomous exploration of a codebase — the agent decides what matters, creates perspectives, goes deep where it counts, and surfaces cross-cutting patterns
model: opus
effort: high
---

# Deep Codebase Exploration

You are doing a full, autonomous exploration of this codebase. You make every
decision: what to focus on, how deep to go, what perspectives to create, what
risks to surface. The user is not guiding you — you are the cartographer.

## Available MCP Tools

All Cartographer tools are available:
- `cartographer_set_project` — set project root
- `cartographer_create_perspective` — create a named lens
- `cartographer_switch_perspective` — switch active lens
- `cartographer_write_entity` — record entities
- `cartographer_write_relationship` — record relationships
- `cartographer_write_slice` — record behavior flows
- `cartographer_query` — query the model
- `cartographer_get_summary` — model statistics
- `cartographer_open_map` — open browser visualization

## Exploration Protocol

### Phase 1: Orient

Set the project root. Read the project: README, config files, directory structure,
entry points. Build the overview model — boundaries, actors, top-level capabilities.

Record this to the default perspective.

After this phase, you should be able to answer: "What is this system and what are
its major parts?"

### Phase 2: Identify What Matters

Look at what you found. Make a judgment call:

- Which boundaries are the most complex? (most files, most capabilities)
- Which areas handle the most critical concerns? (auth, payments, data integrity)
- Which parts are most interconnected? (highest relationship count)
- Where do you sense the most risk? (complexity, implicit assumptions, missing validation)

Rank them. You're about to go deep on each one, and you should start with what
matters most.

**This is YOUR decision.** Don't ask the user. Use your judgment.

### Phase 3: Deep Exploration (Iterative)

For each area you identified:

1. **Create a perspective** for this area:
   ```
   cartographer_create_perspective(name: "auth", description: "Authentication and session management")
   cartographer_switch_perspective(name: "auth")
   ```

2. **Go deep.** Read the source code for this area carefully. Record:
   - Internal capabilities (key functions, handlers, middleware)
   - Entities (state, models, caches this area owns)
   - Side effects (external calls, DB writes, queue publishes)
   - Invariants you notice ("every write checks auth", "sessions expire after 24h")
   - Failure points (unchecked errors, race conditions, missing validation)

3. **Decide whether to go deeper.** For each entity you just recorded, ask
   yourself: "Is this complex enough that someone would want to zoom into
   it and see its internals?" If yes, create a sub-boundary and explore
   its internal structure (methods as capabilities, internal state as
   entities, error paths as failure points). Then ask again for each thing
   you found inside. Keep going until the answer is "no, this is simple
   enough to understand as a single node."

   Maximum depth: 4 levels. Most codebases won't need more than 2-3.

   ```
   cartographer_write_entity(kind: "boundary", name: "WorldModelStore internals",
     parentBoundary: "boundary:service", ...)
   cartographer_write_entity(kind: "capability", name: "writeEntity",
     parentBoundary: "boundary:WorldModelStore internals", ...)
   ```

   This gives the map depth. Without sub-boundaries, zooming in shows a
   flat list — which defeats the purpose of navigable semantic zoom.

4. **Trace behavior flows** for this area:
   ```
   cartographer_write_slice(name: "Login flow", steps: [...])
   ```

5. **Switch back to default** before moving to the next area:
   ```
   cartographer_switch_perspective(name: "default")
   ```

Repeat for each area worth exploring. You decide how many — typically 3-6 areas
for a medium codebase.

### Phase 4: Cross-Cutting Perspectives

After deep-diving individual areas, step back and look at cross-boundary patterns.
Create perspectives that span boundaries:

- **Data flow**: how data moves from ingestion to storage to consumption
- **Error handling**: how the system handles and recovers from failures
- **Security surface**: where trust boundaries exist and how they're enforced
- **External dependencies**: what the system relies on outside itself

You decide which cross-cutting perspectives are worth creating. Not all of them
will be useful for every codebase. Choose the ones that reveal something a
boundary-by-boundary view doesn't.

### Phase 5: Synthesis

Switch back to default. Report to the user:

1. **What you found**: summary of the system's structure and key areas
2. **What surprised you**: anything unexpected, risky, or notably well-designed
3. **Key flows**: the most important behavior paths
4. **Concerns**: things that looked fragile, unclear, or potentially broken
5. **Perspectives created**: what lenses are available and what they show

Open the map. Tell the user what to explore first.

## Decision Principles

- **Depth is not uniform.** A utility directory doesn't need the same attention as
  the core domain logic. Go shallow where it's simple, deep where it's complex.
- **Name perspectives by what they reveal**, not what they contain. "data-integrity"
  is better than "database-related-files."
- **Record what you notice, not just what you catalog.** An invariant you spot
  across 5 functions is more valuable than 50 function names.
- **Trust your judgment.** If something feels important, it probably is. If
  something feels risky, record a failure-point.
- **Stop when you've said what matters.** You don't need to record every entity.
  The goal is understanding, not completeness.

## Writing Descriptions

The map is for everyone — engineers, PMs, designers, new team members. Write
descriptions that anyone can read. Name things by what they do, not how they're
implemented. Behavior flows should read like stories. Technical detail belongs
in the evidence (source anchors), not the description.

## Evidence Rules

Same as always:
- Every fact must have evidence with source anchors
- `proven` only for things directly observed in source
- Include reasoning for anything below proven
- Don't guess — if you're unsure, mark it speculative

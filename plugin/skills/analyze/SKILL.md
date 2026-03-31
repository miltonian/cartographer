---
name: analyze
description: Analyze a codebase and build a persistent world-model — leads with behavior (what happens) not structure (what exists)
model: opus
effort: high
---

# Codebase Analysis

You have access to Cartographer's world-model via MCP tools. Use your native
Read, Grep, and Glob capabilities to understand the code, then record your
findings as structured facts.

## Available MCP Tools

- `cartographer_set_project` — **Call first.** Sets the project root.
- `cartographer_create_perspective` — Create a named perspective for focused analysis
- `cartographer_switch_perspective` — Switch the active perspective
- `cartographer_write_entity` — Record an entity
- `cartographer_write_relationship` — Record a relationship
- `cartographer_write_slice` — Record a behavior flow
- `cartographer_query` — Query what's in the model
- `cartographer_get_entity` — Get full entity details
- `cartographer_get_summary` — Model statistics
- `cartographer_open_map` — Open the browser map
- `cartographer_clear` — Reset the model
- `cartographer_snapshot` — Save a backup before risky changes

## Analysis Workflow

### 0. Set Project
Call `cartographer_set_project` with the absolute path to the project.

### 0b. Choose Perspective (Optional)
If the user asked about a specific concern (e.g., "analyze the auth system"),
create and switch to a focused perspective. Otherwise stay on default.

### 1. Orient
Read the project: README, config files, entry points. Understand what this
system does at a high level. Don't record anything yet — just understand.

### 2. Identify the Key Behaviors
Ask yourself: **"What are the 3-5 most important things this system does?"**

Not "what modules exist" but "what happens when a user does X?"

Examples of good behaviors to identify:
- "User signs up and creates an account"
- "Payment is processed and order is fulfilled"
- "Data is ingested, transformed, and stored"
- "Real-time update is pushed to connected clients"

These become the storylines you'll trace.

### 3. Trace Each Behavior End-to-End

This is the core of the analysis. For each behavior:

1. **Find the entry point** (the actor where it starts)
2. **Follow the code path** — read each function, trace what it calls
3. **Record every entity you encounter along the way:**
   - The entry point → `actor`
   - Functions/handlers it calls → `capability`
   - State it reads or writes → `entity`
   - External calls it makes → `side-effect`
   - Rules that must hold → `invariant`
   - Places it can fail → `failure-point`
4. **Record relationships** as you discover them: invokes, reads, writes, triggers
5. **Record the behavior as a slice** with the full ordered path

The entities and relationships emerge FROM tracing the behavior. You don't
catalog functions first and add flows later. You follow the flow and record
what you find.

### 4. Let Boundaries Emerge

After tracing the major behaviors, look at what you recorded. Which entities
cluster together? Which ones participate in the same flows? Which would
break together if changed?

Those clusters are your boundaries. Name them by **concern** — what they DO
together, not what directory they're in.

Record boundaries and assign entities to them via `parentBoundary`.

### 5. Surface What You Noticed

As you traced behaviors, you probably noticed:
- **Invariants** — patterns that hold across flows ("every write checks auth")
- **Failure points** — unchecked errors, race conditions, missing validation
- **Risks** — things that surprised you or seem fragile
- **What's well-designed** — patterns that are notably clean

Record these. They're often more valuable than the entity catalog.

## Writing Descriptions

The map is for everyone — engineers, PMs, designers, new team members.

- Name entities by **what they do**, not how they're implemented
- Behavior flows should read like **stories**
- Technical detail belongs in the **evidence**, not the description

## Evidence Rules

Every fact MUST have evidence with source anchors (filePath, lineStart,
lineEnd, snippet). Set confidence: `proven` for direct observations,
`high/medium/low` for inferences, `speculative` for hypotheses.

## Going Deeper

When asked to "go deeper" on something, create a sub-boundary and explore
its internal structure. Methods become capabilities, internal state becomes
entities. This gives the map navigable depth via semantic zoom.

## After Analysis

1. Report what you found — lead with the behaviors, not the entity count
2. Open the map
3. Offer to go deeper on any area

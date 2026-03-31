---
name: explore
description: Deep autonomous codebase exploration — traces behaviors end-to-end, creates boundaries by concern, builds navigable depth with sub-boundaries, enforces quality via cartographer_check_depth. Use when the user says explore, map, understand, or analyze deeply.
model: opus
effort: high
---

# Codebase Exploration

Verify tools work: call `cartographer_get_summary`. If it fails, stop and
tell the user the Cartographer MCP tools are not connected.

Set the project root: `cartographer_set_project`.
Save a snapshot: `cartographer_snapshot` with label "pre-exploration".

## Checklist

Copy this checklist. Track progress. Do not skip items.

```
Exploration Progress:
- [ ] Orient: read project, understand what it does
- [ ] Behaviors: trace 3-7 key behaviors end-to-end as slices
- [ ] Boundaries: cluster entities by concern, record boundaries
- [ ] Depth: create sub-boundaries (check_depth must pass)
- [ ] Perspectives: create at least one focused perspective
- [ ] Synthesis: report findings to user
```

## How to Explore

**Behaviors first.** Identify what the system DOES, not what files it has.
Trace each behavior from entry point to completion. Record entities as
encountered: actors, capabilities, state, side effects, invariants, failure
points. Record each path as a behavior slice.

**Boundaries emerge from behaviors.** After tracing flows, cluster entities
that participate in the same behaviors. Name by concern ("authentication",
"payment processing"), NEVER by directory ("src", "lib", "components").

**Depth is mandatory.** Every boundary with more than 3 entities must have
sub-boundaries. Read the source for the key classes/functions inside each
boundary. Create a child boundary. Record its internal capabilities, state,
invariants as children.

**Perspectives for navigation.** Create at least one perspective for the
most important concern. If `cartographer_create_perspective` is unavailable,
skip gracefully — sub-boundaries and slices provide depth regardless.

## Before Finishing

Call `cartographer_check_depth`. Fix every issue it reports. Call it again.
Repeat until `passed: true`. Do NOT report to the user until it passes.

## Bad exploration (avoid)

- 50 entities, all flat, no sub-boundaries, no slices — a parts list
- Boundaries named "Service", "UI", "Plugin" — directory mirrors
- Descriptions like "Express middleware handler" — engineer jargon
- No behavior flows — structure without stories

## Good exploration

- 30 entities with 2+ depth levels and 5 behavior flows — a navigable map
- Boundaries named "Payment processing", "Real-time sync" — concerns
- Descriptions like "Validates cart before checkout" — readable by anyone
- Stories: "When a user checks out, this chain fires"

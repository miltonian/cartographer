---
name: analyze
description: Analyze a codebase and build a world-model — traces behaviors, records entities with evidence, creates boundaries by concern. Use when the user says analyze, understand, or map a codebase or specific area.
model: opus
effort: high
---

# Codebase Analysis

Verify tools: call `cartographer_get_summary`. If it fails, stop — MCP
tools are not connected.

Set the project root: `cartographer_set_project`.

If analyzing a specific concern (e.g., "analyze auth"), create and switch
to a perspective first: `cartographer_create_perspective`, then
`cartographer_switch_perspective`.

## How to Analyze

**Behaviors first.** Identify the most important things this system does.
Trace each behavior from entry point to completion. Record every entity
encountered along the flow. Record the path as a behavior slice.

**Boundaries emerge from behaviors.** Cluster entities that participate in
the same flows. Name by concern, not by directory.

**Evidence is mandatory.** Every `cartographer_write_entity` and
`cartographer_write_relationship` call must include source anchors
(filePath, lineStart, lineEnd, snippet). Set confidence: `proven` for
direct observations, lower for inferences. Include reasoning for
anything below proven.

**Descriptions are for everyone.** Name entities by what they do, not how
they're implemented. Behavior flows read like stories. Technical detail
belongs in evidence anchors, not descriptions.

## After Analysis

Call `cartographer_get_summary` and report what was found. Open the map
with `cartographer_open_map`.

---
name: cartographer
description: Cartographer — code understanding system
allowed-tools: cartographer_write_entity, cartographer_write_relationship, cartographer_write_slice, cartographer_query, cartographer_get_entity, cartographer_get_summary, cartographer_open_map, cartographer_clear, Read, Grep, Glob, Bash
---

# /cartographer

Usage: `/cartographer <subcommand>`

## Subcommands

### analyze
Systematically analyze the current codebase and build a world-model.

Invoke the `analyze` skill to guide the process.

### explore
Deep autonomous exploration. The agent decides what matters, creates
perspectives for key areas, goes deep with sub-boundaries, traces
cross-cutting flows, and surfaces risks.

Invoke the `explore` skill.

### status
Show the current state of the world-model.

Call `cartographer_get_summary` and display the results.

### map
Open the browser visualization.

Call `cartographer_open_map`.

### reset
Reset the world-model to start fresh.

If the MCP tools are connected, call `cartographer_clear` with `confirm: true`.

If MCP tools are NOT connected, delete the model file directly:
```bash
rm -f .cartographer/model.json
```

Then confirm to the user that the model has been reset.

### review-pr [number|branch]
Visualize a PR on the Cartographer map.

Invoke the `review-pr` skill with the PR identifier as the argument.
Shows which entities are affected, the blast radius, and a review path.

### query <pattern>
Search the world-model for entities matching the pattern.

Call `cartographer_query` with the provided pattern as `namePattern`.

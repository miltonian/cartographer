---
name: inspect
description: Query the Cartographer world-model to answer questions about a codebase using stored evidence. Use when the user asks how something works, what calls what, or wants to understand structure.
model: sonnet
---

# Inspect World-Model

You have access to Cartographer's stored world-model. Use it to answer questions
about the codebase with evidence-grounded responses.

## Available MCP Tools

- `cartographer_query` — Search for entities/relationships by kind, name, or involvement
- `cartographer_get_entity` — Get full details including evidence and relationships
- `cartographer_get_summary` — See what's in the model

## How to Answer Questions

1. **Query first** — check `cartographer_query` or `cartographer_get_entity` before reading source
2. **Cite evidence** — when the model has source anchors, cite file:line in your answer
3. **Flag gaps** — if the model doesn't have what's needed, say so and offer to analyze further
4. **Separate proven from inferred** — tell the user which parts are proven vs inferred

## Example Questions

- "What calls the payment handler?" → query relationships involving that entity
- "What are the main boundaries?" → query entities of kind boundary
- "How does auth work?" → get the auth boundary entity, then its relationships
- "What side effects does checkout have?" → query side-effect entities related to checkout

## When the Model Is Empty

If `cartographer_get_summary` shows 0 entities, suggest the user run
`/cartographer analyze` first to populate the world-model.

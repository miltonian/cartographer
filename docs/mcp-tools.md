# Cartographer — MCP Tools

## Tool Surface

All tools are prefixed `cartographer_` to avoid namespace collisions.

---

### cartographer_write_entity

Write an entity to the world-model. Creates if new, updates if ID matches.

**Input:**
```json
{
  "kind": "boundary | capability | actor | entity | transition | dependency | side-effect | async-process | invariant | failure-point",
  "name": "string (human-readable identifier)",
  "description": "string (optional, what this entity is/does)",
  "evidence": {
    "anchors": [
      {
        "filePath": "string (relative to project root)",
        "lineStart": "number",
        "lineEnd": "number",
        "snippet": "string (verbatim source text)"
      }
    ],
    "confidence": "proven | high | medium | low | speculative",
    "provenance": "deterministic | inferred | annotated",
    "reasoning": "string (required if confidence is not proven)",
    "supportingFacts": ["string (fact IDs this was inferred from, optional)"]
  },
  "parentBoundary": "string (entity ID of containing boundary, optional)",
  "metadata": "object (optional key-value pairs)"
}
```

**Returns:**
```json
{
  "id": "string (assigned entity ID)",
  "created": "boolean (true if new, false if updated)"
}
```

---

### cartographer_write_relationship

Write a relationship between two entities.

**Input:**
```json
{
  "kind": "contains | invokes | renders | reads | writes | depends-on | triggers | produces | consumes | guards | exposes | enters-at",
  "source": "string (source entity ID)",
  "target": "string (target entity ID)",
  "description": "string (optional)",
  "evidence": {
    "anchors": [...],
    "confidence": "...",
    "provenance": "...",
    "reasoning": "string (optional)",
    "supportingFacts": ["string (optional)"]
  }
}
```

**Returns:**
```json
{
  "id": "string (assigned relationship ID)",
  "created": "boolean"
}
```

---

### cartographer_query

Query the world-model.

**Input:**
```json
{
  "entityKind": "string (optional, filter by entity kind)",
  "relationshipKind": "string (optional, filter by relationship kind)",
  "involves": "string (optional, entity ID that must be source or target)",
  "namePattern": "string (optional, regex match on entity name)",
  "minConfidence": "proven | high | medium | low | speculative (optional)",
  "limit": "number (optional, default 50)"
}
```

**Returns:**
```json
{
  "entities": [...],
  "relationships": [...],
  "totalEntities": "number",
  "totalRelationships": "number"
}
```

---

### cartographer_get_entity

Get full details for a specific entity including all relationships and evidence.

**Input:**
```json
{
  "id": "string (entity ID)"
}
```

**Returns:**
```json
{
  "entity": { ... },
  "incomingRelationships": [...],
  "outgoingRelationships": [...],
  "relatedEntities": [...]
}
```

---

### cartographer_get_summary

Get model statistics.

**Input:** none

**Returns:**
```json
{
  "projectRoot": "string",
  "entityCount": "number",
  "relationshipCount": "number",
  "entitiesByKind": { "boundary": 3, "capability": 12, ... },
  "relationshipsByKind": { "invokes": 8, "contains": 5, ... },
  "confidenceDistribution": { "proven": 15, "high": 8, ... },
  "lastUpdated": "string (ISO timestamp)"
}
```

---

### cartographer_open_map

Open the browser UI to view the current map projection.

**Input:** none (or optional `{ "focus": "entity ID" }`)

**Returns:**
```json
{
  "url": "http://localhost:3847",
  "message": "Map opened in browser"
}
```

---

### cartographer_clear

Reset the world-model. Destructive — requires confirmation.

**Input:**
```json
{
  "confirm": true
}
```

**Returns:**
```json
{
  "cleared": true
}
```

## Design Notes

- All writes are idempotent: writing an entity with the same kind+name updates it
- Entity IDs are `{kind}:{name}` (auto-generated, stable across sessions)
- Relationship IDs are `{source}>{kind}>{target}` with counter for duplicates
- Evidence is append-only: new evidence on existing entities adds, doesn't replace
- All timestamps are ISO 8601
- All file paths in anchors are relative to project root

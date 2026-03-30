---
name: review-pr
description: Visualize a pull request on the Cartographer map — see which entities are affected, the blast radius, and the review path. Use when user says "review pr", "review pull request", or "/cartographer review-pr".
model: opus
effort: high
argument-hint: "[PR number or branch name]"
---

# PR Review on Cartographer Map

Overlay a pull request onto the existing world-model so the user can
spatially understand what the PR changes and what it affects.

**Prerequisite:** The codebase must already have a world-model. If
`cartographer_get_summary` returns 0 entities, tell the user to run
`/cartographer analyze` first.

## Steps

### 1. Set project
Call `cartographer_set_project` with the project root path.

### 2. Get the PR diff
Use `$ARGUMENTS` as the PR identifier (number, branch name, or URL).

```bash
gh pr diff $ARGUMENTS --name-only
```

This gives you the list of changed files. If the user didn't provide
a PR number, check if there's a current branch with an open PR:

```bash
gh pr view --json number,title,headRefName
```

### 3. Read the diff details
For each changed file (or the most important ones if there are many):

```bash
gh pr diff $ARGUMENTS
```

Understand what actually changed — not just which files, but what
the changes DO.

### 4. Match changes to world-model entities

Call `cartographer_query` to find entities in the model. Match by:
- Entity names that correspond to changed functions/components
- Evidence anchors that reference the changed file paths
- Relationships involving changed entities

If a changed file doesn't match any entity in the model, note it —
the model may need updating.

### 5. Determine review order

Order the affected entities from primary change to downstream impact:
1. **Core change** — the main entity the PR modifies (what the PR is "about")
2. **Supporting changes** — entities that changed to support the core
3. **Affected consumers** — entities that read/invoke the changed ones (blast radius)

### 6. Create the PR changeset

Use `kind: "changeset"` and `changeType` on each step so the map renders
change-type indicators (green=added, amber=modified, red=removed, gray=affected).

```
cartographer_write_slice(
  name: "PR #123: Add auth middleware",
  description: "Adds authentication checks before write operations",
  kind: "changeset",
  steps: [
    { entityId: "capability:requireAuth", changeType: "added", label: "new auth middleware" },
    { entityId: "capability:registerTools", changeType: "modified", label: "added auth check before handler" },
    { entityId: "entity:WorldModelStore", changeType: "affected", label: "writes now require auth" },
    { entityId: "capability:broadcast", changeType: "affected", label: "receives only authed writes" }
  ],
  evidence: {
    anchors: [{ filePath: "...", lineStart: ..., lineEnd: ..., snippet: "..." }],
    confidence: "proven",
    provenance: "deterministic",
    reasoning: "Matched from git diff"
  }
)
```

Set `changeType` on each step:
- `added` — new entity introduced by the PR (green indicator)
- `modified` — existing entity changed (amber indicator)
- `removed` — entity deleted by the PR (red indicator, strikethrough)
- `affected` — not changed directly but connected to something that was (gray indicator)

### 7. Open the map

```
cartographer_open_map
```

Tell the user:
- The PR is now visible in the Flows panel on the map
- Click it to highlight the affected path
- Click any highlighted entity to see the evidence/diff
- Non-highlighted entities that are still visible show the blast radius context

### 8. Summarize

Give the user a brief summary:
- How many entities affected (directly changed vs downstream)
- Whether the change is localized or cross-cutting
- Any entities in the model that SHOULD be affected but aren't in the diff (possible gaps)
- Any changed files that DON'T match model entities (model may be stale)

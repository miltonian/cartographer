# Cartographer — Self-Serve Verification Loop

**Date:** 2026-06-22
**Status:** Approved (design), pending implementation
**Author:** Claude (with Alexander Hamilton)

## Problem

Cartographer is a three-tier system: Claude Code (agent, via MCP) → local Node service
(world-model store + HTTP/WS + serves the UI) → browser UI (the map). Today, **only a human
can verify the most important output** — the rendered map in the browser. Claude can write to
the model and read the HTTP API, but cannot *see* the pixels, so it cannot confirm that a change
actually renders correctly. The feedback loop is open: Claude does things, a human verifies.

The user's directive: make the feedback loop **fully runnable and verifiable by Claude itself**,
so Claude can do a thing and then confirm it worked, end-to-end, with no human as its eyes.

### Motivating findings (out of scope to fix here — fixed *using* the loop afterward)

- The live MCP server + browser UI on :3847 is the **marketplace clone** at
  `~/.cartographer-service/repo`, with `projectRoot` pointed at *itself* → 0 entities. So
  `/cartographer explore` maps the service's own code, never the user's project.
- Root cause: `src/index.ts` uses `process.cwd()` for `PROJECT_ROOT`; marketplace `start.sh`
  does `cd ~/.cartographer-service/repo` before launch. Nothing passes the real project path.
- Three stale `tsx src/index.ts` processes are running from that clone, contending for :3847.

These are the first targets the loop will let Claude fix autonomously. They are **not** part of
this spec.

## Goal

A committed, reusable harness + plugin skill that lets Claude:

1. **Boot** the current *source* stack (not the stale clone) against a target project, isolated.
2. **Seed** a known world-model into it.
3. **Observe** every layer: HTTP API (data) and the rendered browser UI (pixels + DOM + console).
4. **Assert** correctness and emit a clear PASS/FAIL plus screenshots for visual inspection.
5. **Tear down** cleanly without harming the live plugin MCP server or the repo's real model.

### Non-goals

- Not a formal CI test runner (no `@playwright/test` dependency). Browser driving uses the
  **Playwright MCP** Claude already has.
- Not fixing the project-root / stale-process bugs (done later, *using* this loop).
- Not changing the product's runtime behavior.

## Proven feasibility (validated before writing this spec)

- UI is **origin-relative** (`api.ts` `BASE='/api'`, `ws.ts` uses `window.location.host`) → the
  stack can serve on any dedicated port; the UI just works.
- `src/index.ts` runs MCP (stdio) **and** HTTP/UI in one process sharing one store; both
  `CARTOGRAPHER_PORT` and `CARTOGRAPHER_PROJECT` are env-overridable.
- `store.setProject()` re-points live: persists, clears, reloads `{root}/.cartographer/model.json`,
  emits `model:cleared` (UI reloads).
- The HTTP API is **read-only** — entity writes happen only via MCP tools. This is the one
  constraint that shapes seeding (below).
- `dist/ui` is already built; `tsx` and node 20 run; `react-flow__node` is the real DOM selector.
- **Playwright MCP works**: navigated to the live :3847, read the DOM (confirmed the empty-state
  "The map is empty."), counted `.react-flow__node`, read console (0 errors). The pixel-observation
  rung is demonstrated, not assumed.

## Design

### Seeding strategy (the one real decision)

Because HTTP can't write, the model is seeded two complementary ways:

- **A — Fixture-load (primary):** a committed golden `model.json` is placed in the target's
  `.cartographer/`, and the source service boots against it. Deterministic; exercises
  store-load → projection → API → UI exactly. This is what the UI assertions run against.
- **B — Live MCP write smoke (secondary):** a small script spawns the source server and speaks
  MCP JSON-RPC over stdio, calling `cartographer_write_entity` / `get_summary` to prove the write
  path works against current source. Covers what A can't.

### Components & data flow

```
scripts/verify/
  harness.mjs         orchestrator: up | assert | down | run (build UI if stale →
                      boot source @ :3947 against golden fixture → wait /api/summary →
                      [hand off to API + Playwright asserts] → teardown). Tracks PID in
                      scripts/verify/out/harness.pid.
  fixtures/golden/
    .cartographer/model.json   small, feature-complete map (see Golden Fixture below)
  assert-api.mjs      GET /api/{summary,projection/map,slices,perspectives,entities} →
                      assert counts / shape / a nested boundary (isGroup + children) /
                      a flow slice / a non-default perspective. Exits non-zero on failure.
  smoke-mcp.mjs       spawn `tsx src/index.ts` over stdio, initialize, write_entity,
                      get_summary → assert the entity surfaced. Exits non-zero on failure.
  out/                gitignored: harness.pid, server.log, screenshots, snapshots.
plugin/skills/verify/SKILL.md
                      how Claude runs the harness, the Playwright visual checklist, and the
                      PASS/FAIL rubric.
```

### Isolation & safety (hard requirements)

- Dedicated port **3947** (distinct from the product default 3847) and a dedicated fixture
  project dir → never collides with the live plugin service.
- The fixture's `.cartographer/model.json` is committed; the harness copies it to a working
  location under `out/` (gitignored) per run so the committed golden never mutates and the
  repo's *real* `.cartographer/model.json` is never touched.
- Teardown kills **only** the PID the harness recorded in `out/harness.pid`. It never broad-kills
  cartographer processes and never touches the plugin's live MCP server (which powers Claude's
  tools mid-session).

### Run sequence

1. `node scripts/verify/harness.mjs up` → rebuild UI iff `src`/`ui` newer than `dist/ui`; boot
   source @ :3947 against a fresh copy of the golden fixture; poll `/api/summary` until healthy.
2. `node scripts/verify/assert-api.mjs` → **data layer** assertions (exact numbers from fixture).
3. Playwright MCP (driven by Claude per the skill) → open `localhost:3947`, wait for
   `.react-flow__node`, assert node/edge counts, click a nested boundary → assert breadcrumb
   (semantic zoom), select a flow → assert step highlight, screenshot to `out/`, read console →
   assert 0 errors. **Pixel layer** verified.
4. `node scripts/verify/smoke-mcp.mjs` → **write path** verified against current source.
5. `node scripts/verify/harness.mjs down` → kill tracked PID, remove port/pid files.

`harness.mjs run` chains the **scriptable** rungs (1, 2, 4) and prints a single PASS/FAIL
summary, leaving the service up on :3947 so Claude can then perform the Playwright step (3) via
MCP — that rung lives with Claude because that's where the browser is. `harness.mjs down` ends it.

### Golden fixture (exact, so assertions are exact)

A hand-built model designed to exercise every feature Claude needs to see:

- **Boundaries:** 2 top-level; **one of them nested** (has ≥2 child entities) → tests semantic
  zoom / `isGroup`.
- **Entities:** a spread across kinds (capability, actor, entity, side-effect, failure-point) and
  confidences (proven…speculative) → tests confidence rendering.
- **Relationships:** ≥3 (e.g. `invokes`, `writes`, `triggers`) → tests edges.
- **Slice:** ≥1 behavior `flow` with ≥3 steps → tests the flow panel + highlight.
- **Perspectives:** default + ≥1 named perspective → tests the perspective selector.

Exact counts are pinned in `assert-api.mjs` as the expected values; the fixture and the asserts
are authored together so they agree by construction.

### Pass/Fail rubric (in SKILL.md)

PASS requires all of: service healthy on :3947; API counts match fixture; projection has the
expected nested boundary and non-degenerate bounds; UI renders `nodeCount == expected`;
semantic-zoom breadcrumb appears on boundary click; flow highlight applies on flow select;
console error count == 0; MCP write smoke round-trips. Any miss → FAIL with the failing layer
named and a screenshot attached.

## Meta: verifying the harness itself

After building, prove the harness by deliberately breaking something small (e.g. point it at an
empty model) and confirming it reports FAIL at the right layer, then restore and confirm PASS.
A loop Claude can't trust is worse than none.

## Follow-on work (separate, enabled by this loop)

1. Fix project-root resolution so marketplace installs map the user's project, not the service.
2. Reap stale `~/.cartographer-service/repo` processes; document single-instance expectations.
3. Consider a real `npm run verify` alias once the harness is proven.

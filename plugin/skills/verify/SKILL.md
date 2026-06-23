---
name: verify
description: Run the self-serve verification loop — boot the current source stack against a golden fixture, assert every layer (MCP write → store → HTTP API → projection → rendered browser UI), and inspect the map visually via headless Playwright. Use when you changed Cartographer's service, store, projection, or UI and need to verify it yourself end-to-end without a human watching the browser.
---

# Verification Loop

A closed feedback loop you can run entirely yourself. It boots **your current
source** (not the marketplace clone), seeds a known model, and lets you observe
and assert **every layer** — including the rendered pixels.

The whole stack runs in one process (`src/index.ts` serves MCP over stdio **and**
the HTTP API + UI), and the UI is origin-relative, so a single dedicated port
gives you a consistent, isolated system to verify.

## When to use

After changing anything in `src/` (store, API routes, projection) or `ui/`.
Run this before considering the change done.

## The loop in one command

```bash
node scripts/verify/harness.mjs run
```

This: stops any prior harness server → rebuilds the UI **iff** `ui/` is newer
than `dist/ui` → boots source on port **3947** against the golden fixture →
runs the **API data-layer** assertions → runs the **MCP write-path** smoke →
runs the **project-root resolution** regression → prints PASS/FAIL and **leaves
the server up** for the visual checks below.

The project-root regression (`assert-project-root.mjs`) guards a fixed bug: the
server must map `CLAUDE_PROJECT_DIR` (the user's project), not its own `cwd`
(which `start.sh` clobbers on marketplace installs). It boots an isolated server
on a separate port and asserts `projectRoot` resolves correctly.

When done: `node scripts/verify/harness.mjs down`.

Other commands: `up` (boot only), `down` (stop + clean), `status` (is it up?).

## Then verify the pixels (Playwright MCP)

The scripted run proves the data layer. Now confirm the **rendered map**. The
server is at the URL printed by `run` (read `scripts/verify/out/endpoint-port`).

> ⚠️ Do the visual checks **after** the scripted asserts, in this order. Some
> interactions (semantic zoom) **persist server state** (a boundary perspective
> is written to the store), so the model drifts. If you re-run `assert-api`
> after interacting, first `harness.mjs up` to re-seed a fresh fixture.

1. **Overview renders.** `browser_navigate` to the URL. Then `browser_evaluate`:
   expect `.react-flow` mounted, `.react-flow__node` count **8**,
   `.react-flow__edge` count **4**, and the empty-state text absent.
   `browser_take_screenshot` → `scripts/verify/out/01-map-overview.png`.
2. **Semantic zoom.** Dispatch a bubbling `click` on
   `.react-flow__node[data-id="boundary:Authentication"]` (the boundary center
   is covered by children, so a normal center-click won't reach it; a dispatched
   bubbling click triggers React's delegated handler). Expect the URL to gain
   `?perspective=perspective%3AAuthentication`, a breadcrumb `Overview › Authentication`,
   and the node set to become the 3 auth children **+ Charge card** (contextual,
   because Verify credentials invokes it cross-boundary).
3. **Flow highlight.** Navigate back to `/`. Click the **"User login"** button in
   the FLOWS panel (it is a **toggle** — click once). Expect its label to turn
   accent (`rgb(129, 140, 248)`), the 3 flow nodes to show numbered step badges
   (1, 2, 3), and the 3 non-flow nodes to dim to opacity **0.25**.
4. **Console clean.** `browser_console_messages` at level `error`, `all: true` →
   expect **0**.

## PASS / FAIL rubric

PASS requires **all** of:
- harness boots healthy on its port,
- `assert-api.mjs` → 27/27 on a **fresh** boot,
- `smoke-mcp.mjs` → all checks pass (MCP write tools round-trip),
- `assert-project-root.mjs` → projectRoot resolves to `CLAUDE_PROJECT_DIR`,
- UI: 8 nodes / 4 edges, semantic-zoom breadcrumb appears, flow badges + dimming
  apply, **0** console errors.

Any miss → FAIL. Name the failing layer and attach the screenshot. Trust the
loop: it is designed to fail loudly and precisely (verified against an empty
model — it reports 23 failed assertions, it does not crash or pass).

## Golden fixture (the known-good model)

`scripts/verify/fixtures/golden/model.json` — authored so every feature is
exercised and every number is exact:

| | |
|---|---|
| entities / relationships / slices / perspectives | 8 / 4 / 1 / 2 |
| projection nodes / edges / boundary groups | 8 / 4 / 2 |
| entitiesByKind | boundary 2, actor 1, capability 2, entity 1, side-effect 1, failure-point 1 |
| confidence dist | proven 4, high 3, medium 3, low 1, speculative 1 |
| flow | "User login" (3 steps) |
| perspectives | default (8), auth (4) |

To verify a UI feature the fixture doesn't cover, add the needed entities to the
fixture and update the expected numbers in `assert-api.mjs` together (author them
as a pair so they agree by construction).

## Safety

- Runs on port **3947**, never the product default 3847.
- Uses a gitignored working dir (`scripts/verify/out/project`); never touches the
  repo's real `.cartographer/model.json`.
- Teardown kills **only** the PID the harness recorded — never the plugin's live
  MCP server (which powers your tools mid-session).

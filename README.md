<div align="center">

<br />

```
   ▄████▄   ▄▄▄       ██▀███  ▄▄▄█████▓ ▒█████    ▄████  ██▀███   ▄▄▄       ██▓███   ██░ ██ ▓█████  ██▀███
  ▒██▀ ▀█  ▒████▄    ▓██ ▒ ██▒▓  ██▒ ▓▒▒██▒  ██▒ ██▒ ▀█▒▓██ ▒ ██▒▒████▄    ▓██░  ██▒▓██░ ██▒▓█   ▀ ▓██ ▒ ██▒
  ▒▓█    ▄ ▒██  ▀█▄  ▓██ ░▄█ ▒▒ ▓██░ ▒░▒██░  ██▒██░▄▄▄░▓██ ░▄█ ▒▒██  ▀█▄  ▓██░ ██▓▒▒██▀▀██░▒███   ▓██ ░▄█ ▒
  ▒▓▓▄ ▄██▒░██▄▄▄▄██ ▒██▀▀█▄  ░ ▓██▓ ░ ▒██   ██░░▓█  ██▓▒██▀▀█▄  ░██▄▄▄▄██ ▒██▄█▓▒ ▒░▓█ ░██ ▒▓█  ▄ ▒██▀▀█▄
  ▒ ▓███▀ ░ ▓█   ▓██▒░██▓ ▒██▒  ▒██▒ ░ ░ ████▓▒░░▒▓███▀▒░██▓ ▒██▒ ▓█   ▓██▒▒██▒ ░  ░░▓█▒░██▓░▒████▒░██▓ ▒██▒
  ░ ░▒ ▒  ░ ▒▒   ▓▒█░░ ▒▓ ░▒▓░  ▒ ░░   ░ ▒░▒░▒░  ░▒   ▒ ░ ▒▓ ░▒▓░ ▒▒   ▓▒█░▒▓▒░ ░  ░ ▒ ░░▒░▒░░ ▒░ ░░ ▒▓ ░▒▓░
```

<br />

**An agent-first code understanding system.**

Build a persistent, evidence-grounded world-model of any codebase.<br />
Navigate it as a map. Inspect it down to source. Ask questions grounded in truth.

<br />

[Getting Started](#getting-started) ·
[How It Works](#how-it-works) ·
[Architecture](#architecture) ·
[Contributing](CONTRIBUTING.md)

<br />
<br />

</div>

---

## The Problem

You understand a codebase by building a mental model — boundaries, flows, state, invariants, failure modes. But that model lives only in your head. It's rebuilt from scratch every time. It can't be shared, inspected, or queried.

**Cartographer externalizes that model.**

It gives Claude Code a persistent memory of your codebase's structure and behavior — not as a static diagram, but as a living, evidence-grounded world-model that accumulates understanding over time.

## What It Does

```
You: "analyze this codebase"

Claude reads your code with its native tools (Read, Grep, Glob).
For each discovery, it writes a structured fact to the world-model:

  ┌──────────────────────────────────────────────────────┐
  │  entity:WorldModelStore                              │
  │  kind: entity                                        │
  │  confidence: proven                                  │
  │  evidence: src/store.ts:55-64                        │
  │  "Central state manager. In-memory Maps of           │
  │   WorldEntity and WorldRelationship, with debounced  │
  │   JSON persistence to .cartographer/model.json"      │
  └──────────────────────────────────────────────────────┘

Facts persist between conversations.
Open localhost:3847 to see the map.
Click any node to inspect source evidence.
Ask Claude questions — answers cite the stored model.
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Install via Plugin Marketplace

In Claude Code, run:

```
/plugin marketplace add miltonian/cartographer
/plugin install cartographer@cartographer
```

Then in your project directory, run `npm install` inside the plugin's service directory (the marketplace will tell you the path), or use the development install below.

### Install from Source

```bash
git clone https://github.com/miltonian/cartographer.git
cd cartographer
npm install
npm run build:ui
```

Then start Claude Code with the plugin:

```bash
claude --plugin-dir ./plugin
```

### Use

```
/cartographer analyze
```

Open `http://localhost:3847` to see the map.

### Development

```bash
npm run dev          # Service + UI dev server (hot reload)
npm run dev:service  # Service only (MCP + HTTP on auto-discovered port)
npm run dev:ui       # UI dev server only (proxies API)
```

## How It Works

### Three Pieces

```
┌──────────────────────────┐
│  Claude Code + Plugin    │  Agent. Reads code, reasons, records facts.
│          │ MCP (stdio)   │
├──────────┼───────────────┤
│  Local Service           │  Backbone. Stores world-model, serves API.
│          │ HTTP + WS     │
├──────────┼───────────────┤
│  Browser UI              │  Map. Renders projections from the model.
└──────────────────────────┘
```

**Claude Code** is the agent. It reads your code with its native tools, reasons about structure and behavior, and records findings as structured facts via MCP tools. No custom AST parsers required — the agent understands code directly.

**The local service** owns the world-model. It stores entities, relationships, behavior slices, and evidence. It persists to `.cartographer/model.json`, serves an HTTP API for the browser, and pushes live updates via WebSocket.

**The browser UI** renders a semantic map of the world-model. Entities are grouped by boundary. Click to inspect evidence. Select behavior flows to see storylines highlighted across the map.

### The Ontology

Cartographer doesn't model files or symbols. It models what the system **is** and what it **does**.

| Entity Kind | What It Represents |
|---|---|
| `boundary` | A subsystem with a public interface (module, service, layer) |
| `capability` | Something the system can do (function, handler, component) |
| `actor` | Where external intent enters (route, CLI command, listener) |
| `entity` | State that persists or transforms (DB row, session, cache) |
| `side-effect` | Observable consequence outside current boundary |
| `invariant` | Property that must hold true across operations |
| `failure-point` | Where the system can fail or degrade |
| `transition` | State change or causal link |
| `dependency` | Structural reliance |
| `async-process` | Behavior spanning time or execution contexts |

This ontology is **language-agnostic**. A React component and a Go HTTP handler are both `capability`. A database table and a Redux store are both `entity`. The model doesn't know or care what language your code is in.

### Evidence, Not Hallucination

Every fact in the world-model carries evidence:

```
┌─ Fact ────────────────────────────────────────┐
│  "createOrder invokes validateCart"            │
│                                               │
│  confidence: proven                           │
│  provenance: inferred (agent read source)     │
│  anchor: src/orders/create.ts:47-52           │
│  snippet: const result = validateCart(items);  │
└───────────────────────────────────────────────┘
```

| Confidence | Meaning |
|---|---|
| `proven` | Directly observed in source code |
| `high` | One inference step from observed facts |
| `medium` | Synthesized from multiple observations |
| `low` | Educated guess |
| `speculative` | Hypothesis, not yet verified |

The browser UI visually distinguishes all levels. You always know what's proven vs. what's inferred.

### Behavior Slices

Structure tells you what exists. **Flows tell you what happens.**

A behavior slice is a named path through the system: "When X happens, these entities activate in this order."

```
Fact write lifecycle:
  MCP stdio → registerTools → WorldModelStore → JSON persistence → broadcast
  │           │                │                 │                  │
  receives    dispatches to    stores fact in    persists to        pushes update
  tool call   handler          memory            disk               via WebSocket
```

Select a flow in the UI panel to see it highlighted on the map. Non-participating nodes dim. Each step gets a numbered badge. The storyline becomes visible.

## MCP Tools

Cartographer exposes 8 tools via MCP:

| Tool | Purpose |
|---|---|
| `cartographer_write_entity` | Record an entity with evidence |
| `cartographer_write_relationship` | Record a relationship between entities |
| `cartographer_write_slice` | Record a behavior flow (ordered path) |
| `cartographer_query` | Search entities/relationships |
| `cartographer_get_entity` | Full entity details + evidence |
| `cartographer_get_summary` | Model statistics |
| `cartographer_open_map` | Open browser to the map |
| `cartographer_clear` | Reset the world-model |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full system diagram.

Key constraints:
- **Agent-first** — Claude Code is the control plane. Deterministic analysis is optional.
- **Evidence-grounded** — Every claim traces to source. Proven/inferred is a hard line.
- **Language-agnostic** — The ontology doesn't know about TypeScript or React. Language adapters are optional capability packs, not the foundation.
- **UI is a projection** — React Flow concepts don't leak into the stored model. The map is computed from the model, not stored as the model.

## Project Structure

```
src/                 Local service
  index.ts           Entry: MCP (stdio) + HTTP + WebSocket
  ontology.ts        Core types: entities, relationships, evidence
  store.ts           World-model store with JSON persistence
  mcp/tools.ts       MCP tool definitions
  api/routes.ts      REST API for browser UI
  projection/        Map layout computation

ui/                  Browser UI
  src/App.tsx        App shell: map + inspector + flows
  src/components/    CartographerMap, SemanticNode, BoundaryNode,
                     Inspector, FlowPanel, StatusBar

plugin/              Claude Code plugin
  .mcp.json          MCP server configuration
  skills/analyze/    Analysis workflow (model: opus, effort: high)
  skills/inspect/    Query workflow (model: sonnet)
  commands/          /cartographer command
```

## Roadmap

Cartographer is v0.1. The foundation is in place. What's next:

- [ ] **Capability packs** — Optional TypeScript/Python/Go AST extractors for higher-confidence facts
- [ ] **Flow animation** — Step-through replay of behavior slices
- [ ] **Change impact** — "If I change this, what else moves?"
- [ ] **Multi-project** — Analyze multiple codebases, see cross-project dependencies
- [ ] **Session history** — Track how understanding evolves over time
- [ ] **Invariant detection** — Surface patterns the agent notices across the codebase
- [ ] **Shareable models** — Export/import world-models for team knowledge transfer

## Philosophy

Most code tools show you **what the code says**. Cartographer shows you **what the code means**.

The thesis: code understanding is behavior prediction. You understand a system when you can predict what happens under change. That requires a model of boundaries, flows, state, invariants, and failure modes — not just a file tree.

The map is not the territory. But a good map makes the territory navigable.

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contribution right now is trying it on your codebase and telling us what's missing.

---

<div align="center">
<br />
<sub>Built with Claude Code. The agent that understands your code.</sub>
<br />
<br />
</div>

# Cartographer — Architecture

## System Diagram

```
┌──────────────────────────────┐
│  Claude Code + Plugin        │
│  ┌────────────────────────┐  │
│  │ Skills (analyze, etc.) │  │
│  │ Commands (/cartographer)│  │
│  │ Native tools (Read,    │  │
│  │  Grep, Glob, Bash)     │  │
│  └──────────┬─────────────┘  │
│             │ MCP (stdio)    │
└─────────────┼────────────────┘
              │
              ▼
┌──────────────────────────────┐
│  Local Service               │
│  (single Node.js process)    │
│                              │
│  ┌─────────┐ ┌────────────┐ │
│  │ MCP     │ │ HTTP :3847 │ │
│  │ (stdio) │ │ + WebSocket│ │
│  └────┬────┘ └─────┬──────┘ │
│       │             │        │
│       ▼             ▼        │
│  ┌──────────────────────┐    │
│  │ World-Model Store    │    │
│  │ (in-memory + JSON)   │    │
│  │                      │    │
│  │ Entities             │    │
│  │ Relationships        │    │
│  │ Evidence / Anchors   │    │
│  │ Confidence           │    │
│  └──────────┬───────────┘    │
│             │                │
│  ┌──────────▼───────────┐    │
│  │ Projection Engine    │    │
│  │ (d3-force layout)    │    │
│  └──────────────────────┘    │
└──────────────────────────────┘
              │
              │ HTTP + WS
              ▼
┌──────────────────────────────┐
│  Browser UI                  │
│  (React + React Flow)        │
│                              │
│  Map → Inspector → Evidence  │
└──────────────────────────────┘
```

## Component Responsibilities

### Claude Code Plugin
- Main agent experience
- Skills guide systematic analysis workflows
- Commands start service, check status
- MCP tools write/query world-model
- Uses native Read/Grep/Glob for code understanding
- NO custom AST parsing — agent reads and reasons about code directly

### Local Service
- Owns the world-model (single source of truth)
- Stores entities, relationships, evidence, confidence, provenance
- Persists to `.cartographer/model.json` in project root
- Serves MCP protocol over stdio (for Claude Code)
- Serves HTTP REST API (for browser UI)
- Serves WebSocket (for live browser updates)
- Computes map projections (layout positions)
- Serves built browser UI as static files

### Browser UI
- Renders projections from the service
- Map: entities as nodes, relationships as edges (React Flow)
- Inspector: entity details, evidence, source anchors
- Evidence view: source snippets with confidence badges
- Live updates via WebSocket
- Dumb relative to the model — no business logic

## Communication

| Path | Protocol | Direction | Pattern |
|------|----------|-----------|---------|
| Plugin → Service | MCP stdio | Request/Response | Write facts, query model |
| Browser → Service | HTTP REST | Pull | Model snapshot, projections, details |
| Service → Browser | WebSocket | Push | Entity added, relationship added |

## Storage

- In-memory Maps for fast access
- JSON persistence to `.cartographer/model.json`
- Debounced writes (1s after last change)
- Load from disk on startup
- One model per project root

## Project Identity

- Project identified by root path
- Model file stored in `{project_root}/.cartographer/model.json`
- Analysis sessions are implicit (facts accumulate over time)
- Facts carry timestamps for temporal ordering
- No session-level isolation in V1 (incremental by default)

## Key Constraints

- React Flow concepts do NOT leak into stored model
- Projection is computed FROM model, not stored AS model
- All logging goes to stderr (stdout reserved for MCP)
- Service must work while Claude Code is running (MCP lifecycle)
- Model persists to disk so it survives restarts

## Deterministic Capabilities (Future)

Language-specific extractors are optional capability packs:
- They amplify confidence (proven facts from AST vs inferred from reading)
- They accelerate analysis (batch extraction vs manual reading)
- They are NOT required for the system to function
- V1 works entirely on agent reasoning + generic capabilities

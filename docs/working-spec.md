# Cartographer — Working Spec

## Product Thesis

Cartographer is an agent-first code-understanding system. The agent (Claude Code)
builds and maintains a persistent world-model of a codebase — structured facts about
boundaries, capabilities, state, flows, invariants, and failure modes — grounded in
source evidence with explicit confidence levels.

The map is one projection of the agent's world-model, not the product itself.

## Target

- Any codebase Claude Code can read (language-agnostic by design)
- TypeScript/React/Next.js as first practical test target
- No language-specific extractors required

## Form Factor

- **Claude Code plugin**: agent surface — skills, commands, MCP tools
- **Local service**: world-model backbone — storage, evidence, projections
- **Browser UI**: visualization surface — map, inspector, evidence views

## Core Loop

1. User asks Claude Code to analyze a codebase
2. Claude reads code with native tools (Read, Grep, Glob)
3. Claude records structured findings via Cartographer MCP tools
4. Service stores facts with evidence, broadcasts to browser
5. Browser renders semantic map with inspectable evidence
6. Claude answers questions grounded in stored world-model

## MVP Goal

Prove that a persistent, evidence-grounded world-model with visual projection is a
better way to orient, trace, and inspect a codebase than file-tree navigation alone.

## V1 Scope

Included:
- Core ontology (10 entity kinds, 12 relationship kinds)
- Evidence model (source anchors, confidence, provenance)
- MCP tools for writing and querying the model
- In-memory store with JSON persistence
- HTTP API + WebSocket for browser
- Map projection with force-directed layout
- Inspector with evidence/source display
- Plugin with analyze skill

Deferred:
- Language-specific AST extractors (optional capability packs)
- Autonomous agent loops
- Multi-project support
- Collaboration / team features
- Change-impact analysis
- Invariant detection beyond agent inference
- Time/concurrency analysis

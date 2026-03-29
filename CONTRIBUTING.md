# Contributing to Cartographer

Thank you for your interest in contributing. Cartographer is early-stage and moving fast, so the best way to help right now is to try it, break it, and tell us what happened.

## Getting Started

```bash
git clone https://github.com/miltonian/cartographer.git
cd cartographer
npm install
npm run dev
```

This starts the local service on port 3847 and the UI dev server on port 5173.

## Project Structure

```
src/           Service (MCP server + HTTP API + WebSocket)
ui/            Browser UI (React + React Flow)
plugin/        Claude Code plugin (skills, commands, MCP config)
docs/          Architecture documentation
```

## How to Contribute

### Report Issues
Open an issue with:
- What you tried
- What happened
- What you expected

### Submit PRs
1. Fork the repo
2. Create a branch (`git checkout -b fix/description`)
3. Make your changes
4. Run `npx tsc --noEmit` to type-check
5. Run `npx vite build` to verify the UI builds
6. Submit a PR with a clear description

### Areas That Need Help
- **Ontology design** — Are the 10 entity kinds and 12 relationship kinds the right abstraction?
- **Layout algorithms** — Better spatial organization for large codebases
- **Behavior slice UX** — How should flow visualization feel?
- **Capability packs** — Optional language-specific extractors (TypeScript AST, Python AST, etc.)
- **Testing** — The codebase has no tests yet

## Architecture Principles

These are load-bearing. Please read before proposing changes:

1. **Agent-first** — Claude Code is the agent. The service is the memory. The UI is the projection.
2. **Evidence-grounded** — Every fact must have source anchors. Proven vs. inferred is a hard line.
3. **Language-agnostic ontology** — The core model doesn't know about TypeScript, React, or any specific language. Language-specific knowledge lives in adapters/capability packs.
4. **UI is dumb relative to the model** — React Flow concepts don't leak into the stored world-model. The projection is computed FROM the model.
5. **No required extractors** — The system works with just Claude Code reading files. Deterministic analyzers are optional accelerators.

## Code Style

- TypeScript strict mode
- No unnecessary abstractions
- Comments only where the logic isn't self-evident
- `console.error` for all logging (stdout is reserved for MCP protocol)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

import * as path from 'path';
import * as fs from 'fs';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, type WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorldModelStore } from './store.js';
import { registerTools } from './mcp/tools.js';
import { createRouter } from './api/routes.js';

// ─── Configuration ─────────────────────────────────────────────

const PREFERRED_PORT = parseInt(process.env.CARTOGRAPHER_PORT ?? '3847', 10);
// Resolve the project to map, most-specific first:
//   1. CARTOGRAPHER_PROJECT — explicit override (e.g. the verification harness).
//   2. CLAUDE_PROJECT_DIR   — set by Claude Code to the user's project. This is
//      the correct source: start.sh cd's the process into the service dir before
//      launch, so process.cwd() is the SERVICE, not the user's project. Reading
//      cwd here is what made marketplace installs map the service's own code.
//   3. process.cwd()        — fallback for manual / non-Claude-Code runs.
const PROJECT_ROOT =
  process.env.CARTOGRAPHER_PROJECT ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, '.cartographer');

// All logging goes to stderr — stdout is reserved for MCP protocol
const log = (...args: unknown[]) => console.error('[cartographer]', ...args);

// ─── World-Model Store ─────────────────────────────────────────

const store = new WorldModelStore(PROJECT_ROOT, DATA_DIR);
log(`Store initialized for: ${PROJECT_ROOT}`);
log(`Persistence: ${path.join(DATA_DIR, 'model.json')}`);

const summary = store.getSummary();
if (summary.entityCount > 0) {
  log(`Loaded existing model: ${summary.entityCount} entities, ${summary.relationshipCount} relationships`);
}

// ─── MCP Server (stdio) ────────────────────────────────────────

// Advertise the real package version, not a stale literal.
const pkgDir = import.meta.dirname ?? __dirname;
let pkgVersion = '0.0.0';
try {
  pkgVersion = JSON.parse(fs.readFileSync(path.join(pkgDir, '..', 'package.json'), 'utf-8')).version ?? '0.0.0';
} catch { /* keep default */ }

const mcpServer = new Server(
  { name: 'cartographer', version: pkgVersion },
  { capabilities: { tools: {} } },
);

// Register tools immediately so they're available when Claude Code connects.
// The open_map tool reads the port file at call time, not at registration time.
registerTools(mcpServer, store, DATA_DIR);

const transport = new StdioServerTransport();
mcpServer.connect(transport).then(() => {
  log('MCP server connected (stdio)');
});

// ─── HTTP Server ───────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', createRouter(store));

// Serve built browser UI
// When running from src/ (tsx), look for dist/ui relative to project root.
// When running from dist/ (compiled), look for ui/ next to the script.
const scriptDir = import.meta.dirname ?? __dirname;
const uiDistPath = scriptDir.endsWith('src')
  ? path.join(scriptDir, '..', 'dist', 'ui')
  : path.join(scriptDir, 'ui');
if (fs.existsSync(uiDistPath)) {
  // Assets have hashed filenames — cache forever. HTML must not be cached.
  app.use('/assets', express.static(path.join(uiDistPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  app.use(express.static(uiDistPath, { maxAge: 0 }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(uiDistPath, 'index.html'));
    } else {
      // Unknown /api or /ws path: return a clean 404 rather than falling through
      // and leaving the request hanging until the socket times out.
      res.status(404).json({ error: `Not found: ${req.path}` });
    }
  });
}

// Try preferred port, then scan up to 10 ports above it
function startHttpServer(port: number, retries = 10): Promise<{ server: ReturnType<typeof app.listen>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve({ server, port });
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        log(`Port ${port} in use, trying ${port + 1}...`);
        server.close();
        resolve(startHttpServer(port + 1, retries - 1));
      } else {
        reject(err);
      }
    });
  });
}

const { server: httpServer, port: actualPort } = await startHttpServer(PREFERRED_PORT);
log(`HTTP server: http://localhost:${actualPort}`);

// Write the active port so the open_map tool and scripts can find it
const portFile = path.join(DATA_DIR, 'port');
fs.writeFileSync(portFile, String(actualPort), 'utf-8');

// ─── WebSocket ─────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  log('Browser connected via WebSocket');
  // A client error (e.g. socket closed between accept and send) must not bubble
  // to the global uncaughtException handler.
  ws.on('error', (err) => log('WebSocket client error:', err.message));
  // Send current snapshot on connect
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'snapshot', data: store.getSnapshot() }));
    }
  } catch (err) {
    log('Failed to send initial snapshot:', (err as Error).message);
  }
});

function broadcast(message: object): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

// Broadcast model changes to all connected browsers
store.on('entity:added', (entity) => {
  broadcast({ type: 'entity:added', data: entity });
});
store.on('entity:updated', (entity) => {
  broadcast({ type: 'entity:updated', data: entity });
});
store.on('relationship:added', (rel) => {
  broadcast({ type: 'relationship:added', data: rel });
});
store.on('relationship:updated', (rel) => {
  broadcast({ type: 'relationship:updated', data: rel });
});
store.on('slice:added', (slice) => {
  broadcast({ type: 'slice:added', data: slice });
});
store.on('slice:updated', (slice) => {
  broadcast({ type: 'slice:updated', data: slice });
});
store.on('model:cleared', () => {
  broadcast({ type: 'model:cleared', data: null });
});

// ─── Error Handling ───────────────────────────────────────────
// Prevent unhandled errors from crashing the MCP server.
// The MCP connection must stay alive for Claude Code to use tools.

process.on('uncaughtException', (err) => {
  // Keep the MCP connection alive, but log the FULL stack — a swallowed-to-message
  // error hid where persist/broadcast failures actually originated.
  log('Uncaught exception (keeping server alive):', err.stack ?? err.message);
});

process.on('unhandledRejection', (reason) => {
  log('Unhandled rejection (keeping server alive):', reason instanceof Error ? (reason.stack ?? reason.message) : reason);
});

// ─── Graceful Shutdown ─────────────────────────────────────────

function shutdown() {
  log('Shutting down...');
  store.persistToDisk();
  try { fs.unlinkSync(portFile); } catch { /* already gone */ }
  httpServer.close();
  wss.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

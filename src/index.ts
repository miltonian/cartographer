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
const PROJECT_ROOT = process.env.CARTOGRAPHER_PROJECT ?? process.cwd();
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

const mcpServer = new Server(
  { name: 'cartographer', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// Tools are registered after HTTP server starts (needs actual port for open_map)
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
  app.use(express.static(uiDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(uiDistPath, 'index.html'));
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

// Write the active port so scripts/browser can find it
const portFile = path.join(DATA_DIR, 'port');
fs.writeFileSync(portFile, String(actualPort), 'utf-8');

// Update the MCP tools with the actual port
registerTools(mcpServer, store, actualPort);

// ─── WebSocket ─────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  log('Browser connected via WebSocket');
  // Send current snapshot on connect
  ws.send(JSON.stringify({
    type: 'snapshot',
    data: store.getSnapshot(),
  }));
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

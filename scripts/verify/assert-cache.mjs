#!/usr/bin/env node
// Server regression: the projection cache must invalidate on layout-affecting
// changes that aren't *:added — specifically (1) an entity's parentBoundary
// changing via the update path (entity:updated), and (2) switching the active
// perspective.
//
// One process is both the MCP server (writes) and the HTTP server (reads), so
// we let the MCP StdioClientTransport spawn it, write via MCP, and read the same
// store over HTTP using the port it writes to .cartographer/port.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const OUT = path.join(__dirname, 'out');
const PROJECT = path.join(OUT, 'cache-project');
const PORT = process.env.CARTO_CACHE_PORT ?? '3973';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });
const anchor = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };

const getJson = async (port, p) => (await fetch(`http://127.0.0.1:${port}/api${p}`)).json();
const post = async (port, p, body) =>
  (await fetch(`http://127.0.0.1:${port}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

async function main() {
  fs.rmSync(PROJECT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT, { recursive: true });

  const env = { ...process.env, CARTOGRAPHER_PORT: PORT, CARTOGRAPHER_PROJECT: PROJECT };
  delete env.CLAUDE_PROJECT_DIR;
  const transport = new StdioClientTransport({ command: TSX, args: ['src/index.ts'], cwd: REPO_ROOT, env, stderr: 'ignore' });
  const client = new Client({ name: 'cache-test', version: '1.0.0' }, { capabilities: {} });

  let connected = false;
  let port = null;
  try {
    await client.connect(transport);
    connected = true;

    const portFile = path.join(PROJECT, '.cartographer', 'port');
    for (let i = 0; i < 75 && !port; i++) {
      if (fs.existsSync(portFile)) port = fs.readFileSync(portFile, 'utf-8').trim();
      if (!port) await sleep(200);
    }
    if (!port) throw new Error('server HTTP never bound (no port file)');

    await client.callTool({ name: 'cartographer_write_entity', arguments: { kind: 'boundary', name: 'auth', evidence: anchor } });
    await client.callTool({ name: 'cartographer_write_entity', arguments: { kind: 'capability', name: 'foo', evidence: anchor } });

    // Prime the cache: foo is an orphan; auth has no children (not a group).
    const before = await getJson(port, '/projection/map');
    ok('baseline: auth not yet a group (foo is orphan)',
      !before.nodes.some((n) => n.id === 'boundary:auth' && n.isGroup));

    // entity:updated — move foo under auth. MUST invalidate the cache.
    await client.callTool({ name: 'cartographer_write_entity', arguments: { kind: 'capability', name: 'foo', parentBoundary: 'boundary:auth', evidence: anchor } });
    const after = await getJson(port, '/projection/map');
    const fooNested = after.nodes.some((n) => n.id === 'capability:foo' && n.parentId === 'boundary:auth');
    const authGroup = after.nodes.some((n) => n.id === 'boundary:auth' && n.isGroup);
    ok('cache invalidates on parentBoundary change (entity:updated) → foo nests under auth',
      fooNested && authGroup, `fooNested=${fooNested} authIsGroup=${authGroup}`);

    // perspective switch — create a boundary perspective, prime __active__, switch, re-read.
    await post(port, '/perspective/from-boundary', { boundaryId: 'boundary:auth' });
    await getJson(port, '/projection/map'); // prime __active__ (active = default)
    await post(port, '/perspective/switch', { id: 'perspective:auth' });
    const switched = await getJson(port, '/projection/map');
    ok('cache invalidates on /perspective/switch → projection reflects new active perspective',
      switched.activePerspective === 'perspective:auth', `activePerspective=${switched.activePerspective}`);
  } catch (err) {
    ok('cache test ran', false, err.message);
  } finally {
    if (connected) { try { await client.close(); } catch { /* */ } }
    fs.rmSync(PROJECT, { recursive: true, force: true });
  }

  console.log('\n  Projection cache invalidation');
  for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n  ${results.length - fail}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

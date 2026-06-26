#!/usr/bin/env node
// Write-path smoke test for the verification harness.
//
// Spawns the CURRENT SOURCE server as an MCP server over stdio (via the SDK's
// own client) and exercises the real write tools end-to-end:
//   set_project → write_entity ×2 → write_relationship → get_summary
// Asserts the writes landed. This proves the MCP tools work against fresh code,
// which the fixture-load path (assert-api) does not cover.
//
// Fully isolated: its own temp project dir and its own port (does not touch the
// harness server or the repo's real model).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const SMOKE_DIR = path.join(__dirname, 'out', 'smoke');
const SMOKE_PORT = process.env.CARTO_SMOKE_PORT ?? '3948';

const results = [];
const eq = (name, a, e) => results.push({ name, ok: JSON.stringify(a) === JSON.stringify(e), detail: `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}` });
const truthy = (name, c, detail = '') => results.push({ name, ok: !!c, detail });

// Parse a cartographer tool result: its payload is JSON text in content[0].text.
function parseToolJson(res) {
  const text = res?.content?.find?.((c) => c.type === 'text')?.text ?? '';
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function main() {
  fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SMOKE_DIR, { recursive: true });

  const stderrChunks = [];
  const transport = new StdioClientTransport({
    command: TSX,
    args: ['src/index.ts'],
    cwd: REPO_ROOT,
    env: { ...process.env, CARTOGRAPHER_PORT: SMOKE_PORT, CARTOGRAPHER_PROJECT: SMOKE_DIR },
    stderr: 'pipe',
  });

  const client = new Client({ name: 'cartographer-verify-smoke', version: '1.0.0' }, { capabilities: {} });

  let connected = false;
  try {
    await client.connect(transport);
    connected = true;
    transport.stderr?.on('data', (d) => stderrChunks.push(d.toString()));

    // The toolset must be present
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    truthy('write_entity tool present', names.has('cartographer_write_entity'));
    truthy('get_summary tool present', names.has('cartographer_get_summary'));

    // The server must advertise its real package version, not a stale literal.
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')).version;
    const serverInfo = client.getServerVersion?.();
    truthy(`MCP server advertises package version (${expectedVersion}, not 0.1.0)`,
      serverInfo?.version === expectedVersion, JSON.stringify(serverInfo));

    // Point at the isolated smoke project
    await client.callTool({
      name: 'cartographer_set_project',
      arguments: { rootPath: SMOKE_DIR },
    });

    // Write a boundary + a capability inside it
    const anchor = { filePath: 'smoke.ts', lineStart: 1, lineEnd: 2, snippet: 'smoke()' };
    const wb = parseToolJson(await client.callTool({
      name: 'cartographer_write_entity',
      arguments: {
        kind: 'boundary', name: 'SmokeRoot', description: 'smoke boundary',
        evidence: { anchors: [anchor], confidence: 'proven', provenance: 'deterministic' },
      },
    }));
    truthy('write_entity(boundary) created', wb.created === true || wb.id === 'boundary:SmokeRoot', JSON.stringify(wb));

    await client.callTool({
      name: 'cartographer_write_entity',
      arguments: {
        kind: 'capability', name: 'smokeDoThing', parentBoundary: 'boundary:SmokeRoot',
        evidence: { anchors: [anchor], confidence: 'high', provenance: 'inferred', reasoning: 'smoke' },
      },
    });

    // Relate them
    await client.callTool({
      name: 'cartographer_write_relationship',
      arguments: {
        kind: 'exposes', source: 'boundary:SmokeRoot', target: 'capability:smokeDoThing',
        evidence: { anchors: [anchor], confidence: 'proven', provenance: 'deterministic' },
      },
    });

    // Read it back via the summary tool
    const summary = parseToolJson(await client.callTool({ name: 'cartographer_get_summary', arguments: {} }));
    eq('summary.entityCount after writes', summary.entityCount, 2);
    eq('summary.relationshipCount after writes', summary.relationshipCount, 1);

    // And via a query tool — proves read tools see the writes too
    const q = parseToolJson(await client.callTool({
      name: 'cartographer_query',
      arguments: { entityKind: 'capability' },
    }));
    const found = JSON.stringify(q).includes('capability:smokeDoThing');
    truthy('query finds the written capability', found, JSON.stringify(q).slice(0, 200));
  } catch (err) {
    results.push({ name: 'mcp session', ok: false, detail: err.message });
  } finally {
    if (connected) { try { await client.close(); } catch { /* best effort */ } }
    fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('\n  MCP write-path smoke (stdio against current source)');
  for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`);
  console.log(`\n  ${pass}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
  if (fail) {
    if (stderrChunks.length) console.log('\n  server stderr tail:\n' + stderrChunks.join('').split('\n').slice(-15).map((l) => '    ' + l).join('\n'));
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error('  ❌ smoke-mcp crashed:', err.message); process.exit(1); });

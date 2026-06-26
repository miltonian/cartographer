#!/usr/bin/env node
// MCP tool-validation regressions. Drives the real tool handlers over stdio.
// The system's failure mode is "silent success on bad input" — these assert it
// now says no (or warns) instead of silently corrupting the model.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const OUT = path.join(__dirname, 'out');
const PROJECT = path.join(OUT, 'validation-project');
const REL_JUNK = path.join(REPO_ROOT, 'scripts', 'verify', 'out', 'relpath-junk'); // where a relative set_project would land

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });
const validEv = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };

async function call(client, name, args) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res?.content?.find?.((c) => c.type === 'text')?.text ?? '';
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    return { isError: !!res.isError, data };
  } catch (e) {
    return { isError: true, data: { error: e.message } };
  }
}

async function main() {
  fs.rmSync(PROJECT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT, { recursive: true });
  fs.rmSync(REL_JUNK, { recursive: true, force: true });

  const env = { ...process.env, CARTOGRAPHER_PORT: '3977', CARTOGRAPHER_PROJECT: PROJECT };
  delete env.CLAUDE_PROJECT_DIR;
  const transport = new StdioClientTransport({ command: TSX, args: ['src/index.ts'], cwd: REPO_ROOT, env, stderr: 'ignore' });
  const client = new Client({ name: 'validation-test', version: '1.0.0' }, { capabilities: {} });

  let connected = false;
  try {
    await client.connect(transport);
    connected = true;

    // 1. invalid entity kind → rejected
    const r1 = await call(client, 'cartographer_write_entity', { kind: 'frobnicate', name: 'x', evidence: validEv });
    ok('write_entity rejects out-of-ontology kind', r1.isError, JSON.stringify(r1.data));

    // 2. empty anchors → rejected (evidence-grounding invariant)
    const r2 = await call(client, 'cartographer_write_entity', { kind: 'capability', name: 'y', evidence: { anchors: [], confidence: 'proven', provenance: 'deterministic' } });
    ok('write_entity rejects evidence with zero anchors', r2.isError, JSON.stringify(r2.data));

    // 3. metadata delivered as a JSON STRING is parsed to an object
    await call(client, 'cartographer_write_entity', { kind: 'capability', name: 'z', evidence: validEv, metadata: '{"lang":"ts"}' });
    const det = await call(client, 'cartographer_get_entity', { id: 'capability:z' });
    const md = det.data?.entity?.metadata;
    ok('write_entity ensureParses string metadata into an object', md && typeof md === 'object' && md.lang === 'ts', JSON.stringify(md));

    // 4. relationship to nonexistent endpoints → warns (not silent)
    const r4 = await call(client, 'cartographer_write_relationship', { kind: 'invokes', source: 'capability:nope', target: 'capability:nada', evidence: validEv });
    ok('write_relationship warns on dangling endpoints', Array.isArray(r4.data?.warnings) && r4.data.warnings.length >= 1, JSON.stringify(r4.data));

    // 5. set_project with a relative path → rejected (and creates no junk dir)
    const r5 = await call(client, 'cartographer_set_project', { rootPath: 'scripts/verify/out/relpath-junk' });
    ok('set_project rejects a non-absolute path', r5.isError, JSON.stringify(r5.data));
    ok('set_project rejection created no .cartographer junk dir', !fs.existsSync(REL_JUNK));

    // 6. open_map with no active port file → reports not-running, doesn't claim success
    fs.rmSync(path.join(PROJECT, '.cartographer', 'port'), { force: true });
    const om = await call(client, 'cartographer_open_map', {});
    ok('open_map reports no-server when the port file is missing', om.isError, JSON.stringify(om.data));
  } catch (err) {
    ok('validation test ran', false, err.message);
  } finally {
    if (connected) { try { await client.close(); } catch { /* */ } }
    fs.rmSync(PROJECT, { recursive: true, force: true });
    fs.rmSync(REL_JUNK, { recursive: true, force: true });
  }

  console.log('\n  MCP tool input validation');
  for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n  ${results.length - fail}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

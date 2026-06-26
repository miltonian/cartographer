#!/usr/bin/env node
// Unit regression suite (run via tsx — imports the real TS source directly).
// Covers backend bugs found in the audit. Each test is RED before its fix,
// GREEN after. No server needed.

import { computeMapProjection } from '../../src/projection/layout.ts';
import { WorldModelStore } from '../../src/store.ts';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(__dirname, 'out', 'unit');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });
const eq = (name, a, e) => ok(name, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);

function ev(confidence = 'proven') {
  return [{ id: 'ev:0', anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence, provenance: 'deterministic', createdAt: '2026-06-22T00:00:00.000Z' }];
}
function entity(kind, name, parentBoundary) {
  return { id: `${kind}:${name}`, kind, name, evidence: ev(), parentBoundary, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z' };
}
function snapshot(entities) {
  return {
    id: 'model:test', rootPath: '/tmp', entities, relationships: [], slices: [],
    perspectives: [{ id: 'perspective:default', name: 'default', entityIds: [], sliceIds: [], isDefault: true, createdAt: '', updatedAt: '' }],
    activePerspectiveId: 'perspective:default', createdAt: '', updatedAt: '',
  };
}

// ── Bug 1: empty mapNodes (childless boundaries) → Infinity/-Infinity bounds ──
{
  const proj = computeMapProjection(snapshot([entity('boundary', 'A'), entity('boundary', 'B')]));
  const b = proj.bounds;
  ok('layout: childless-boundary model yields FINITE bounds (no Infinity)',
    Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minY) && Number.isFinite(b.maxY),
    `bounds=${JSON.stringify(b)}`);
}

// ── Bug 2: slice evidence not scanned on load → evidence-id collision ──
{
  fs.rmSync(TMP, { recursive: true, force: true });
  const dir = path.join(TMP, 'evcounter');
  fs.mkdirSync(dir, { recursive: true });
  const anchor = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };
  const s1 = new WorldModelStore(dir);
  s1.writeEntity({ kind: 'boundary', name: 'A', evidence: anchor }); // ev:0
  s1.writeEntity({ kind: 'capability', name: 'b', evidence: anchor }); // ev:1
  s1.writeSlice({ name: 'Flow', steps: [{ entityId: 'capability:b' }], evidence: anchor }); // ev:2 (highest, on a slice)
  // Reload: fresh store over the same dir
  const s2 = new WorldModelStore(dir);
  const r = s2.writeEntity({ kind: 'capability', name: 'c', evidence: anchor }); // should mint ev:3, not ev:2
  const newId = s2.getEntity(r.id).evidence[0].id;
  const sliceEvId = s2.getSlices()[0].evidence[0].id;
  ok('store: evidence counter accounts for slice evidence on reload (no ev-id collision)',
    newId !== sliceEvId, `new entity evidence id ${newId} collides with slice evidence id ${sliceEvId}`);
}

// ── Bug 3: restore path traversal — filename with ../ must be rejected ──
{
  const dir = path.join(TMP, 'restore');
  fs.mkdirSync(path.join(dir, '.cartographer'), { recursive: true });
  const anchor = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };
  const store = new WorldModelStore(dir);
  store.writeEntity({ kind: 'boundary', name: 'Real', evidence: anchor });
  store.saveSnapshot('seed'); // creates snapshotDir + a real snapshot
  // Plant a "secret" file one level above the snapshots dir
  const snapDir = path.join(dir, '.cartographer', 'snapshots');
  const secret = path.join(path.dirname(snapDir), 'secret.txt');
  fs.writeFileSync(secret, 'TOP SECRET - not a model', 'utf-8');
  const modelBefore = fs.readFileSync(path.join(dir, '.cartographer', 'model.json'), 'utf-8');
  const restored = store.restoreSnapshot('../secret.txt'); // traversal attempt
  const modelAfter = fs.readFileSync(path.join(dir, '.cartographer', 'model.json'), 'utf-8');
  ok('store: restoreSnapshot rejects ../ traversal (returns false)', restored === false, `returned ${restored}`);
  ok('store: restoreSnapshot ../ did NOT overwrite model.json', modelBefore === modelAfter,
    'model.json was overwritten by a traversed file');
}

// ── report ──
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n  Backend unit regressions');
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`);
const fail = results.filter((r) => !r.ok).length;
console.log(`\n  ${results.length - fail}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
if (fail) process.exitCode = 1;

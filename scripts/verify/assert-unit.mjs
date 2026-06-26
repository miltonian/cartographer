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

// ── Bug 4: sub-boundary nesting (default perspective) ──
{
  const proj = computeMapProjection(snapshot([
    entity('boundary', 'Outer'),
    entity('capability', 'leaf1', 'boundary:Outer'),
    entity('boundary', 'Inner', 'boundary:Outer'),
    entity('capability', 'leaf2', 'boundary:Inner'),
  ]));
  const byId = Object.fromEntries(proj.nodes.map((n) => [n.id, n]));
  ok('layout: Outer renders as a top-level group', byId['boundary:Outer']?.isGroup && !byId['boundary:Outer']?.parentId);
  ok('layout: Inner nests under Outer (parentId)', byId['boundary:Inner']?.isGroup && byId['boundary:Inner']?.parentId === 'boundary:Outer');
  ok('layout: leaf1 nests under Outer', byId['capability:leaf1']?.parentId === 'boundary:Outer');
  ok('layout: leaf2 nests under Inner', byId['capability:leaf2']?.parentId === 'boundary:Inner');
  const O = byId['boundary:Outer'], I = byId['boundary:Inner'];
  ok('layout: Inner box fits within Outer', !!(I && O && I.x >= 0 && I.y >= 0 && (I.x + I.width) <= O.width && (I.y + I.height) <= O.height),
    `Inner=(${I?.x},${I?.y},${I?.width},${I?.height}) Outer=(${O?.width},${O?.height})`);
}

// ── Bug 5: boundary with ONLY sub-boundaries still renders (doesn't vanish) ──
{
  const proj = computeMapProjection(snapshot([
    entity('boundary', 'Parent'),
    entity('boundary', 'Child', 'boundary:Parent'),
    entity('capability', 'leaf', 'boundary:Child'),
  ]));
  const ids = new Set(proj.nodes.map((n) => n.id));
  ok('layout: Parent (only sub-boundary children) still renders', ids.has('boundary:Parent'));
  ok('layout: Child nests under Parent', proj.nodes.find((n) => n.id === 'boundary:Child')?.parentId === 'boundary:Parent');
}

// ── Bug 6: empty sub-boundary subtree is dropped ──
{
  const proj = computeMapProjection(snapshot([
    entity('boundary', 'A'),
    entity('capability', 'x', 'boundary:A'),
    entity('boundary', 'EmptyChild', 'boundary:A'),
  ]));
  const ids = new Set(proj.nodes.map((n) => n.id));
  ok('layout: A renders', ids.has('boundary:A'));
  ok('layout: empty sub-boundary is dropped', !ids.has('boundary:EmptyChild'));
}

// ── regression: flat two-boundary layout still nests leaves, finite bounds ──
{
  const proj = computeMapProjection(snapshot([
    entity('boundary', 'Auth'),
    entity('actor', 'Login', 'boundary:Auth'),
    entity('capability', 'Verify', 'boundary:Auth'),
    entity('boundary', 'Billing'),
    entity('capability', 'Charge', 'boundary:Billing'),
  ]));
  const byId = Object.fromEntries(proj.nodes.map((n) => [n.id, n]));
  ok('layout(flat): Auth is a top-level group', byId['boundary:Auth']?.isGroup && !byId['boundary:Auth']?.parentId);
  ok('layout(flat): Login nests under Auth', byId['actor:Login']?.parentId === 'boundary:Auth');
  ok('layout(flat): Charge nests under Billing', byId['capability:Charge']?.parentId === 'boundary:Billing');
  ok('layout(flat): bounds finite', Number.isFinite(proj.bounds.maxX) && proj.bounds.maxX > proj.bounds.minX);
}

// ── Bug 7: deleteEntity emits a real removed event, not a fake entity:added ──
{
  const dir = path.join(TMP, 'delevent');
  fs.mkdirSync(dir, { recursive: true });
  const a = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };
  const store = new WorldModelStore(dir);
  store.writeEntity({ kind: 'capability', name: 'gone', evidence: a });
  let removedId = null, fakeAdded = false;
  store.on('entity:removed', (e) => { removedId = e?.id ?? e; });
  store.on('entity:added', () => { fakeAdded = true; });
  store.deleteEntity('capability:gone');
  ok('store: deleteEntity emits entity:removed', removedId === 'capability:gone', `removedId=${removedId}`);
  ok('store: deleteEntity does not emit a fake entity:added', fakeAdded === false);
}

// ── Bug 8: restoring a CORRUPT snapshot fails safely (model preserved) ──
{
  const dir = path.join(TMP, 'restorecorrupt');
  fs.mkdirSync(path.join(dir, '.cartographer'), { recursive: true });
  const a = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };
  const store = new WorldModelStore(dir);
  store.writeEntity({ kind: 'boundary', name: 'Keep', evidence: a });
  store.saveSnapshot('good');
  fs.writeFileSync(path.join(dir, '.cartographer', 'snapshots', 'model.corrupt.json'), '{ not valid json', 'utf-8');
  const before = store.getSummary().entityCount;
  const restored = store.restoreSnapshot('model.corrupt.json');
  const after = store.getSummary().entityCount;
  ok('store: restore of a corrupt snapshot returns false', restored === false, `returned ${restored}`);
  ok('store: restore of a corrupt snapshot preserves the model', after === before, `before=${before} after=${after}`);
}

// ── Bug 9: over-long namePattern is capped to a literal (no ReDoS) ──
{
  const dir = path.join(TMP, 'redos');
  fs.mkdirSync(dir, { recursive: true });
  const a = { anchors: [{ filePath: 'x.ts', lineStart: 1, lineEnd: 2, snippet: 'x' }], confidence: 'proven', provenance: 'deterministic' };
  const store = new WorldModelStore(dir);
  store.writeEntity({ kind: 'capability', name: 'aaaaaaaaaaaaaaa', evidence: a });
  const evil = '(a+)+$'.repeat(60); // > cap → treated as a literal substring, never matches
  const t0 = Date.now();
  const res = store.queryEntities({ namePattern: evil });
  ok('store: over-long namePattern handled safely & quickly', Array.isArray(res) && res.length === 0 && (Date.now() - t0) < 500, `len=${res?.length} took ${Date.now()-t0}ms`);
}

// ── report ──
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n  Backend unit regressions');
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  — ${r.detail}`}`);
const fail = results.filter((r) => !r.ok).length;
console.log(`\n  ${results.length - fail}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
if (fail) process.exitCode = 1;

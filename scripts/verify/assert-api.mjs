#!/usr/bin/env node
// Data-layer assertions for the verification harness.
//
// Hits the running harness server's HTTP API and asserts every value against
// the golden fixture. Expected numbers are derived from the fixture and were
// cross-checked by simulating the projection layout. Exits non-zero on any miss.

import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── resolve the live port ─────────────────────────────────────
function resolvePort() {
  const portFile = process.env.CARTO_VERIFY_PORT_FILE || path.join(__dirname, 'out', 'endpoint-port');
  if (fs.existsSync(portFile)) {
    const p = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
    if (Number.isFinite(p)) return p;
  }
  return parseInt(process.env.CARTO_VERIFY_PORT ?? '3947', 10);
}
const PORT = resolvePort();
const BASE = `http://127.0.0.1:${PORT}/api`;

// ─── tiny assertion framework ──────────────────────────────────
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  record(name, a === e, a === e ? '' : `expected ${e}, got ${a}`);
}
function ok(name, condition, detail = '') {
  record(name, !!condition, condition ? '' : detail);
}

async function getJson(pathname) {
  const res = await fetch(`${BASE}${pathname}`);
  if (!res.ok) throw new Error(`GET ${pathname} → HTTP ${res.status}`);
  return res.json();
}

// Run a group of checks; if it throws (e.g. server empty/broken so a fetch 404s),
// record it as a failure and keep going so the report shows the FULL picture
// rather than crashing on the first hard error.
async function section(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(name, false, err.message);
  }
}

// ─── the checks ────────────────────────────────────────────────
async function main() {
  // /api/summary
  await section('summary endpoint', async () => {
    const summary = await getJson('/summary');
    eq('summary.entityCount', summary.entityCount, 8);
    eq('summary.relationshipCount', summary.relationshipCount, 4);
    eq('summary.sliceCount', summary.sliceCount, 1);
    eq('summary.perspectiveCount', summary.perspectiveCount, 2);
    eq('summary.activePerspective', summary.activePerspective, 'perspective:default');
    eq('summary.entitiesByKind', sortObj(summary.entitiesByKind), sortObj({
      boundary: 2, actor: 1, capability: 2, entity: 1, 'side-effect': 1, 'failure-point': 1,
    }));
    eq('summary.confidenceDistribution', sortObj(summary.confidenceDistribution), sortObj({
      proven: 4, high: 3, medium: 3, low: 1, speculative: 1,
    }));
  });

  // /api/projection/map (default perspective)
  await section('projection endpoint', async () => {
    const proj = await getJson('/projection/map');
    eq('projection.nodes.length', proj.nodes.length, 8);
    eq('projection.edges.length', proj.edges.length, 4);

    const groups = proj.nodes.filter((n) => n.isGroup);
    eq('projection group count', groups.length, 2);

    // The projection's perspective summaries carry entityCount — this is the exact
    // shape the UI's PerspectiveSelector renders.
    const projAuth = proj.perspectives.find((p) => p.id === 'perspective:auth');
    eq('projection auth perspective entityCount', projAuth?.entityCount, 4);
    ok('projection has boundary:Authentication as a group',
      groups.some((n) => n.id === 'boundary:Authentication'),
      'Authentication boundary should render as a group node');
    ok('projection has boundary:Billing as a group',
      groups.some((n) => n.id === 'boundary:Billing'),
      'Billing boundary should render as a group node');

    // Children nest under their parent (semantic-zoom precondition)
    const authChildren = proj.nodes.filter((n) => n.parentId === 'boundary:Authentication');
    eq('Authentication child node count', authChildren.length, 3);

    // Bounds must be non-degenerate (the map has spatial extent)
    ok('projection bounds non-degenerate',
      proj.bounds.maxX > proj.bounds.minX && proj.bounds.maxY > proj.bounds.minY,
      `bounds=${JSON.stringify(proj.bounds)}`);

    // Confidence rendered on nodes (best-of evidence)
    const billing = proj.nodes.find((n) => n.id === 'boundary:Billing');
    eq('boundary:Billing bestConfidence', billing?.bestConfidence, 'high');
  });

  // /api/slices
  await section('slices endpoint', async () => {
    const slicesResp = await getJson('/slices');
    eq('slices count', slicesResp.slices.length, 1);
    const flow = slicesResp.slices[0];
    eq('flow name', flow?.name, 'User login');
    eq('flow kind', flow?.kind, 'flow');
    eq('flow step count', flow?.steps?.length, 3);
    eq('flow first step entity', flow?.steps?.[0]?.entityId, 'actor:Login route');
  });

  // /api/perspectives
  await section('perspectives endpoint', async () => {
    const persp = await getJson('/perspectives');
    eq('active perspective', persp.active, 'perspective:default');
    const auth = persp.perspectives.find((p) => p.id === 'perspective:auth');
    ok('auth perspective present', !!auth, 'perspective:auth should exist');
    // /api/perspectives returns raw Perspective objects (entityIds, not entityCount)
    eq('auth perspective entityIds count', auth?.entityIds?.length, 4);
  });

  // /api/entities/:id — evidence + relationships round-trip
  await section('entity detail endpoint', async () => {
    const detail = await getJson('/entities/' + encodeURIComponent('capability:Verify credentials'));
    eq('entity kind', detail.entity?.kind, 'capability');
    ok('entity has evidence', (detail.entity?.evidence?.length ?? 0) >= 1, 'should carry >=1 evidence');
    ok('entity has outgoing rels', (detail.outgoing?.length ?? 0) >= 1,
      'Verify credentials writes Session and invokes Charge card');
  });

  report();
}

function sortObj(o) {
  return Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

function report() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n  API assertions @ ${BASE}`);
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${results.length} passed${fail ? `, ${fail} FAILED` : ''}`);
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error('  ❌ assert-api crashed:', err.message);
  process.exit(1);
});

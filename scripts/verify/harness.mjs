#!/usr/bin/env node
// Cartographer verification harness.
//
// Boots the CURRENT SOURCE stack (not the marketplace clone) against a known
// golden fixture, on a dedicated port, fully isolated — so Claude can run the
// whole system itself and verify every layer end-to-end.
//
// Commands:
//   node scripts/verify/harness.mjs up      boot source stack against the golden fixture
//   node scripts/verify/harness.mjs down    stop the harness-owned server, clean up
//   node scripts/verify/harness.mjs status  is it up? print the live summary
//   node scripts/verify/harness.mjs run     down → up → assert-api → smoke-mcp, leave server up
//
// Safety guarantees:
//   - Runs on a dedicated port (default 3947), never the product default 3847.
//   - Uses a gitignored working project dir; never touches the repo's real
//     .cartographer/model.json.
//   - Teardown kills ONLY the PID this harness recorded — never the plugin's
//     live MCP server (which powers Claude's tools mid-session).

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PORT = parseInt(process.env.CARTO_VERIFY_PORT ?? '3947', 10);
const HOST = '127.0.0.1';
const OUT = path.join(__dirname, 'out');
const PROJECT_DIR = path.join(OUT, 'project');
const PID_FILE = path.join(OUT, 'harness.pid');
const PORT_FILE = path.join(OUT, 'endpoint-port');
const LOG_FILE = path.join(OUT, 'server.log');
const FIXTURE = path.join(__dirname, 'fixtures', 'golden', 'model.json');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const ENTRY = path.join('src', 'index.ts');
const UI_DIST_INDEX = path.join(REPO_ROOT, 'dist', 'ui', 'index.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── small fs helpers ──────────────────────────────────────────
function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
}

function newestMtimeUnder(dir) {
  let newest = 0;
  const walk = (p) => {
    let stat;
    try { stat = fs.statSync(p); } catch { return; }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    } else if (stat.mtimeMs > newest) {
      newest = stat.mtimeMs;
    }
  };
  walk(dir);
  return newest;
}

// Rebuild the UI iff sources are newer than the built bundle (or it's missing).
function uiIsStale() {
  if (!fs.existsSync(UI_DIST_INDEX)) return true;
  const built = fs.statSync(UI_DIST_INDEX).mtimeMs;
  const srcNewest = Math.max(
    newestMtimeUnder(path.join(REPO_ROOT, 'ui')),
    fs.existsSync(path.join(REPO_ROOT, 'vite.config.ts'))
      ? fs.statSync(path.join(REPO_ROOT, 'vite.config.ts')).mtimeMs
      : 0,
  );
  return srcNewest > built;
}

function buildUI() {
  console.error('[harness] Building UI (sources changed or dist missing)...');
  const res = spawnSync('npm', ['run', 'build:ui'], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`UI build failed (exit ${res.status})`);
  }
}

function copyFixtureToWorkingDir() {
  fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROJECT_DIR, '.cartographer'), { recursive: true });
  const raw = fs.readFileSync(FIXTURE, 'utf-8');
  // The rootPath in the file is cosmetic (the store overrides it from the env),
  // but set it for clarity when inspecting the working copy.
  const patched = raw.replace('FIXTURE_ROOT_PLACEHOLDER', PROJECT_DIR);
  fs.writeFileSync(path.join(PROJECT_DIR, '.cartographer', 'model.json'), patched, 'utf-8');
}

// ─── pid / process control ─────────────────────────────────────
function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const n = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function killTrackedServer() {
  const pid = readPid();
  if (isAlive(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
    for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(150);
    if (isAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
    }
    console.error(`[harness] Stopped harness server (pid ${pid}).`);
  }
  fs.rmSync(PID_FILE, { force: true });
  fs.rmSync(PORT_FILE, { force: true });
}

// ─── health ────────────────────────────────────────────────────
async function fetchSummary(port, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${HOST}:${port}/api/summary`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The server writes its actual bound port into the project's .cartographer/port
// once HTTP is listening. We read THAT (not the requested port) so health checks
// are correct even if 3947 was occupied and the server scanned upward.
async function waitForBoundPort(timeoutMs = 20000) {
  const portFileInProject = path.join(PROJECT_DIR, '.cartographer', 'port');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFileInProject)) {
      const p = parseInt(fs.readFileSync(portFileInProject, 'utf-8').trim(), 10);
      if (Number.isFinite(p)) return p;
    }
    await sleep(150);
  }
  return null;
}

function tailLog(lines = 40) {
  if (!fs.existsSync(LOG_FILE)) return '(no server log)';
  const all = fs.readFileSync(LOG_FILE, 'utf-8').split('\n');
  return all.slice(-lines).join('\n');
}

// ─── commands ──────────────────────────────────────────────────
async function up() {
  ensureOut();
  await killTrackedServer();

  if (uiIsStale()) buildUI();
  else console.error('[harness] UI bundle is current — skipping build.');

  copyFixtureToWorkingDir();

  fs.writeFileSync(LOG_FILE, ''); // fresh log each boot
  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(TSX, [ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CARTOGRAPHER_PORT: String(PORT),
      CARTOGRAPHER_PROJECT: PROJECT_DIR,
    },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  const boundPort = await waitForBoundPort(20000);
  if (!boundPort) {
    console.error('[harness] Server did not report a bound port in time. Log tail:\n' + tailLog());
    throw new Error('boot timeout');
  }
  fs.writeFileSync(PORT_FILE, String(boundPort));

  // Confirm it actually serves the fixture
  let summary = null;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !summary) {
    summary = await fetchSummary(boundPort);
    if (!summary) await sleep(200);
  }
  if (!summary) {
    console.error('[harness] Server bound :' + boundPort + ' but /api/summary unhealthy. Log tail:\n' + tailLog());
    throw new Error('health timeout');
  }

  console.error(
    `[harness] UP  pid=${child.pid}  url=http://${HOST}:${boundPort}  ` +
    `entities=${summary.entityCount} relationships=${summary.relationshipCount} ` +
    `slices=${summary.sliceCount} perspectives=${summary.perspectiveCount}`,
  );
  return { port: boundPort, summary };
}

async function down() {
  ensureOut();
  await killTrackedServer();
  console.error('[harness] DOWN');
}

async function status() {
  const pid = readPid();
  const alive = isAlive(pid);
  let port = null;
  if (fs.existsSync(PORT_FILE)) port = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim(), 10);
  let summary = port ? await fetchSummary(port) : null;
  console.error(
    `[harness] status: ${alive ? 'UP' : 'DOWN'}  pid=${pid ?? '-'}  ` +
    `port=${port ?? '-'}  ` +
    (summary ? `entities=${summary.entityCount}` : 'no-summary'),
  );
  return alive;
}

function runStep(label, file) {
  console.error(`\n[harness] ── ${label} ─────────────────────────────`);
  const res = spawnSync('node', [path.join(__dirname, file)], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, CARTO_VERIFY_PORT_FILE: PORT_FILE },
  });
  return res.status === 0;
}

async function run() {
  await down();
  const { port } = await up();

  const apiOk = runStep('API assertions (data layer)', 'assert-api.mjs');
  const mcpOk = runStep('MCP write-path smoke', 'smoke-mcp.mjs');

  console.error('\n[harness] ══════════════════════════════════════════');
  console.error(`[harness]   API data layer : ${apiOk ? 'PASS ✅' : 'FAIL ❌'}`);
  console.error(`[harness]   MCP write path : ${mcpOk ? 'PASS ✅' : 'FAIL ❌'}`);
  console.error('[harness] ──────────────────────────────────────────');
  console.error(`[harness]   Server LEFT UP at http://${HOST}:${port}`);
  console.error('[harness]   → Now run the Playwright visual checks (see plugin/skills/verify/SKILL.md).');
  console.error('[harness]   → When finished: node scripts/verify/harness.mjs down');
  console.error('[harness] ══════════════════════════════════════════');

  if (!apiOk || !mcpOk) process.exitCode = 1;
}

// ─── dispatch ──────────────────────────────────────────────────
const cmd = process.argv[2] ?? 'run';
const commands = { up, down, status, run };
const fn = commands[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}\nUsage: harness.mjs [up|down|status|run]`);
  process.exit(2);
}
fn().catch((err) => {
  console.error('[harness] ERROR:', err.message);
  process.exit(1);
});

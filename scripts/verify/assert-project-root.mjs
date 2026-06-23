#!/usr/bin/env node
// Regression test for the project-root resolution bug.
//
// Reproduces the marketplace-install condition: Claude Code spawns the MCP
// server with CLAUDE_PROJECT_DIR = the user's project, but start.sh has cd'd
// the process cwd into the service dir. The server must map the user's project
// (CLAUDE_PROJECT_DIR), NOT its own cwd.
//
// Before the fix (index.ts uses process.cwd()): projectRoot === fake cwd → FAIL.
// After the fix (prefers CLAUDE_PROJECT_DIR):     projectRoot === project → PASS.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const ENTRY = path.join(REPO_ROOT, 'src', 'index.ts'); // absolute, so cwd is free to differ
const OUT = path.join(__dirname, 'out');
const FAKE_CWD = path.join(OUT, 'projroot-fakecwd');      // simulates start.sh's `cd service`
const EXPECTED_PROJECT = path.join(OUT, 'projroot-expected'); // simulates the user's project
const LOG = path.join(OUT, 'projroot-server.log');
const PREFERRED_PORT = process.env.CARTO_PROJROOT_PORT ?? '3971';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read the ACTUAL bound port from the server's log. index.ts may scan past the
// preferred port if it's occupied, so never assume — and never poll a port a
// stale server might be squatting on.
function boundPortFromLog() {
  if (!fs.existsSync(LOG)) return null;
  const m = fs.readFileSync(LOG, 'utf-8').match(/HTTP server: http:\/\/localhost:(\d+)/);
  return m ? m[1] : null;
}

async function summary(port, timeoutMs = 1200) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/summary`, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function main() {
  for (const d of [FAKE_CWD, EXPECTED_PROJECT]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }

  // Deliberately strip CARTOGRAPHER_PROJECT so resolution falls through to the
  // CLAUDE_PROJECT_DIR / cwd decision under test.
  const env = { ...process.env, CLAUDE_PROJECT_DIR: EXPECTED_PROJECT, CARTOGRAPHER_PORT: PREFERRED_PORT };
  delete env.CARTOGRAPHER_PROJECT;

  const logFd = fs.openSync(LOG, 'w');
  // detached:true makes the child a process-group leader so we can kill the whole
  // group — tsx is a wrapper that does NOT forward SIGTERM to its node child, so
  // a plain child.kill() leaves a zombie server squatting on the port.
  const child = spawn(TSX, [ENTRY], { cwd: FAKE_CWD, env, stdio: ['ignore', logFd, logFd], detached: true });

  let result = null;
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !result) {
      const port = boundPortFromLog();
      if (port) result = await summary(port);
      if (!result) await sleep(250);
    }
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
  }

  const checks = [];
  if (!result) {
    checks.push({ name: 'server healthy', ok: false, detail: `no /api/summary on :${PORT} (see out/projroot-server.log)` });
  } else {
    checks.push({
      name: 'projectRoot resolves to CLAUDE_PROJECT_DIR, not cwd',
      ok: result.projectRoot === EXPECTED_PROJECT,
      detail: `expected ${EXPECTED_PROJECT}, got ${result.projectRoot}`,
    });
  }

  // cleanup (the buggy path may have created .cartographer under FAKE_CWD)
  for (const d of [FAKE_CWD, EXPECTED_PROJECT]) fs.rmSync(d, { recursive: true, force: true });

  console.log('\n  Project-root resolution');
  for (const c of checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}${c.ok ? '' : `  — ${c.detail}`}`);
  const fail = checks.filter((c) => !c.ok).length;
  console.log(`\n  ${checks.length - fail}/${checks.length} passed${fail ? `, ${fail} FAILED` : ''}`);
  if (fail) process.exitCode = 1;
}

main().catch((err) => { console.error('  ❌ assert-project-root crashed:', err.message); process.exit(1); });

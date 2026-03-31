#!/bin/sh
# Cartographer MCP server bootstrap
# Handles both source installs (--plugin-dir) and marketplace installs.
# All non-MCP output goes to stderr — stdout is reserved for MCP protocol.

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$PLUGIN_DIR/.." && pwd)"

# ─── Source install: project root has src/ and package.json ─────
if [ -f "$PROJECT_DIR/package.json" ] && [ -d "$PROJECT_DIR/src" ]; then
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "[cartographer] Installing dependencies..." >&2
    (cd "$PROJECT_DIR" && npm install) >&2
  fi
  cd "$PROJECT_DIR" && exec ./node_modules/.bin/tsx src/index.ts
fi

# ─── Marketplace install: bootstrap into persistent data dir ────
# CARTOGRAPHER_DATA is set from ${CLAUDE_PLUGIN_DATA} via .mcp.json env.
# Falls back to ~/.cartographer-service if not set.
DATA_DIR="${CARTOGRAPHER_DATA:-$HOME/.cartographer-service}"
SERVICE="$DATA_DIR/repo"
VERSION_FILE="$DATA_DIR/.version"
TARGET_VERSION=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/.claude-plugin/plugin.json'))['version'])" 2>/dev/null || echo "0.0.0")

needs_install() {
  [ ! -f "$SERVICE/package.json" ] && return 0
  [ ! -d "$SERVICE/node_modules" ] && return 0
  [ ! -f "$VERSION_FILE" ] && return 0
  [ "$(cat "$VERSION_FILE")" != "$TARGET_VERSION" ] && return 0
  return 1
}

if needs_install; then
  echo "[cartographer] Setting up service v${TARGET_VERSION}..." >&2
  mkdir -p "$DATA_DIR" >&2
  if [ -d "$SERVICE" ]; then
    echo "[cartographer] Updating existing installation..." >&2
    (cd "$SERVICE" && git fetch --depth 1 origin main && git reset --hard origin/main) >&2
  else
    echo "[cartographer] Cloning repository..." >&2
    git clone --depth 1 https://github.com/miltonian/cartographer.git "$SERVICE" >&2
  fi
  echo "[cartographer] Installing dependencies..." >&2
  (cd "$SERVICE" && npm install) >&2
  echo "[cartographer] Building UI..." >&2
  (cd "$SERVICE" && npm run build:ui) >&2
  echo "$TARGET_VERSION" > "$VERSION_FILE"
  echo "[cartographer] Ready." >&2
fi

cd "$SERVICE" && exec ./node_modules/.bin/tsx src/index.ts

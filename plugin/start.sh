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
# Read the version with node (guaranteed present — it runs the server). The old
# python3 probe fell back to 0.0.0 when python3 was absent, which never matched
# the installed version → a full re-clone/install/build on EVERY launch.
TARGET_VERSION=$(node -p "require('$PLUGIN_DIR/.claude-plugin/plugin.json').version" 2>/dev/null || echo "0.0.0")

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

  fetch_ok=1
  if [ -d "$SERVICE/.git" ]; then
    echo "[cartographer] Updating existing installation..." >&2
    (cd "$SERVICE" && git fetch --depth 1 origin main && git reset --hard origin/main) >&2 || fetch_ok=0
  else
    echo "[cartographer] Cloning repository..." >&2
    rm -rf "$SERVICE" >&2
    git clone --depth 1 https://github.com/miltonian/cartographer.git "$SERVICE" >&2 || fetch_ok=0
  fi

  # Only stamp the version file (which marks the install "current") if EVERY step
  # succeeds. Otherwise a failed npm/build used to write the version anyway,
  # leaving a broken service that never self-healed.
  if [ "$fetch_ok" = "1" ] && (cd "$SERVICE" && echo "[cartographer] Installing dependencies..." >&2 && npm install >&2 && echo "[cartographer] Building UI..." >&2 && npm run build:ui >&2); then
    echo "$TARGET_VERSION" > "$VERSION_FILE"
    echo "[cartographer] Ready." >&2
  else
    echo "[cartographer] ERROR: setup failed (clone/install/build). Not marking installed; will retry next launch." >&2
    exit 1
  fi
fi

cd "$SERVICE" && exec ./node_modules/.bin/tsx src/index.ts

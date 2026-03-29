#!/bin/sh
# Cartographer MCP server bootstrap
# Installs dependencies if missing, then starts the service.
# All output goes to stderr — stdout is reserved for MCP protocol.

SERVICE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Install deps if node_modules is missing
if [ ! -d "$SERVICE_DIR/node_modules" ]; then
  echo "[cartographer] Installing dependencies..." >&2
  (cd "$SERVICE_DIR" && npm install --omit=dev --ignore-scripts) >&2
fi

# Start the service
cd "$SERVICE_DIR" && exec ./node_modules/.bin/tsx src/index.ts

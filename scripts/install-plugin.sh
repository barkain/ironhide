#!/bin/bash
# Build Claude Code Analytics Plugin
# For full setup with auto-start, use: ./scripts/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building Claude Code Analytics Plugin..."
echo ""

cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  bun install
fi

# Build all packages
echo "Building packages..."
bun run build

SERVER_PATH="$PROJECT_DIR/apps/server/dist/index.js"

if [ ! -f "$SERVER_PATH" ]; then
  echo "Error: Build failed. Server not found at $SERVER_PATH"
  exit 1
fi

echo ""
echo "Build complete!"
echo ""
echo "============================================"
echo "Auto-Start Configuration"
echo "============================================"
echo ""
echo "The plugin is configured for auto-start via .mcp.json."
echo "When you open Claude Code in this directory, the MCP server"
echo "will start automatically with the dashboard HTTP server enabled."
echo ""
echo "Dashboard URL: http://localhost:3100"
echo ""
echo "For user-wide auto-start (all projects), run:"
echo "  ./scripts/setup.sh"
echo ""
echo "============================================"
echo "Manual Commands (if needed)"
echo "============================================"
echo ""
echo "Add MCP server manually:"
echo "  claude mcp add analytics -- bun \"$SERVER_PATH\" --mcp --with-http"
echo ""
echo "Start dashboard UI separately:"
echo "  bun run dashboard"
echo ""
echo "Remove server:"
echo "  claude mcp remove analytics"
echo ""

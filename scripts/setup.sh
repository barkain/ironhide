#!/bin/bash
# One-time setup for Claude Code Analytics Plugin
# Adds the MCP server to ~/.claude.json for auto-start across all projects

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLAUDE_CONFIG="$HOME/.claude.json"

echo "Claude Code Analytics - Setup"
echo "=============================="
echo ""

# Step 1: Build the project
echo "Step 1: Building the project..."
cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies..."
  bun install
fi

# Build all packages
echo "  Building packages..."
bun run build

SERVER_PATH="$PROJECT_DIR/apps/server/dist/index.js"

if [ ! -f "$SERVER_PATH" ]; then
  echo "Error: Build failed. Server not found at $SERVER_PATH"
  exit 1
fi

echo "  Build complete!"
echo ""

# Step 2: Add to Claude Code configuration
echo "Step 2: Configuring Claude Code..."

# Check if user wants project-scoped (default) or user-scoped installation
echo ""
echo "Installation options:"
echo "  1) Project-scoped (auto-starts when working in THIS directory) [default]"
echo "  2) User-scoped (auto-starts in ALL projects)"
echo ""
read -p "Choose option [1]: " INSTALL_SCOPE
INSTALL_SCOPE=${INSTALL_SCOPE:-1}

if [ "$INSTALL_SCOPE" = "2" ]; then
  # User-scoped: Use claude mcp add with --scope user
  echo ""
  echo "Adding to user scope (all projects)..."

  # Remove existing if present
  claude mcp remove analytics 2>/dev/null || true

  # Add with user scope and HTTP enabled for dashboard
  claude mcp add analytics --scope user -- bun "$SERVER_PATH" --mcp --with-http

  echo ""
  echo "Success! Analytics MCP server added to user scope."
  echo ""
  echo "The server will auto-start in ALL Claude Code sessions."

else
  # Project-scoped: The .mcp.json file already handles this
  echo ""
  echo "Using project-scoped configuration (.mcp.json)..."
  echo ""
  echo "Success! The project's .mcp.json is already configured."
  echo ""
  echo "The server will auto-start when Claude Code is opened in:"
  echo "  $PROJECT_DIR"
fi

echo ""
echo "=============================="
echo "Setup Complete!"
echo "=============================="
echo ""
echo "Next steps:"
echo ""
echo "1. Restart Claude Code (or start a new session)"
echo ""
echo "2. The MCP server will auto-start with the HTTP server enabled"
echo "   Dashboard available at: http://localhost:3100"
echo ""
echo "3. Use the get_analytics tool in Claude Code:"
echo "   > Use get_analytics to show my session stats"
echo ""
echo "4. To start the full dashboard UI separately:"
echo "   cd $PROJECT_DIR && bun run dashboard"
echo "   Open: http://localhost:3000"
echo ""
echo "To remove the server later:"
echo "  claude mcp remove analytics"
echo ""

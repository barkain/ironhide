# Claude Code Analytics Dashboard

Session analytics dashboard with real-time metrics, cost tracking, and efficiency scoring for Claude Code.

## Overview

This plugin provides comprehensive analytics for your Claude Code sessions:

- **Real-time Metrics**: Track token usage, cost, and efficiency as you work
- **Session History**: Review past sessions with detailed turn-by-turn analysis
- **Cost Tracking**: Monitor API costs with per-turn and per-session breakdowns
- **Efficiency Scoring**: Get recommendations to optimize your Claude Code usage
- **Code Change Analytics**: Track files created, modified, and lines changed

## Architecture

The plugin consists of two components:

1. **MCP Server**: Integrates with Claude Code via Model Context Protocol
2. **HTTP API + Dashboard**: Web-based analytics dashboard with real-time updates

```
+------------------+     +-------------------+     +------------------+
|   Claude Code    |     |  Analytics Plugin |     |    Dashboard     |
|     Session      |     |                   |     |    (Next.js)     |
+--------+---------+     |  +-------------+  |     +--------+---------+
         |               |  | MCP Server  |  |              |
         |  JSONL Logs   |  +------+------+  |              |
         +-------------->|  | File Watcher|  |              |
                         |  +------+------+  |              |
                         |  | HTTP Server |<-+------------->|
                         +-------------------+              |
```

## Installation

### Prerequisites

- Bun 1.x or later
- Claude Code CLI

### Quick Start (Auto-Start Enabled)

1. Clone and build:
   ```bash
   git clone <repo-url> claude-code-analytics-dashboard
   cd claude-code-analytics-dashboard
   bun install
   bun run build
   ```

2. **That's it!** The plugin auto-starts when you open Claude Code in this directory.

The `.mcp.json` file is pre-configured to auto-register the MCP server with the dashboard HTTP server enabled.

### Verify Installation

Inside Claude Code, check the MCP server status:
```
/mcp
```

Or from your terminal:
```bash
claude mcp list
```

### Access the Dashboard

The HTTP dashboard API is available at **http://localhost:3100** when the MCP server is running.

For the full dashboard UI:
```bash
bun run dashboard
# Opens at http://localhost:3000 (or custom PORT if set)
```

You can customize the port:
```bash
PORT=3001 bun run dashboard
# Opens at http://localhost:3001
```

## Auto-Start Options

### Option 1: Project-Scoped (Default)

The `.mcp.json` file at the project root automatically registers the MCP server when Claude Code opens this directory. No additional setup required.

```json
{
  "mcpServers": {
    "analytics": {
      "command": "bun",
      "args": ["run", "apps/server/src/index.ts", "--mcp", "--with-http"],
      "env": {
        "CLAUDE_SESSIONS_PATH": "${HOME}/.claude/projects"
      }
    }
  }
}
```

### Option 2: User-Scoped (All Projects)

To auto-start the analytics server in ALL Claude Code sessions, run the setup script:

```bash
./scripts/setup.sh
```

This adds the MCP server to your `~/.claude.json` user configuration.

### Option 3: Manual Installation

If you prefer manual control:

```bash
# Add to current project only
claude mcp add analytics -- bun "$(pwd)/apps/server/dist/index.js" --mcp --with-http

# Add to all projects (user scope)
claude mcp add analytics --scope user -- bun "$(pwd)/apps/server/dist/index.js" --mcp --with-http
```

### Remove the Plugin

```bash
claude mcp remove analytics
```

## MCP Tools

Once enabled, the following tool is available in Claude Code:

### get_analytics

Get comprehensive session analytics including cost, tokens, efficiency, and recent activity in a single call.

```
Input:
  sessionId?: string  // Optional, uses current/most recent session if not provided

Output:
  session: {
    id: string
    projectName: string
    branch: string | null
    startedAt: string
    turnCount: number
    isActive: boolean
  }
  cost: {
    total: number
    breakdown: { input, output, cacheCreation }
  }
  tokens: {
    total: number
    input: number
    output: number
    cacheRead: number
    cacheCreation: number
  }
  efficiency: {
    score: number (0-100)
    cacheHitRate: number (percentage)
    codeOutputRatio: number (lines per 1000 tokens)
  }
  codeChanges: {
    filesCreated: number
    filesModified: number
    linesAdded: number
    linesRemoved: number
  }
  recentTurns: Array<{
    turnNumber: number
    timestamp: string
    durationMs: number
    tokenCount: number
    toolCount: number
    summary: string (first 100 chars of user message)
  }>
  dashboardUrl: string
```

## MCP Resources

The plugin also exposes resources that can be read:

| URI | Description |
|-----|-------------|
| `sessions://list` | List of all available sessions |
| `sessions://current` | Current active session data |
| `metrics://current` | Current session metrics |

## Dashboard

The web dashboard provides real-time visualization of your session analytics.

### Dashboard Access

When running with `--with-http` flag (default in auto-start config):

- **API Server**: http://localhost:3100
- **Health Check**: http://localhost:3100/health
- **SSE Stream**: http://localhost:3100/api/sse

For the full Next.js dashboard UI:
```bash
bun run dashboard
# Opens at http://localhost:3000
```

With custom port:
```bash
PORT=3001 bun run dashboard
# Opens at http://localhost:3001
```

### Dashboard Features

- **Session Overview**: View all sessions with summary statistics
- **Real-time Updates**: Live token and cost tracking via SSE
- **Turn History**: Detailed breakdown of each turn
- **Charts**: Visualize token usage, costs, and efficiency over time
- **Code Metrics**: Track files created, modified, and deleted

## Development

### Local Development

```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun run dev

# Start server only
bun run server

# Start dashboard only
bun run dashboard
```

### Development MCP Configuration

The `.mcp.json` includes a development server with hot reload:

```json
{
  "mcpServers": {
    "analytics-dev": {
      "command": "bun",
      "args": ["--watch", "apps/server/src/index.ts", "--mcp", "--with-http"]
    }
  }
}
```

### Project Structure

```
claude-code-analytics-dashboard/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (for plugin marketplace)
├── .mcp.json                 # Auto-start MCP configuration
├── scripts/
│   ├── setup.sh             # One-time setup for user-scoped install
│   └── install-plugin.sh    # Build script
├── apps/
│   ├── server/              # MCP + HTTP server
│   │   └── src/
│   │       ├── mcp/         # MCP tools and resources
│   │       ├── http/        # HTTP routes and SSE
│   │       ├── watcher/     # File system watcher
│   │       ├── parser/      # JSONL parser
│   │       └── metrics/     # Metrics calculator
│   └── dashboard/           # Next.js dashboard
└── packages/
    └── shared/              # Shared types and utilities
```

## Configuration

### Ports

The dashboard and API server use configurable ports via environment variables or `.env` file:

**Dashboard port (default 3000):**
```bash
PORT=3001 bun run dashboard
```

**API server port (default 3100):**
```bash
API_PORT=3200 bun run dev
```

**Or create a `.env` file at the project root:**
```bash
PORT=3001
API_PORT=3200
```

Then start normally and the configured ports will be used automatically.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` (dashboard) / `3100` (server) | HTTP server port |
| `HOST` | `127.0.0.1` | HTTP server host (localhost only) |
| `CLAUDE_SESSIONS_PATH` | `~/.claude/projects` | Path to Claude session logs |
| `RUN_MODE` | `http` | Server mode: `http`, `mcp`, or `both` |
| `MCP_ENABLE_HTTP` | `0` | Enable HTTP server in MCP mode |
| `DEBUG_MCP` | - | Enable MCP debug logging to stderr |

### MCP Mode Options

```bash
# MCP only (stdio transport)
bun dist/index.js --mcp

# MCP with HTTP server for dashboard (recommended)
bun dist/index.js --mcp --with-http

# HTTP only (default when run directly)
bun dist/index.js
```

## API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/:id/turns` | Get turns for session |
| GET | `/api/sessions/:id/metrics` | Get session metrics |
| GET | `/api/turns/:id` | Get turn details |
| GET | `/api/sse` | SSE stream for real-time updates |
| GET | `/health` | Health check endpoint |

### SSE Events

| Event | Description |
|-------|-------------|
| `connected` | Initial connection confirmation |
| `session` | Session snapshot or update |
| `turn` | New or updated turn |
| `metrics` | Aggregated metrics update |
| `heartbeat` | Keep-alive (every 30s) |

## Security

- HTTP server binds to localhost only (`127.0.0.1`)
- CORS restricted to localhost origins
- No external network calls
- No sensitive data (API keys, credentials) exposed
- Session data stays local

## Troubleshooting

### MCP Server Not Starting

1. Ensure the project is built: `bun run build`
2. Check Claude Code MCP status: `/mcp`
3. Verify the server path exists: `ls apps/server/dist/index.js`

### Dashboard Not Accessible

1. Ensure `--with-http` flag is included in the MCP args
2. Check if port 3100 is available: `lsof -i :3100`
3. Try accessing the health endpoint: `curl http://localhost:3100/health`

### No Session Data

1. Verify CLAUDE_SESSIONS_PATH points to your Claude projects: `ls ~/.claude/projects`
2. Start a new Claude Code session to generate data
3. Check server logs with `DEBUG_MCP=1` enabled

## License

MIT

## Contributing

Contributions are welcome! Please read the [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.

# Claude Code MCP Plugin and Server Installation Standards

**Last Updated:** 2026-02-01
**Sources:** Official Claude Code Documentation

---

## Table of Contents

1. [Configuration File Locations](#configuration-file-locations)
2. [MCP Server Configuration Schema](#mcp-server-configuration-schema)
3. [Environment Variable Substitutions](#environment-variable-substitutions)
4. [Plugin Manifest Format](#plugin-manifest-format)
5. [Installation Best Practices](#installation-best-practices)
6. [CLI Commands Reference](#cli-commands-reference)

---

## Configuration File Locations

### MCP Server Configuration Files

| Scope | File Location | Purpose |
|-------|---------------|---------|
| **Project** | `.mcp.json` (repository root) | Team-shared MCP servers (version controlled) |
| **User/Local** | `~/.claude.json` | Personal MCP servers across all projects |
| **Managed** | System directories (see below) | Organization-wide MCP servers |

### Managed Configuration Paths

```
macOS:         /Library/Application Support/ClaudeCode/managed-mcp.json
Linux/WSL:     /etc/claude-code/managed-mcp.json
Windows:       C:\Program Files\ClaudeCode\managed-mcp.json
```

### Plugin Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `plugin.json` | `.claude-plugin/plugin.json` | Plugin manifest (required) |
| `.mcp.json` | Plugin root | Plugin-bundled MCP servers |
| `.lsp.json` | Plugin root | Language Server Protocol servers |
| `hooks.json` | `hooks/hooks.json` | Plugin hook configurations |

### Settings Files (General Configuration)

```
User Scope:
  ~/.claude/settings.json          # User settings
  ~/.claude.json                   # Preferences, OAuth, per-project state

Project Scope:
  .claude/settings.json            # Project settings (shared)
  .claude/settings.local.json      # Project local overrides (gitignored)
  .mcp.json                        # Project MCP servers (shared)

Managed Scope:
  managed-settings.json            # Organization policies
  managed-mcp.json                 # Organization MCP servers
```

**Note:** `mcpServers` is NOT a valid field in `settings.json`. MCP servers must be configured in:
- `.mcp.json` (project scope)
- `~/.claude.json` (user scope)
- `managed-mcp.json` (managed scope)

---

## MCP Server Configuration Schema

### Basic Schema Structure

```json
{
  "mcpServers": {
    "server-name": {
      // For stdio transport (local process)
      "command": "string",        // Required: executable path
      "args": ["string"],         // Optional: command arguments
      "env": {},                  // Optional: environment variables
      "cwd": "string",            // Optional: working directory

      // For HTTP/SSE transport (remote server)
      "type": "http" | "sse",     // Required for remote servers
      "url": "string",            // Required: server URL
      "headers": {}               // Optional: authentication headers
    }
  }
}
```

### Stdio Transport Example (Local Process)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "database": {
      "command": "/usr/local/bin/db-server",
      "args": ["--config", "./config.json"],
      "env": {
        "DB_CONNECTION_STRING": "postgresql://localhost:5432/mydb"
      },
      "cwd": "/path/to/working/directory"
    }
  }
}
```

### HTTP Transport Example (Remote Server)

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "secure-api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token",
        "X-Custom-Header": "value"
      }
    }
  }
}
```

### SSE Transport Example (Deprecated)

```json
{
  "mcpServers": {
    "asana": {
      "type": "sse",
      "url": "https://mcp.asana.com/sse"
    }
  }
}
```

**Note:** SSE (Server-Sent Events) transport is deprecated. Use HTTP transport where available.

### Windows-Specific Configuration

On Windows (not WSL), `npx` commands require the `cmd /c` wrapper:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem", "D:/data"]
    }
  }
}
```

---

## Environment Variable Substitutions

### Supported Syntax

| Syntax | Behavior |
|--------|----------|
| `${VAR}` | Expands to the value of environment variable `VAR` |
| `${VAR:-default}` | Expands to `VAR` if set, otherwise uses `default` |

### Expansion Locations

Environment variables can be expanded in:
- `command` - Server executable path
- `args` - Command-line arguments
- `env` - Environment variables passed to server
- `url` - For HTTP server types
- `headers` - For HTTP server authentication
- `cwd` - Working directory

### Example with Environment Variables

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    },
    "local-server": {
      "command": "${HOME}/bin/my-server",
      "args": ["--config", "${CONFIG_PATH:-./config.json}"],
      "env": {
        "LOG_LEVEL": "${LOG_LEVEL:-info}",
        "DATA_DIR": "${DATA_DIR}"
      }
    }
  }
}
```

### Plugin-Specific Environment Variable

**`${CLAUDE_PLUGIN_ROOT}`** - Absolute path to the plugin directory. Essential for plugin-bundled MCP servers:

```json
{
  "mcpServers": {
    "plugin-database": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_PATH": "${CLAUDE_PLUGIN_ROOT}/data"
      }
    }
  }
}
```

### MCP-Related Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TIMEOUT` | Server startup timeout (ms) | 30000 |
| `MCP_TOOL_TIMEOUT` | Tool execution timeout (ms) | - |
| `MAX_MCP_OUTPUT_TOKENS` | Max tokens in MCP responses | 25000 |
| `ENABLE_TOOL_SEARCH` | MCP tool search mode (`auto`, `auto:N`, `true`, `false`) | `auto` |

---

## Plugin Manifest Format

### Complete `plugin.json` Schema

Location: `.claude-plugin/plugin.json` (required)

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],

  "commands": ["./custom/commands/special.md"],
  "agents": "./custom/agents/",
  "skills": "./custom/skills/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "lspServers": "./.lsp.json",
  "outputStyles": "./styles/"
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (kebab-case, no spaces) |

### Optional Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version (e.g., "2.1.0") |
| `description` | string | Brief explanation of plugin purpose |
| `author` | object | Author info: `{name, email, url}` |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | License identifier (e.g., "MIT") |
| `keywords` | array | Discovery tags |

### Component Path Fields

| Field | Type | Description |
|-------|------|-------------|
| `commands` | string\|array | Command markdown files/directories |
| `agents` | string\|array | Agent markdown files |
| `skills` | string\|array | Skill directories (with SKILL.md) |
| `hooks` | string\|object | Hook config path or inline config |
| `mcpServers` | string\|object | MCP config path or inline config |
| `lspServers` | string\|object | LSP server configuration |
| `outputStyles` | string\|array | Output style files/directories |

### Plugin Directory Structure

```
enterprise-plugin/
├── .claude-plugin/           # Metadata directory
│   └── plugin.json          # Required: plugin manifest
├── commands/                 # Default command location
│   ├── status.md
│   └── logs.md
├── agents/                   # Default agent location
│   └── security-reviewer.md
├── skills/                   # Skills with SKILL.md structure
│   └── code-reviewer/
│       └── SKILL.md
├── hooks/
│   └── hooks.json           # Hook configuration
├── .mcp.json                # MCP server definitions
├── .lsp.json                # LSP server configurations
├── scripts/                 # Hook and utility scripts
│   └── format-code.sh
├── LICENSE
└── CHANGELOG.md
```

### Inline MCP Configuration in plugin.json

Instead of a separate `.mcp.json`, you can include MCP servers directly:

```json
{
  "name": "my-plugin",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

---

## Installation Best Practices

### 1. Choose the Right Scope

| Scope | When to Use |
|-------|-------------|
| **Local** (default) | Personal development servers, experimental configs |
| **Project** | Team-shared servers via `.mcp.json` |
| **User** | Personal utilities across all projects |
| **Managed** | Organization-wide enforcement |

### 2. Use Environment Variables for Secrets

Never hardcode API keys or secrets:

```json
{
  "mcpServers": {
    "api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

### 3. Use Absolute Paths with Variables

For plugin servers, always use `${CLAUDE_PLUGIN_ROOT}`:

```json
{
  "mcpServers": {
    "server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/server",
      "cwd": "${CLAUDE_PLUGIN_ROOT}"
    }
  }
}
```

### 4. Prefer HTTP Transport for Remote Servers

HTTP is the recommended transport for cloud-based MCP services:

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

### 5. Test Servers Before Deployment

```bash
# List all configured servers
claude mcp list

# Test a specific server
claude mcp get server-name

# Check server status in Claude Code
/mcp
```

### 6. Handle Windows Compatibility

For cross-platform plugins, detect the platform:

```json
{
  "mcpServers": {
    "server-unix": {
      "command": "./bin/server",
      "args": []
    }
  }
}
```

On Windows, users may need to wrap with `cmd /c`.

### 7. Document Required Environment Variables

In your plugin's README:

```markdown
## Required Environment Variables

- `API_KEY`: Your API authentication key
- `DATA_DIR`: Directory for storing data (default: ./data)
```

---

## CLI Commands Reference

### Adding MCP Servers

```bash
# HTTP transport (recommended for remote)
claude mcp add --transport http <name> <url>
claude mcp add --transport http notion https://mcp.notion.com/mcp

# SSE transport (deprecated)
claude mcp add --transport sse <name> <url>

# Stdio transport (local process)
claude mcp add --transport stdio <name> -- <command> [args...]
claude mcp add --transport stdio airtable -- npx -y airtable-mcp-server

# With environment variables
claude mcp add --transport stdio --env API_KEY=xxx server -- npx server

# With authentication headers
claude mcp add --transport http api https://api.example.com/mcp \
  --header "Authorization: Bearer token"

# Specify scope
claude mcp add --transport http github --scope user https://api.github.com/mcp
```

### Managing Servers

```bash
# List all configured servers
claude mcp list

# Get details for a specific server
claude mcp get <name>

# Remove a server
claude mcp remove <name>

# Add from JSON configuration
claude mcp add-json <name> '<json>'
claude mcp add-json weather '{"type":"http","url":"https://api.weather.com/mcp"}'

# Import from Claude Desktop
claude mcp add-from-claude-desktop

# Reset project server approvals
claude mcp reset-project-choices
```

### Plugin Commands

```bash
# Install plugin
claude plugin install <plugin-name>@<marketplace>
claude plugin install formatter@my-marketplace --scope project

# Manage plugins
claude plugin uninstall <plugin>
claude plugin enable <plugin>
claude plugin disable <plugin>
claude plugin update <plugin>

# Debug
claude --debug
```

### Scope Options

| Option | Description |
|--------|-------------|
| `--scope local` | Current project only (default) |
| `--scope project` | Shared via `.mcp.json` |
| `--scope user` | All projects for current user |

---

## Additional Resources

- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code Settings](https://code.claude.com/docs/en/settings)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Docker MCP Toolkit](https://www.docker.com/blog/add-mcp-servers-to-claude-code-with-mcp-toolkit/)

---

## Summary

**Key Takeaways:**

1. **MCP servers are configured in `.mcp.json`** (not in `settings.json`)
2. **Three transport types:** HTTP (recommended), SSE (deprecated), stdio (local)
3. **Environment variables** support `${VAR}` and `${VAR:-default}` syntax
4. **`${CLAUDE_PLUGIN_ROOT}`** is available for plugin-relative paths
5. **Plugin manifest** goes in `.claude-plugin/plugin.json`
6. **Scopes:** local (default), project, user, managed
7. **Use CLI commands** for managing servers: `claude mcp add/list/remove/get`

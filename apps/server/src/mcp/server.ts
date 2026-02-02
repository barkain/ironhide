/**
 * MCP Server instance with stdio transport
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';

/**
 * Server name and version
 */
const SERVER_NAME = 'claude-code-analytics';
const SERVER_VERSION = '0.1.0';

/**
 * Create and configure the MCP server
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register tools
  registerTools(server);

  // Register resources
  registerResources(server);

  console.log(`MCP server created: ${SERVER_NAME} v${SERVER_VERSION}`);

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  console.log('Starting MCP server with stdio transport...');

  await server.connect(transport);

  console.log('MCP server connected and listening');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('MCP server shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('MCP server shutting down...');
    await server.close();
    process.exit(0);
  });
}

/**
 * MCP server singleton instance
 */
let mcpServerInstance: McpServer | null = null;

/**
 * Get or create the MCP server instance
 */
export function getMcpServer(): McpServer {
  if (!mcpServerInstance) {
    mcpServerInstance = createMcpServer();
  }
  return mcpServerInstance;
}

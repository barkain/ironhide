/**
 * MCP Tool registration
 *
 * Simplified to expose only the consolidated get_analytics tool
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  GET_ANALYTICS_NAME,
  GET_ANALYTICS_DESCRIPTION,
  GET_ANALYTICS_INPUT_SCHEMA,
  executeGetAnalytics,
  formatGetAnalyticsOutput,
} from './getAnalytics.js';

/**
 * Register all MCP tools
 */
export function registerTools(server: McpServer): void {
  // get_analytics - consolidated tool for comprehensive session analytics
  server.tool(
    GET_ANALYTICS_NAME,
    GET_ANALYTICS_DESCRIPTION,
    GET_ANALYTICS_INPUT_SCHEMA,
    async (input) => {
      try {
        const result = executeGetAnalytics(input as any);
        const text = formatGetAnalyticsOutput(result);
        return {
          content: [{ type: 'text', text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  console.log('MCP tools registered: 1 tool (get_analytics)');
}

// Export tool implementation
export {
  executeGetAnalytics,
  formatGetAnalyticsOutput,
  type GetAnalyticsOutput,
  type GetAnalyticsInput,
} from './getAnalytics.js';

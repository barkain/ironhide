/**
 * MCP Resource registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getSessionsListResource,
  getCurrentSessionResource,
  getSessionByIdResource,
  listSessionResources,
  SESSIONS_RESOURCE_URI_PREFIX,
} from './sessionsResource.js';
import {
  getCurrentMetricsResource,
  getMetricsByIdResource,
  listMetricsResources,
  METRICS_RESOURCE_URI_PREFIX,
} from './metricsResource.js';

/**
 * Register all MCP resources
 */
export function registerResources(server: McpServer): void {
  // Register resource templates
  server.resource(
    'sessions://list',
    'Session List',
    async () => {
      const resource = getSessionsListResource();
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.content,
          },
        ],
      };
    }
  );

  server.resource(
    'sessions://current',
    'Current Session',
    async () => {
      const resource = getCurrentSessionResource();
      if (!resource) {
        return {
          contents: [
            {
              uri: 'sessions://current',
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'No current session' }),
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.content,
          },
        ],
      };
    }
  );

  server.resource(
    'metrics://current',
    'Current Metrics',
    async () => {
      const resource = getCurrentMetricsResource();
      if (!resource) {
        return {
          contents: [
            {
              uri: 'metrics://current',
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'No current session' }),
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.content,
          },
        ],
      };
    }
  );

  console.log('MCP resources registered: 3 templates');
}

/**
 * Resolve a resource URI to its content
 */
export function resolveResource(uri: string): {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
} | null {
  // Handle sessions resources
  if (uri.startsWith(SESSIONS_RESOURCE_URI_PREFIX)) {
    const path = uri.slice(SESSIONS_RESOURCE_URI_PREFIX.length);

    if (path === 'list') {
      return getSessionsListResource();
    }

    if (path === 'current') {
      return getCurrentSessionResource();
    }

    // Assume it's a session ID
    return getSessionByIdResource(path);
  }

  // Handle metrics resources
  if (uri.startsWith(METRICS_RESOURCE_URI_PREFIX)) {
    const path = uri.slice(METRICS_RESOURCE_URI_PREFIX.length);

    if (path === 'current') {
      return getCurrentMetricsResource();
    }

    // Assume it's a session ID
    return getMetricsByIdResource(path);
  }

  return null;
}

/**
 * List all available resources
 */
export function listAllResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  return [...listSessionResources(), ...listMetricsResources()];
}

// Export resource implementations
export {
  getSessionsListResource,
  getCurrentSessionResource,
  getSessionByIdResource,
  listSessionResources,
} from './sessionsResource.js';
export {
  getCurrentMetricsResource,
  getMetricsByIdResource,
  listMetricsResources,
} from './metricsResource.js';

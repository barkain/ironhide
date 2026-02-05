import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCurrency, formatCompactNumber } from '../../lib/utils';
import type { SubagentSummary } from '../../types';

// ============================================================================
// Types
// ============================================================================

interface SubagentSankeyChartProps {
  subagents: SubagentSummary[];
  sessionCost: number;
  isLoading?: boolean;
  onSubagentClick?: (agentId: string) => void;
}

interface SankeyNodeData {
  id: string;
  name: string;
  type: 'source' | 'agent' | 'tool';
  value: number;
  tokens?: number;
  cost?: number;
  color: string;
}

interface SankeyLinkData {
  source: number;
  target: number;
  value: number;
}

type SankeyNodeExtended = SankeyNode<SankeyNodeData, SankeyLinkData>;
type SankeyLinkExtended = SankeyLink<SankeyNodeData, SankeyLinkData>;

// ============================================================================
// Colors
// ============================================================================

// Color scheme for different agent types based on slug/id patterns
const AGENT_COLORS: Record<string, string> = {
  'codebase-context-analyzer': '#3b82f6',  // Blue
  'tech-lead-architect': '#8b5cf6',        // Violet
  'task-completion-verifier': '#10b981',   // Emerald
  'code-cleanup-optimizer': '#f59e0b',     // Amber
  'code-reviewer': '#ef4444',              // Red
  'devops-experience-architect': '#06b6d4', // Cyan
  'documentation-expert': '#ec4899',       // Pink
  'dependency-manager': '#84cc16',         // Lime
  'task-decomposer': '#f97316',            // Orange
  'delegation-orchestrator': '#6366f1',    // Indigo
};

const TOOL_COLORS: Record<string, string> = {
  Bash: '#3b82f6',
  Read: '#10b981',
  Write: '#f59e0b',
  Edit: '#ef4444',
  Grep: '#8b5cf6',
  Glob: '#ec4899',
  Task: '#06b6d4',
  WebFetch: '#84cc16',
  WebSearch: '#f97316',
};

const FALLBACK_COLORS = [
  '#64748b', '#78716c', '#737373', '#71717a', '#a1a1aa',
  '#94a3b8', '#a8a29e', '#a3a3a3', '#a1a1aa', '#d4d4d8',
];

function getAgentColor(agentId: string, slug: string | null, index: number): string {
  // Try to match by slug first
  if (slug && AGENT_COLORS[slug]) {
    return AGENT_COLORS[slug];
  }

  // Try to match by id patterns
  for (const [pattern, color] of Object.entries(AGENT_COLORS)) {
    if (agentId.toLowerCase().includes(pattern)) {
      return color;
    }
  }

  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function getToolColor(toolName: string, index: number): string {
  return TOOL_COLORS[toolName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ============================================================================
// Component
// ============================================================================

export function SubagentSankeyChart({
  subagents,
  sessionCost,
  isLoading,
  onSubagentClick
}: SubagentSankeyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    x: number;
    y: number;
    content: React.ReactNode;
  } | null>(null);

  // Resize observer for responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(400, width - 32), // Account for padding
          height: Math.max(250, height - 16),
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Build Sankey data structure
  const sankeyData = useMemo(() => {
    if (!subagents || subagents.length === 0) {
      return null;
    }

    const nodes: SankeyNodeData[] = [];
    const links: SankeyLinkData[] = [];
    const nodeIndexMap = new Map<string, number>();

    // Calculate total tokens across subagents
    const totalTokens = subagents.reduce((sum, s) => sum + s.total_tokens, 0);

    // Source node: Main Session
    nodes.push({
      id: 'main-session',
      name: 'Main Session',
      type: 'source',
      value: sessionCost,
      cost: sessionCost,
      tokens: totalTokens,
      color: '#a855f7', // Violet
    });
    nodeIndexMap.set('main-session', 0);

    // Agent nodes
    subagents.forEach((agent, idx) => {
      const nodeId = `agent-${agent.agent_id}`;
      const displayName = agent.slug || extractAgentName(agent.agent_id);

      nodes.push({
        id: nodeId,
        name: displayName,
        type: 'agent',
        value: agent.total_cost || 0.01, // Ensure non-zero for visibility
        cost: agent.total_cost,
        tokens: agent.total_tokens,
        color: getAgentColor(agent.agent_id, agent.slug, idx),
      });
      nodeIndexMap.set(nodeId, nodes.length - 1);

      // Link from main session to agent
      links.push({
        source: 0, // Main session
        target: nodes.length - 1,
        value: agent.total_cost || 0.01,
      });
    });

    // Collect all unique tools across all subagents
    const toolMap = new Map<string, { count: number; agents: Set<string> }>();

    subagents.forEach((agent) => {
      agent.tools_used.forEach((tool) => {
        if (!toolMap.has(tool)) {
          toolMap.set(tool, { count: 0, agents: new Set() });
        }
        const entry = toolMap.get(tool)!;
        entry.count++;
        entry.agents.add(agent.agent_id);
      });
    });

    // Tool nodes (right side)
    const toolEntries = Array.from(toolMap.entries()).sort((a, b) => b[1].count - a[1].count);
    let toolIdx = 0;

    toolEntries.forEach(([toolName, { agents }]) => {
      const nodeId = `tool-${toolName}`;

      nodes.push({
        id: nodeId,
        name: toolName,
        type: 'tool',
        value: agents.size * 0.5, // Value based on how many agents use it
        color: getToolColor(toolName, toolIdx++),
      });
      nodeIndexMap.set(nodeId, nodes.length - 1);

      // Links from agents to tools
      subagents.forEach((agent) => {
        if (agent.tools_used.includes(toolName)) {
          const agentNodeIdx = nodeIndexMap.get(`agent-${agent.agent_id}`);
          if (agentNodeIdx !== undefined) {
            links.push({
              source: agentNodeIdx,
              target: nodes.length - 1,
              value: 0.3, // Fixed value for tool usage links
            });
          }
        }
      });
    });

    return { nodes, links };
  }, [subagents, sessionCost]);

  // Generate Sankey layout
  const sankeyLayout = useMemo(() => {
    if (!sankeyData) return null;

    const margin = { top: 20, right: 120, bottom: 20, left: 20 };
    const innerWidth = dimensions.width - margin.left - margin.right;
    const innerHeight = dimensions.height - margin.top - margin.bottom;

    const sankeyGenerator = sankey<SankeyNodeData, SankeyLinkData>()
      .nodeId((d) => d.id)
      .nodeWidth(20)
      .nodePadding(12)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    try {
      const layout = sankeyGenerator({
        nodes: sankeyData.nodes.map((d) => ({ ...d })),
        links: sankeyData.links.map((d) => ({ ...d })),
      });

      return {
        nodes: layout.nodes as SankeyNodeExtended[],
        links: layout.links as SankeyLinkExtended[],
        margin,
      };
    } catch {
      console.error('Failed to generate Sankey layout');
      return null;
    }
  }, [sankeyData, dimensions]);

  const handleNodeMouseEnter = useCallback((
    event: React.MouseEvent,
    node: SankeyNodeExtended
  ) => {
    setHoveredNode(node.id);
    const rect = (event.target as Element).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (containerRect) {
      setTooltipData({
        x: rect.right - containerRect.left + 10,
        y: rect.top - containerRect.top + (rect.height / 2),
        content: (
          <div className="space-y-1">
            <div className="font-semibold text-white">{node.name}</div>
            {node.type === 'agent' && (
              <>
                <div className="text-sm text-gray-300">
                  Cost: <span className="text-white">{formatCurrency(node.cost || 0)}</span>
                </div>
                <div className="text-sm text-gray-300">
                  Tokens: <span className="text-white">{formatCompactNumber(node.tokens || 0)}</span>
                </div>
              </>
            )}
            {node.type === 'source' && (
              <>
                <div className="text-sm text-gray-300">
                  Total Cost: <span className="text-white">{formatCurrency(node.cost || 0)}</span>
                </div>
                <div className="text-sm text-gray-300">
                  Subagents: <span className="text-white">{subagents.length}</span>
                </div>
              </>
            )}
            {node.type === 'tool' && (
              <div className="text-sm text-gray-300">
                Used by {Math.round(node.value! / 0.5)} agent(s)
              </div>
            )}
          </div>
        ),
      });
    }
  }, [subagents.length]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    setTooltipData(null);
  }, []);

  const handleNodeClick = useCallback((node: SankeyNodeExtended) => {
    if (node.type === 'agent' && onSubagentClick) {
      // Extract the agent_id from the node id (remove 'agent-' prefix)
      const agentId = node.id.replace('agent-', '');
      onSubagentClick(agentId);
    }
  }, [onSubagentClick]);

  // Loading state
  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <CardTitle>Subagent Flow</CardTitle>
        </CardHeader>
        <CardContent className="flex h-72 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!subagents || subagents.length === 0) {
    return (
      <Card className="h-96">
        <CardHeader>
          <CardTitle>Subagent Flow</CardTitle>
        </CardHeader>
        <CardContent className="flex h-72 items-center justify-center">
          <div className="text-center">
            <div className="text-gray-500 mb-2">No subagents in this session</div>
            <div className="text-sm text-gray-600">
              Subagent delegations will appear here when used
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render error fallback
  if (!sankeyLayout) {
    return (
      <Card className="h-96">
        <CardHeader>
          <CardTitle>Subagent Flow</CardTitle>
        </CardHeader>
        <CardContent className="flex h-72 items-center justify-center">
          <div className="text-gray-500">Failed to generate flow diagram</div>
        </CardContent>
      </Card>
    );
  }

  const { nodes, links, margin } = sankeyLayout;

  return (
    <Card className="h-96">
      <CardHeader className="pb-2">
        <CardTitle>Subagent Flow</CardTitle>
      </CardHeader>
      <CardContent className="h-72 relative">
        <div ref={containerRef} className="w-full h-full">
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="overflow-visible"
        >
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Links */}
            <g className="links">
              {links.map((link, idx) => {
                const sourceNode = link.source as SankeyNodeExtended;
                const targetNode = link.target as SankeyNodeExtended;
                const isHighlighted =
                  hoveredLink === idx ||
                  hoveredNode === sourceNode.id ||
                  hoveredNode === targetNode.id;

                return (
                  <path
                    key={`link-${idx}`}
                    d={sankeyLinkHorizontal()(link as unknown as SankeyLink<SankeyNodeData, SankeyLinkData>) || ''}
                    fill="none"
                    stroke={sourceNode.color}
                    strokeWidth={Math.max(1, link.width || 1)}
                    strokeOpacity={isHighlighted ? 0.8 : 0.3}
                    onMouseEnter={() => setHoveredLink(idx)}
                    onMouseLeave={() => setHoveredLink(null)}
                    style={{
                      transition: 'stroke-opacity 0.2s ease',
                    }}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {nodes.map((node) => {
                const isHighlighted = hoveredNode === node.id;
                const nodeHeight = (node.y1 || 0) - (node.y0 || 0);
                const nodeWidth = (node.x1 || 0) - (node.x0 || 0);

                return (
                  <g
                    key={`node-${node.id}`}
                    transform={`translate(${node.x0}, ${node.y0})`}
                    onMouseEnter={(e) => handleNodeMouseEnter(e, node)}
                    onMouseLeave={handleNodeMouseLeave}
                    onClick={() => handleNodeClick(node)}
                    style={{
                      cursor: node.type === 'agent' && onSubagentClick ? 'pointer' : 'default'
                    }}
                  >
                    {/* Node rectangle */}
                    <rect
                      width={nodeWidth}
                      height={nodeHeight}
                      fill={node.color}
                      fillOpacity={isHighlighted ? 1 : 0.85}
                      stroke={isHighlighted ? '#fff' : 'none'}
                      strokeWidth={2}
                      rx={3}
                      ry={3}
                      style={{
                        transition: 'fill-opacity 0.2s ease, stroke 0.2s ease',
                        filter: isHighlighted ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none',
                      }}
                    />

                    {/* Node label */}
                    <text
                      x={node.type === 'tool' ? nodeWidth + 6 : -6}
                      y={nodeHeight / 2}
                      dy="0.35em"
                      textAnchor={node.type === 'tool' ? 'start' : 'end'}
                      fill="#e5e7eb"
                      fontSize={11}
                      fontWeight={isHighlighted ? 600 : 400}
                      style={{
                        transition: 'font-weight 0.2s ease',
                      }}
                    >
                      {truncateLabel(node.name, 18)}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="absolute z-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg pointer-events-none"
            style={{
              left: tooltipData.x,
              top: tooltipData.y,
              transform: 'translateY(-50%)',
            }}
          >
            {tooltipData.content}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 right-2 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-violet-500" />
            <span className="text-gray-400">Session</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span className="text-gray-400">Agents</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span className="text-gray-400">Tools</span>
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function extractAgentName(agentId: string): string {
  // Try to extract a readable name from the agent ID
  // Format might be like "agent-abc123" or "codebase-context-analyzer-xyz"

  // Remove common prefixes
  let name = agentId.replace(/^(agent-|subagent-)/i, '');

  // If it looks like a UUID, truncate it
  if (/^[a-f0-9-]{20,}$/i.test(name)) {
    return `Agent ${name.substring(0, 8)}...`;
  }

  // Convert kebab-case to title case
  name = name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return name || 'Unknown Agent';
}

function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 3) + '...';
}

// Export for use in other components
export type { SubagentSankeyChartProps };

import { useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format,
  parseISO,
  differenceInMilliseconds,
  addDays,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  eachMonthOfInterval,
  differenceInDays,
} from 'date-fns';
import { formatCurrency, formatDuration, getProjectDisplayName } from '../../lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface GanttSession {
  id: string;
  project_name: string;
  project_path: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  model: string | null;
  total_cost: number;
  total_turns: number;
  is_subagent: boolean;
}

interface ProjectLane {
  project_name: string;
  project_path: string;
  sessions: GanttSession[];
  lanes: GanttSession[][]; // sessions grouped into non-overlapping lanes
  color: string;
}

interface TooltipData {
  session: GanttSession;
  x: number;
  y: number;
}

// ============================================================================
// Constants
// ============================================================================

const LABEL_WIDTH = 240;
const LANE_HEIGHT = 24;
const LANE_GAP = 4;
const PROJECT_GAP = 8;
const HEADER_HEIGHT = 40;
const BAR_RADIUS = 4;
const MIN_BAR_WIDTH = 6;
const PADDING_X = 16;
const PADDING_Y = 8;
const MAX_VISIBLE_LANES = 10; // Cap lanes to prevent row overflow

// ============================================================================
// Helpers
// ============================================================================

/**
 * Hash a string to produce a consistent HSL color.
 * Uses a simple djb2 hash for deterministic output.
 */
function hashStringToColor(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Extract a readable, disambiguated project name from a project path.
 * Delegates to the shared utility which strips the /Users/<username>/ prefix.
 */
function extractDisplayName(projectPath: string): string {
  return getProjectDisplayName(projectPath);
}

/**
 * Detect overlapping sessions and assign them to lanes so no two
 * sessions in the same lane overlap in time.
 */
function assignLanes(sessions: GanttSession[]): GanttSession[][] {
  if (sessions.length === 0) return [];

  // Sort by start time
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  const lanes: GanttSession[][] = [];

  for (const session of sorted) {
    const sessionStart = new Date(session.started_at).getTime();

    // Find the first lane where this session does not overlap
    let placed = false;
    for (const lane of lanes) {
      const lastInLane = lane[lane.length - 1];
      const lastEnd = lastInLane.ended_at
        ? new Date(lastInLane.ended_at).getTime()
        : new Date(lastInLane.started_at).getTime() + lastInLane.duration_ms;

      if (sessionStart >= lastEnd) {
        lane.push(session);
        placed = true;
        break;
      }
    }

    if (!placed) {
      lanes.push([session]);
    }
  }

  return lanes;
}

/**
 * Choose tick granularity based on the date range span.
 * Produces frequent, evenly-spaced ticks for readability.
 */
function getTickDates(minDate: Date, maxDate: Date): { dates: Date[]; formatStr: string } {
  const totalDays = differenceInDays(maxDate, minDate);

  if (totalDays <= 7) {
    // Daily ticks
    return {
      dates: eachDayOfInterval({ start: minDate, end: maxDate }),
      formatStr: 'MMM d',
    };
  } else if (totalDays <= 21) {
    // Every 2 days
    const dates: Date[] = [];
    let current = startOfDay(minDate);
    while (current <= maxDate) {
      dates.push(current);
      current = addDays(current, 2);
    }
    return { dates, formatStr: 'MMM d' };
  } else if (totalDays <= 45) {
    // Every 3 days
    const dates: Date[] = [];
    let current = startOfDay(minDate);
    while (current <= maxDate) {
      dates.push(current);
      current = addDays(current, 3);
    }
    return { dates, formatStr: 'MMM d' };
  } else if (totalDays <= 90) {
    // Every 5 days
    const dates: Date[] = [];
    let current = startOfDay(minDate);
    while (current <= maxDate) {
      dates.push(current);
      current = addDays(current, 5);
    }
    return { dates, formatStr: 'MMM d' };
  } else {
    // Monthly ticks
    return {
      dates: eachMonthOfInterval({ start: minDate, end: maxDate }),
      formatStr: 'MMM yyyy',
    };
  }
}

/**
 * Truncate a string to fit within a character limit, adding ellipsis if needed.
 */
function truncateLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return name.slice(0, maxChars - 1) + '\u2026'; // unicode ellipsis
}

// ============================================================================
// Component
// ============================================================================

interface GanttChartProps {
  sessions: GanttSession[];
  className?: string;
}

export function GanttChart({ sessions, className }: GanttChartProps) {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  // Group sessions by project_path (not project_name) to consolidate
  // subagent sessions with their parent project
  const projectLanes = useMemo<ProjectLane[]>(() => {
    const byProject = new Map<string, GanttSession[]>();

    for (const session of sessions) {
      // Group by project_path to ensure sessions in the same directory
      // are consolidated into one row, even if project_name differs
      const key = session.project_path || session.project_name || 'Unknown';
      if (!byProject.has(key)) {
        byProject.set(key, []);
      }
      byProject.get(key)!.push(session);
    }

    // Sort projects by most recent activity (descending)
    const entries = Array.from(byProject.entries()).sort((a, b) => {
      const latestA = Math.max(
        ...a[1].map((s) => new Date(s.started_at).getTime())
      );
      const latestB = Math.max(
        ...b[1].map((s) => new Date(s.started_at).getTime())
      );
      return latestB - latestA;
    });

    return entries.map(([projectKey, projectSessions]) => {
      // Use the project_path to derive a readable display name
      const displayName = extractDisplayName(projectKey);
      return {
        project_name: displayName,
        project_path: projectKey,
        sessions: projectSessions,
        lanes: assignLanes(projectSessions),
        color: hashStringToColor(displayName),
      };
    });
  }, [sessions]);

  // Compute time range
  const { minDate, maxDate } = useMemo(() => {
    if (sessions.length === 0) {
      const now = new Date();
      return { minDate: addDays(now, -7), maxDate: now };
    }

    let minMs = Infinity;
    let maxMs = -Infinity;

    for (const session of sessions) {
      const startMs = new Date(session.started_at).getTime();
      // Prefer duration_ms over ended_at since ended_at is often == started_at (DB bug)
      const endMs = session.duration_ms > 0
        ? startMs + session.duration_ms
        : session.ended_at
          ? Math.max(new Date(session.ended_at).getTime(), startMs + 60000)
          : startMs + 60000;

      if (startMs < minMs) minMs = startMs;
      if (endMs > maxMs) maxMs = endMs;
    }

    // Add some padding
    const padding = (maxMs - minMs) * 0.02;
    return {
      minDate: startOfDay(new Date(minMs - padding)),
      maxDate: endOfDay(new Date(maxMs + padding)),
    };
  }, [sessions]);

  // Compute chart dimensions with capped lane heights
  const { chartWidth, chartHeight, projectYOffsets } = useMemo(() => {
    // Calculate total height from project lanes
    let currentY = HEADER_HEIGHT + PADDING_Y;
    const offsets: { y: number; height: number; visibleLanes: number; totalLanes: number }[] = [];

    for (const project of projectLanes) {
      const totalLanes = project.lanes.length;
      // Cap the visible lanes to prevent enormous rows
      const visibleLanes = Math.min(Math.max(totalLanes, 1), MAX_VISIBLE_LANES);
      const projectHeight = visibleLanes * LANE_HEIGHT + (visibleLanes - 1) * LANE_GAP;
      offsets.push({ y: currentY, height: projectHeight, visibleLanes, totalLanes });
      currentY += projectHeight + PROJECT_GAP;
    }

    return {
      chartWidth: 1200, // will be responsive via viewBox
      chartHeight: currentY + PADDING_Y,
      projectYOffsets: offsets,
    };
  }, [projectLanes]);

  // Tick marks
  const { dates: tickDates, formatStr: tickFormat } = useMemo(
    () => getTickDates(minDate, maxDate),
    [minDate, maxDate]
  );

  // X scale function
  const xScale = useCallback(
    (date: Date): number => {
      const totalMs = differenceInMilliseconds(maxDate, minDate);
      if (totalMs === 0) return LABEL_WIDTH + PADDING_X;
      const chartAreaWidth = chartWidth - LABEL_WIDTH - PADDING_X * 2;
      const elapsed = differenceInMilliseconds(date, minDate);
      return LABEL_WIDTH + PADDING_X + (elapsed / totalMs) * chartAreaWidth;
    },
    [minDate, maxDate, chartWidth]
  );

  // Event handlers
  const handleBarMouseEnter = useCallback(
    (session: GanttSession, event: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgWidth = rect.width;
      const scaleRatio = svgWidth / chartWidth;

      setTooltip({
        session,
        x: event.clientX - rect.left,
        y: (event.clientY - rect.top) / scaleRatio,
      });
      setHoveredSessionId(session.id);
    },
    [chartWidth]
  );

  const handleBarMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredSessionId(null);
  }, []);

  const handleBarClick = useCallback(
    (session: GanttSession) => {
      navigate(`/sessions/${session.id}`);
    },
    [navigate]
  );

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto"
        style={{ minHeight: Math.min(chartHeight, 600) }}
      >
        {/* Background */}
        <rect width={chartWidth} height={chartHeight} fill="transparent" />

        {/* Grid lines - vertical (time ticks) */}
        {tickDates.map((date, i) => {
          const x = xScale(date);
          return (
            <g key={i}>
              <line
                x1={x}
                y1={HEADER_HEIGHT}
                x2={x}
                y2={chartHeight - PADDING_Y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={x}
                y={HEADER_HEIGHT - 10}
                textAnchor="middle"
                fill="var(--color-text-secondary)"
                fontSize={13}
                fontWeight={600}
                fontFamily="system-ui, sans-serif"
              >
                {format(date, tickFormat)}
              </text>
            </g>
          );
        })}

        {/* Horizontal separator between header and chart area */}
        <line
          x1={0}
          y1={HEADER_HEIGHT}
          x2={chartWidth}
          y2={HEADER_HEIGHT}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Project rows */}
        {projectLanes.map((project, projectIndex) => {
          const offset = projectYOffsets[projectIndex];
          if (!offset) return null;

          const rowCenterY = offset.y + offset.height / 2;
          const isOverflowing = offset.totalLanes > offset.visibleLanes;

          return (
            <g key={project.project_path}>
              {/* Alternating row background */}
              {projectIndex % 2 === 0 && (
                <rect
                  x={0}
                  y={offset.y - PROJECT_GAP / 2}
                  width={chartWidth}
                  height={offset.height + PROJECT_GAP}
                  fill="rgba(128, 128, 128, 0.05)"
                />
              )}

              {/* Horizontal grid line between projects */}
              {projectIndex > 0 && (
                <line
                  x1={0}
                  y1={offset.y - PROJECT_GAP / 2}
                  x2={chartWidth}
                  y2={offset.y - PROJECT_GAP / 2}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                />
              )}

              {/* Project label */}
              <g>
                {/* Color indicator */}
                <rect
                  x={8}
                  y={rowCenterY - 5}
                  width={10}
                  height={10}
                  rx={2}
                  fill={project.color}
                />
                {/* Project name - properly truncated, no broken clipPath */}
                <text
                  x={24}
                  y={rowCenterY}
                  dominantBaseline="central"
                  fill="var(--color-text-primary)"
                  fontSize={12}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={500}
                >
                  <title>{project.project_path || project.project_name}</title>
                  {truncateLabel(project.project_name, 26)}
                </text>
                {/* Session count badge */}
                <text
                  x={LABEL_WIDTH - 12}
                  y={rowCenterY}
                  dominantBaseline="central"
                  textAnchor="end"
                  fill="var(--color-text-tertiary)"
                  fontSize={10}
                  fontFamily="system-ui, sans-serif"
                >
                  {project.sessions.length}
                  {isOverflowing ? ` (${offset.totalLanes}L)` : ''}
                </text>
              </g>

              {/* Label/chart area separator */}
              <line
                x1={LABEL_WIDTH}
                y1={offset.y - PROJECT_GAP / 2}
                x2={LABEL_WIDTH}
                y2={offset.y + offset.height + PROJECT_GAP / 2}
                stroke="var(--color-border)"
                strokeWidth={0.5}
              />

              {/* Session bars - clip to row area to prevent overflow */}
              <g>
                {project.lanes.map((lane, laneIndex) =>
                  lane.map((session) => {
                    const startDate = parseISO(session.started_at);
                    // Prefer duration_ms over ended_at since ended_at is often == started_at (DB bug)
                    const endDate = session.duration_ms > 0
                      ? new Date(startDate.getTime() + session.duration_ms)
                      : session.ended_at && new Date(session.ended_at).getTime() > startDate.getTime() + 60000
                        ? parseISO(session.ended_at)
                        : new Date(startDate.getTime() + 60000); // fallback 1 min minimum

                    const x1 = xScale(startDate);
                    const x2 = xScale(endDate);
                    const barWidth = Math.max(x2 - x1, MIN_BAR_WIDTH);

                    // For lanes beyond the cap, stack them into the last visible lane
                    const effectiveLaneIndex = Math.min(laneIndex, offset.visibleLanes - 1);
                    const barY =
                      offset.y + effectiveLaneIndex * (LANE_HEIGHT + LANE_GAP);

                    // Don't render bars that would be fully outside the row bounds
                    const rowBottom = offset.y + offset.height;
                    if (barY > rowBottom) return null;

                    const isHovered = hoveredSessionId === session.id;
                    const opacity = hoveredSessionId
                      ? isHovered
                        ? 1
                        : 0.4
                      : laneIndex >= offset.visibleLanes
                        ? 0.6  // Slightly dimmer for overflow lanes stacked together
                        : 0.85;

                    // Reduce bar height slightly for overflow stacked bars
                    const barHeight = laneIndex >= offset.visibleLanes
                      ? LANE_HEIGHT - 2
                      : LANE_HEIGHT;

                    return (
                      <g key={session.id}>
                        <rect
                          x={x1}
                          y={barY}
                          width={barWidth}
                          height={barHeight}
                          rx={BAR_RADIUS}
                          fill={project.color}
                          opacity={opacity}
                          stroke={isHovered ? '#fff' : 'transparent'}
                          strokeWidth={isHovered ? 1.5 : 0}
                          className="cursor-pointer transition-opacity duration-150"
                          onMouseEnter={(e) => handleBarMouseEnter(session, e)}
                          onMouseLeave={handleBarMouseLeave}
                          onClick={() => handleBarClick(session)}
                        />
                        {/* Subagent indicator - small dot */}
                        {session.is_subagent && barWidth >= MIN_BAR_WIDTH && (
                          <circle
                            cx={x1 + barWidth / 2}
                            cy={barY + barHeight / 2}
                            r={3}
                            fill="rgba(0, 0, 0, 0.5)"
                            stroke="#fff"
                            strokeWidth={1}
                            pointerEvents="none"
                          />
                        )}
                        {/* Inline label for wide enough bars */}
                        {barWidth > 80 && (
                          <text
                            x={x1 + 6}
                            y={barY + barHeight / 2}
                            dominantBaseline="central"
                            fill="rgba(0, 0, 0, 0.7)"
                            fontSize={10}
                            fontFamily="system-ui, sans-serif"
                            fontWeight={600}
                            pointerEvents="none"
                          >
                            {formatCurrency(session.total_cost)}
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </g>
            </g>
          );
        })}

        {/* "Now" indicator line */}
        {(() => {
          const now = new Date();
          if (now >= minDate && now <= maxDate) {
            const nowX = xScale(now);
            return (
              <g>
                <line
                  x1={nowX}
                  y1={HEADER_HEIGHT}
                  x2={nowX}
                  y2={chartHeight - PADDING_Y}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  opacity={0.7}
                />
                <text
                  x={nowX}
                  y={HEADER_HEIGHT - 8}
                  textAnchor="middle"
                  fill="#ef4444"
                  fontSize={10}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={600}
                >
                  Now
                </text>
              </g>
            );
          }
          return null;
        })()}
      </svg>

      {/* Tooltip (rendered outside SVG for rich HTML content) */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl min-w-[240px]">
            <div className="text-sm font-semibold text-white mb-1 truncate max-w-[280px]">
              {extractDisplayName(tooltip.session.project_path) || tooltip.session.project_name}
            </div>
            <div className="text-[10px] text-gray-500 mb-2 truncate max-w-[280px]">
              {tooltip.session.project_path}
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Started:</span>
                <span className="text-white">
                  {format(parseISO(tooltip.session.started_at), 'MMM d, h:mm a')}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Duration:</span>
                <span className="text-white">
                  {formatDuration(tooltip.session.duration_ms / 1000)}
                </span>
              </div>
              {tooltip.session.model && (
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">Model:</span>
                  <span className="text-blue-400 truncate max-w-[140px]">
                    {tooltip.session.model}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Cost:</span>
                <span className="text-white">
                  {formatCurrency(tooltip.session.total_cost)}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Turns:</span>
                <span className="text-white">{tooltip.session.total_turns}</span>
              </div>
              {tooltip.session.is_subagent && (
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">Type:</span>
                  <span className="text-amber-400">Subagent</span>
                </div>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
              <span className="text-[10px] text-gray-500">Click to view session details</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GanttChart;

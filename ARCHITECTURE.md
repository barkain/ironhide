# Claude Code Session Analytics Dashboard - Architecture Document

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Component Architecture](#component-architecture)
5. [Data Flow](#data-flow)
6. [TypeScript Interfaces](#typescript-interfaces)
7. [API Specifications](#api-specifications)
8. [Implementation File Structure](#implementation-file-structure)
9. [Design Decisions](#design-decisions)
10. [Security Considerations](#security-considerations)

---

## Overview

The Claude Code Session Analytics Dashboard is a hybrid plugin architecture combining:

- **MCP Server**: Provides Claude Code integration via Model Context Protocol, exposing session metrics as tools and resources
- **HTTP API Server**: Serves real-time data via SSE (Server-Sent Events) for live dashboard updates
- **React Dashboard**: Interactive shadcn/ui-based interface with Recharts visualizations

### High-Level Architecture Diagram

```
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|   Claude Code    |     |  Analytics Plugin |     |    Dashboard     |
|     Session      |     |                   |     |    (Next.js)     |
|                  |     |  +-------------+  |     |                  |
+--------+---------+     |  | MCP Server  |  |     +--------+---------+
         |               |  +------+------+  |              |
         |  JSONL Logs   |         |         |              |
         +-------------->|  +------+------+  |              |
                         |  | File Watcher|  |              |
                         |  +------+------+  |              |
                         |         |         |              |
                         |  +------+------+  |   SSE        |
                         |  | HTTP Server |<-+------------->|
                         |  +-------------+  |              |
                         |                   |              |
                         +-------------------+              |
                                                            v
                                              +-------------+-------------+
                                              |                           |
                                              |   Time Series Charts      |
                                              |   Turn Summaries          |
                                              |   Efficiency Score        |
                                              |   Cost Analytics          |
                                              |                           |
                                              +---------------------------+
```

---

## Technology Stack

### Core Technologies

| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| **Runtime** | Node.js | ^22.0.0 | Native ESM, fetch, performance |
| **Package Manager** | pnpm | ^9.0.0 | Workspace support, efficient |
| **Language** | TypeScript | ^5.5.0 | Type safety, DX |
| **Build Tool** | Turborepo | ^2.3.0 | Monorepo caching, parallel builds |

### MCP Server

| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| **MCP SDK** | @modelcontextprotocol/sdk | ^1.x | Official TypeScript SDK |
| **HTTP Framework** | Hono | ^4.6.0 | Fast, TypeScript-first, Edge-ready |
| **MCP Middleware** | @modelcontextprotocol/hono | ^1.x | Official Hono adapter |
| **File Watching** | chokidar | ^4.0.0 | Cross-platform, efficient |
| **JSONL Parsing** | readline (built-in) | - | Streaming, memory-efficient |

### Dashboard

| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| **Framework** | Next.js | ^15.0.0 | App Router, RSC, SSE support |
| **React** | React | ^19.0.0 | Concurrent features |
| **UI Components** | shadcn/ui | latest | Customizable, accessible |
| **Charts** | Recharts | ^2.15.0 | shadcn integration, flexible |
| **Styling** | Tailwind CSS | ^4.0.0 | Utility-first, shadcn compatible |
| **State** | Zustand | ^5.0.0 | Lightweight, TypeScript-first |
| **Data Fetching** | TanStack Query | ^5.60.0 | Cache, SSE subscription |

### Shared Libraries

| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| **Validation** | Zod | ^3.24.0 | Runtime validation, inference |
| **Date Handling** | date-fns | ^4.1.0 | Tree-shakeable, immutable |

---

## Project Structure

### Monorepo Layout

```
claude-code-analytics-dashboard/
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml             # pnpm workspace definition
├── turbo.json                      # Turborepo configuration
├── tsconfig.base.json              # Shared TypeScript config
├── .env.example                    # Environment template
│
├── apps/
│   ├── server/                     # MCP + HTTP Server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Entry point
│   │       ├── mcp/                # MCP server implementation
│   │       ├── http/               # HTTP/SSE server
│   │       ├── watcher/            # File system watcher
│   │       ├── parser/             # JSONL parser
│   │       └── metrics/            # Metrics calculator
│   │
│   └── dashboard/                  # Next.js Dashboard
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── components.json         # shadcn config
│       └── src/
│           ├── app/                # App Router pages
│           ├── components/         # React components
│           ├── hooks/              # Custom hooks
│           ├── lib/                # Utilities
│           └── stores/             # Zustand stores
│
└── packages/
    ├── shared/                     # Shared types & utilities
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── types/              # TypeScript interfaces
    │       ├── schemas/            # Zod schemas
    │       ├── pricing/            # Token pricing logic
    │       └── utils/              # Shared utilities
    │
    └── ui/                         # Shared UI components (optional)
        ├── package.json
        └── src/
```

---

## Component Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           apps/server                                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         MCP Server Layer                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │   Tools     │  │  Resources  │  │   Prompts   │  │  Transport  │   │  │
│  │  │             │  │             │  │             │  │   (stdio)   │   │  │
│  │  │ getSession  │  │ sessions:// │  │ summarize   │  │             │   │  │
│  │  │ getMetrics  │  │ metrics://  │  │ analyze     │  │             │   │  │
│  │  │ listTurns   │  │             │  │             │  │             │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Core Services                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │  SessionStore   │  │  MetricsCalc    │  │   EventEmitter      │    │  │
│  │  │                 │  │                 │  │                     │    │  │
│  │  │ - sessions[]    │  │ - tokenCost()   │  │ - session:update    │    │  │
│  │  │ - turns[]       │  │ - efficiency()  │  │ - turn:new          │    │  │
│  │  │ - currentId     │  │ - codeMetrics() │  │ - metrics:change    │    │  │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘    │  │
│  │           │                    │                      │               │  │
│  └───────────┼────────────────────┼──────────────────────┼───────────────┘  │
│              │                    │                      │                   │
│              ▼                    ▼                      ▼                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Data Layer                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │  JSONLParser    │  │  FileWatcher    │  │    PricingDB        │    │  │
│  │  │                 │  │   (chokidar)    │  │                     │    │  │
│  │  │ - parseEntry()  │  │ - watch()       │  │ - getModelPrice()   │    │  │
│  │  │ - parseTurn()   │  │ - onChange()    │  │ - calculateCost()   │    │  │
│  │  │ - parseUsage()  │  │ - getNew()      │  │                     │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         HTTP Server Layer                              │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │   REST API      │  │   SSE Handler   │  │   CORS/Auth         │    │  │
│  │  │                 │  │                 │  │                     │    │  │
│  │  │ GET /sessions   │  │ GET /sse        │  │ - localhost only    │    │  │
│  │  │ GET /metrics    │  │ - heartbeat     │  │ - origin check      │    │  │
│  │  │ GET /turns/:id  │  │ - push events   │  │                     │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           apps/dashboard                                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Page Components                                │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │   DashboardPage │  │  SessionPage    │  │   SettingsPage      │    │  │
│  │  │   (/)           │  │  (/session/:id) │  │   (/settings)       │    │  │
│  │  └────────┬────────┘  └────────┬────────┘  └─────────────────────┘    │  │
│  │           │                    │                                       │  │
│  └───────────┼────────────────────┼───────────────────────────────────────┘  │
│              ▼                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Feature Components                             │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │ TokenUsageChart │  │ TurnSummaryTable│  │  CostDisplay        │    │  │
│  │  │ (Recharts Area) │  │  (DataTable)    │  │                     │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │ ContextGauge    │  │ EfficiencyScore │  │  CodeChangesChart   │    │  │
│  │  │ (RadialBar)     │  │  (Progress)     │  │  (BarChart)         │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Data Hooks                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │ useSessionData  │  │ useSSESubscribe │  │   useMetrics        │    │  │
│  │  │ (TanStack Query)│  │ (EventSource)   │  │                     │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         State Management                               │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      Zustand Store                               │  │  │
│  │  │  - sessions[]    - currentSessionId    - settings               │  │  │
│  │  │  - turns[]       - realTimeEnabled     - selectedTimeRange      │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### JSONL to Dashboard Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Flow Pipeline                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. SOURCE: Claude Code Session Logs
   ~/.claude/projects/{project-hash}/{session-uuid}.jsonl

   ┌─────────────────────────────────────────────────────────────────────────┐
   │  {"uuid":"abc-123","timestamp":"2026-02-01T10:00:00Z","message":{...}}  │
   │  {"uuid":"def-456","timestamp":"2026-02-01T10:00:05Z","message":{...}}  │
   └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
2. FILE WATCHER (chokidar)
   - Watches Claude session JSONL files in ~/.claude/projects
   - Detects: add, change, unlink events
   - Emits: { event: 'change', path: string, stat: Stats }

                                      │
                                      ▼
3. JSONL PARSER (streaming readline)
   - Reads new lines from changed files
   - Maintains byte offset per file for incremental reads
   - Parses JSON, validates with Zod schemas

   ┌─────────────────────────────────────────────────────────────────────────┐
   │  RawJSONLEntry -> ParsedEntry -> ValidatedEntry                         │
   └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
4. TURN AGGREGATOR
   - Groups entries by turn (user message -> assistant response cycle)
   - Associates tool_use with tool_result entries
   - Calculates turn boundaries via timestamp gaps + role changes

   ┌─────────────────────────────────────────────────────────────────────────┐
   │  Turn { id, startTime, endTime, userMessage, assistantMessage,          │
   │         toolUses[], usage, codeChanges }                                 │
   └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
5. METRICS CALCULATOR
   - Token counts: input, output, cache_creation, cache_read
   - Cost calculation: tokens * model_price
   - Duration: endTime - startTime
   - Code metrics: files created, deleted, lines changed
   - Context usage: (input_tokens / max_context) * 100

   ┌─────────────────────────────────────────────────────────────────────────┐
   │  TurnMetrics { turnId, tokens, cost, duration, contextPct, codeChanges }│
   └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
6. SESSION STORE (in-memory)
   - Indexed by sessionId
   - Maintains turn history with computed metrics
   - Calculates session aggregates (totals, averages, efficiency)

                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
7a. MCP TOOLS/RESOURCES              7b. HTTP API + SSE

   MCP Transport (stdio)                 Hono HTTP Server
   - Tool: getSessionMetrics             - GET /api/sessions
   - Tool: getTurnDetails                - GET /api/sessions/:id/metrics
   - Resource: sessions://list           - GET /api/sessions/:id/turns
   - Resource: metrics://current         - GET /api/sse (EventSource)

                          │                       │
                          ▼                       ▼
8. CONSUMERS

   Claude Code                           Dashboard (Next.js)
   (via MCP client)                      (via fetch + EventSource)
```

### SSE Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SSE Event Types                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Client connects: GET /api/sse?sessionId=abc-123
                              │
                              ▼
Server establishes connection with headers:
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  event: connected                                                            │
│  data: {"sessionId":"abc-123","timestamp":"2026-02-01T10:00:00Z"}           │
│                                                                              │
│  event: session                                                              │
│  data: {"type":"snapshot","session":{...},"turns":[...],"metrics":{...}}    │
│                                                                              │
│  event: turn                                                                 │
│  data: {"type":"new","turn":{...},"metrics":{...}}                          │
│                                                                              │
│  event: turn                                                                 │
│  data: {"type":"update","turn":{...},"metrics":{...}}                       │
│                                                                              │
│  event: metrics                                                              │
│  data: {"type":"aggregate","sessionMetrics":{...}}                          │
│                                                                              │
│  event: heartbeat                                                            │
│  data: {"timestamp":"2026-02-01T10:01:00Z"}                                 │
│                                                                              │
│  (repeat every 30 seconds if no other events)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## TypeScript Interfaces

### JSONL Entry Types (packages/shared/src/types/jsonl.ts)

```typescript
/**
 * Raw JSONL entry as read from Claude Code session logs
 * Location: ~/.claude/projects/{project-hash}/{session-uuid}.jsonl
 */
export interface RawJSONLEntry {
  /** Unique identifier for this entry */
  uuid: string;

  /** Parent entry UUID for threading */
  parentUuid: string | null;

  /** Session identifier */
  sessionId: string;

  /** Log format version */
  version: string;

  /** Git branch at time of entry */
  gitBranch: string | null;

  /** Working directory */
  cwd: string;

  /** ISO-8601 timestamp */
  timestamp: string;

  /** Message content */
  message: RawMessage;

  /** Tool use result (when entry is tool response) */
  toolUseResult?: ToolUseResult;
}

export interface RawMessage {
  /** Message role */
  role: 'user' | 'assistant';

  /** Content blocks */
  content: ContentBlock[];

  /** Token usage metrics (only on assistant messages) */
  usage?: TokenUsage;

  /** Model identifier */
  model?: string;

  /** Stop reason */
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

export type ContentBlock =
  | TextContent
  | ToolUseContent
  | ToolResultContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ToolUseResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TokenUsage {
  /** Input tokens consumed */
  input_tokens: number;

  /** Output tokens generated */
  output_tokens: number;

  /** Tokens used to create cache */
  cache_creation_input_tokens: number;

  /** Tokens read from cache */
  cache_read_input_tokens: number;
}
```

### Parsed/Validated Types (packages/shared/src/types/session.ts)

```typescript
/**
 * Represents a complete Claude Code session
 */
export interface Session {
  /** Unique session identifier */
  id: string;

  /** Project path (hashed in filesystem) */
  projectPath: string;

  /** Project display name (from cwd) */
  projectName: string;

  /** Git branch */
  branch: string | null;

  /** Session start time */
  startedAt: Date;

  /** Session last activity time */
  lastActivityAt: Date;

  /** Model used in session */
  model: string;

  /** Number of turns in session */
  turnCount: number;

  /** Whether session is currently active (recent activity) */
  isActive: boolean;
}

/**
 * Represents a single turn (user prompt + assistant response cycle)
 */
export interface Turn {
  /** Unique turn identifier */
  id: string;

  /** Parent session ID */
  sessionId: string;

  /** Turn sequence number within session */
  turnNumber: number;

  /** Turn start timestamp */
  startedAt: Date;

  /** Turn end timestamp */
  endedAt: Date;

  /** Duration in milliseconds */
  durationMs: number;

  /** User message content (text only) */
  userMessage: string;

  /** Assistant response (text only, tools excluded) */
  assistantMessage: string;

  /** Token usage for this turn */
  usage: TokenUsage;

  /** Tool uses within this turn */
  toolUses: ToolUse[];

  /** Code changes made in this turn */
  codeChanges: CodeChange[];

  /** Model used for this turn */
  model: string;
}

/**
 * Tool invocation record
 */
export interface ToolUse {
  /** Tool use ID */
  id: string;

  /** Tool name (e.g., 'Read', 'Write', 'Bash') */
  name: string;

  /** Tool input parameters */
  input: Record<string, unknown>;

  /** Tool result */
  result?: string;

  /** Whether tool execution errored */
  isError: boolean;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Code change record (from Write, Edit, MultiEdit tools)
 */
export interface CodeChange {
  /** File path */
  filePath: string;

  /** Change type */
  type: 'create' | 'modify' | 'delete';

  /** Lines added (positive) */
  linesAdded: number;

  /** Lines removed (positive) */
  linesRemoved: number;

  /** File extension */
  extension: string;
}
```

### Metrics Types (packages/shared/src/types/metrics.ts)

```typescript
/**
 * Metrics for a single turn
 */
export interface TurnMetrics {
  /** Turn ID */
  turnId: string;

  /** Turn number in session */
  turnNumber: number;

  /** Timestamp for time series */
  timestamp: Date;

  /** Token metrics */
  tokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
    total: number;
  };

  /** Cost in USD */
  cost: {
    input: number;
    output: number;
    cacheCreation: number;
    total: number;
  };

  /** Duration in milliseconds */
  durationMs: number;

  /** Context window usage percentage (0-100) */
  contextUsagePercent: number;

  /** Number of tools used */
  toolCount: number;

  /** Tool breakdown by name */
  toolBreakdown: Record<string, number>;

  /** Code change metrics */
  codeMetrics: {
    filesCreated: number;
    filesModified: number;
    filesDeleted: number;
    linesAdded: number;
    linesRemoved: number;
    netLinesChanged: number;
  };
}

/**
 * Aggregated metrics for a session
 */
export interface SessionMetrics {
  /** Session ID */
  sessionId: string;

  /** Total turns */
  totalTurns: number;

  /** Session duration in milliseconds */
  totalDurationMs: number;

  /** Token totals */
  totalTokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
    total: number;
  };

  /** Total cost in USD */
  totalCost: number;

  /** Cost breakdown by category */
  costBreakdown: {
    input: number;
    output: number;
    cacheCreation: number;
  };

  /** Average metrics per turn */
  averages: {
    tokensPerTurn: number;
    costPerTurn: number;
    durationMsPerTurn: number;
    contextUsagePercent: number;
  };

  /** Peak values */
  peaks: {
    maxTokensInTurn: number;
    maxCostInTurn: number;
    maxDurationMs: number;
    maxContextUsagePercent: number;
  };

  /** Total code changes */
  totalCodeChanges: {
    filesCreated: number;
    filesModified: number;
    filesDeleted: number;
    linesAdded: number;
    linesRemoved: number;
    netLinesChanged: number;
  };

  /** Tool usage totals */
  totalToolUses: number;

  /** Tool breakdown */
  toolBreakdown: Record<string, number>;

  /** Efficiency score (0-100) */
  efficiencyScore: number;

  /** Cache hit rate (0-100) */
  cacheHitRate: number;
}

/**
 * Efficiency score components
 */
export interface EfficiencyComponents {
  /** Cache utilization (0-100) */
  cacheUtilization: number;

  /** Code output ratio (lines changed / tokens used) */
  codeOutputRatio: number;

  /** Tool success rate (0-100) */
  toolSuccessRate: number;

  /** Context efficiency (output tokens / context used) */
  contextEfficiency: number;

  /** Composite score (0-100) */
  compositeScore: number;
}
```

### Pricing Types (packages/shared/src/types/pricing.ts)

```typescript
/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Model identifier */
  modelId: string;

  /** Display name */
  displayName: string;

  /** Price per million input tokens (USD) */
  inputPricePerMillion: number;

  /** Price per million output tokens (USD) */
  outputPricePerMillion: number;

  /** Price per million cache creation tokens (USD) */
  cacheCreationPricePerMillion: number;

  /** Price per million cache read tokens (USD) */
  cacheReadPricePerMillion: number;

  /** Maximum context window size */
  maxContextTokens: number;

  /** Maximum output tokens */
  maxOutputTokens: number;
}

/**
 * Default pricing database (as of 2026-02)
 */
export const PRICING_DATABASE: Record<string, ModelPricing> = {
  'claude-opus-4-5-20251101': {
    modelId: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 25.00,
    cacheCreationPricePerMillion: 6.25,   // 1.25x input price
    cacheReadPricePerMillion: 0.50,       // 0.1x input price
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
  'claude-sonnet-4-5-20251101': {
    modelId: 'claude-sonnet-4-5-20251101',
    displayName: 'Claude Sonnet 4.5',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cacheCreationPricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.30,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
  'claude-haiku-4-5-20251101': {
    modelId: 'claude-haiku-4-5-20251101',
    displayName: 'Claude Haiku 4.5',
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 5.00,
    cacheCreationPricePerMillion: 1.25,
    cacheReadPricePerMillion: 0.10,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
};
```

### SSE Event Types (packages/shared/src/types/sse.ts)

```typescript
/**
 * SSE event types sent from server to dashboard
 */
export type SSEEvent =
  | SSEConnectedEvent
  | SSESessionEvent
  | SSETurnEvent
  | SSEMetricsEvent
  | SSEHeartbeatEvent;

export interface SSEConnectedEvent {
  event: 'connected';
  data: {
    sessionId: string | null;
    timestamp: string;
    serverVersion: string;
  };
}

export interface SSESessionEvent {
  event: 'session';
  data: {
    type: 'snapshot' | 'update';
    session: Session;
    turns: Turn[];
    metrics: SessionMetrics;
  };
}

export interface SSETurnEvent {
  event: 'turn';
  data: {
    type: 'new' | 'update' | 'complete';
    turn: Turn;
    metrics: TurnMetrics;
  };
}

export interface SSEMetricsEvent {
  event: 'metrics';
  data: {
    type: 'aggregate';
    sessionMetrics: SessionMetrics;
  };
}

export interface SSEHeartbeatEvent {
  event: 'heartbeat';
  data: {
    timestamp: string;
  };
}
```

### MCP Types (packages/shared/src/types/mcp.ts)

```typescript
/**
 * MCP Tool definitions for Claude Code integration
 */

// Tool: get_session_metrics
export interface GetSessionMetricsInput {
  sessionId?: string;  // Optional, uses current if not provided
}

export interface GetSessionMetricsOutput {
  session: Session;
  metrics: SessionMetrics;
  recentTurns: Turn[];
}

// Tool: get_turn_details
export interface GetTurnDetailsInput {
  turnId: string;
}

export interface GetTurnDetailsOutput {
  turn: Turn;
  metrics: TurnMetrics;
  toolDetails: ToolUse[];
  codeChanges: CodeChange[];
}

// Tool: list_sessions
export interface ListSessionsInput {
  limit?: number;       // Default: 10
  activeOnly?: boolean; // Default: false
}

export interface ListSessionsOutput {
  sessions: Array<{
    session: Session;
    summary: {
      totalCost: number;
      totalTokens: number;
      turnCount: number;
    };
  }>;
}

// Tool: get_efficiency_report
export interface GetEfficiencyReportInput {
  sessionId?: string;
}

export interface GetEfficiencyReportOutput {
  session: Session;
  efficiency: EfficiencyComponents;
  recommendations: string[];
}

/**
 * MCP Resource URIs
 */
export type MCPResourceURI =
  | 'sessions://list'
  | 'sessions://current'
  | `sessions://${string}`
  | 'metrics://current'
  | `metrics://${string}`;
```

---

## API Specifications

### HTTP REST API (apps/server)

#### Base URL
```
http://localhost:3100/api
```

#### Endpoints

##### GET /api/sessions

List all sessions with summary metrics.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max sessions to return |
| `activeOnly` | boolean | false | Only return active sessions |
| `projectPath` | string | - | Filter by project path |

**Response:**
```typescript
interface SessionListResponse {
  sessions: Array<{
    id: string;
    projectName: string;
    branch: string | null;
    startedAt: string;
    lastActivityAt: string;
    isActive: boolean;
    summary: {
      totalTurns: number;
      totalTokens: number;
      totalCost: number;
    };
  }>;
  total: number;
}
```

**Example:**
```http
GET /api/sessions?limit=10&activeOnly=true
```

---

##### GET /api/sessions/:id

Get detailed session information.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Session UUID |

**Response:**
```typescript
interface SessionDetailResponse {
  session: Session;
  metrics: SessionMetrics;
  turnCount: number;
}
```

---

##### GET /api/sessions/:id/turns

Get turns for a session.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Session UUID |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | number | 0 | Pagination offset |
| `limit` | number | 50 | Max turns to return |

**Response:**
```typescript
interface TurnListResponse {
  turns: Turn[];
  metrics: TurnMetrics[];
  total: number;
  hasMore: boolean;
}
```

---

##### GET /api/sessions/:id/metrics

Get computed metrics for a session.

**Response:**
```typescript
interface MetricsResponse {
  sessionMetrics: SessionMetrics;
  turnMetrics: TurnMetrics[];
  efficiency: EfficiencyComponents;
}
```

---

##### GET /api/turns/:id

Get detailed turn information.

**Response:**
```typescript
interface TurnDetailResponse {
  turn: Turn;
  metrics: TurnMetrics;
  codeChanges: CodeChange[];
}
```

---

##### GET /api/sse

Server-Sent Events endpoint for real-time updates.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string | Optional session ID to filter events |

**Response Headers:**
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Types:**
| Event | Description |
|-------|-------------|
| `connected` | Initial connection confirmation |
| `session` | Session snapshot or update |
| `turn` | New or updated turn |
| `metrics` | Aggregated metrics update |
| `heartbeat` | Keep-alive (every 30s) |

---

### MCP Server Tools

#### Tool: get_session_metrics

Get current session metrics for analysis.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID (optional, uses current session if not provided)"
    }
  }
}
```

**Output:** `GetSessionMetricsOutput`

---

#### Tool: get_turn_details

Get detailed information about a specific turn.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "turnId": {
      "type": "string",
      "description": "Turn ID to retrieve"
    }
  },
  "required": ["turnId"]
}
```

**Output:** `GetTurnDetailsOutput`

---

#### Tool: list_sessions

List available sessions.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "number",
      "default": 10
    },
    "activeOnly": {
      "type": "boolean",
      "default": false
    }
  }
}
```

**Output:** `ListSessionsOutput`

---

#### Tool: get_efficiency_report

Generate efficiency analysis report.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID (optional)"
    }
  }
}
```

**Output:** `GetEfficiencyReportOutput`

---

### MCP Server Resources

#### Resource: sessions://list

List all available sessions.

**MIME Type:** `application/json`

---

#### Resource: sessions://current

Current active session data.

**MIME Type:** `application/json`

---

#### Resource: metrics://current

Current session metrics.

**MIME Type:** `application/json`

---

## Implementation File Structure

### Complete File Listing

```
claude-code-analytics-dashboard/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── README.md
├── ARCHITECTURE.md
│
├── apps/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts                    # Entry: start both MCP + HTTP
│   │       │
│   │       ├── mcp/
│   │       │   ├── index.ts                # MCP server setup
│   │       │   ├── server.ts               # McpServer instance
│   │       │   ├── tools/
│   │       │   │   ├── index.ts            # Tool registration
│   │       │   │   ├── getSessionMetrics.ts
│   │       │   │   ├── getTurnDetails.ts
│   │       │   │   ├── listSessions.ts
│   │       │   │   └── getEfficiencyReport.ts
│   │       │   ├── resources/
│   │       │   │   ├── index.ts            # Resource registration
│   │       │   │   ├── sessionsResource.ts
│   │       │   │   └── metricsResource.ts
│   │       │   └── prompts/
│   │       │       ├── index.ts
│   │       │       └── analyzeSession.ts
│   │       │
│   │       ├── http/
│   │       │   ├── index.ts                # Hono app setup
│   │       │   ├── app.ts                  # Route definitions
│   │       │   ├── routes/
│   │       │   │   ├── sessions.ts         # Session routes
│   │       │   │   ├── turns.ts            # Turn routes
│   │       │   │   └── metrics.ts          # Metrics routes
│   │       │   ├── sse/
│   │       │   │   ├── handler.ts          # SSE connection handler
│   │       │   │   ├── broadcaster.ts      # Event broadcasting
│   │       │   │   └── events.ts           # Event formatters
│   │       │   └── middleware/
│   │       │       ├── cors.ts             # CORS configuration
│   │       │       └── error.ts            # Error handling
│   │       │
│   │       ├── watcher/
│   │       │   ├── index.ts                # File watcher setup
│   │       │   ├── fileWatcher.ts          # Chokidar wrapper
│   │       │   └── incrementalReader.ts    # Byte-offset tracking
│   │       │
│   │       ├── parser/
│   │       │   ├── index.ts                # Parser exports
│   │       │   ├── jsonlParser.ts          # JSONL line parser
│   │       │   ├── entryParser.ts          # Entry validation
│   │       │   └── turnAggregator.ts       # Turn grouping logic
│   │       │
│   │       ├── metrics/
│   │       │   ├── index.ts                # Metrics exports
│   │       │   ├── calculator.ts           # Metrics computation
│   │       │   ├── costCalculator.ts       # Cost computation
│   │       │   ├── codeChangeTracker.ts    # Code metrics
│   │       │   └── efficiencyScore.ts      # Efficiency algorithm
│   │       │
│   │       ├── store/
│   │       │   ├── index.ts                # Store exports
│   │       │   ├── sessionStore.ts         # In-memory session store
│   │       │   └── eventEmitter.ts         # Internal event bus
│   │       │
│   │       └── config/
│   │           ├── index.ts                # Config exports
│   │           └── paths.ts                # Path constants
│   │
│   └── dashboard/
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── components.json                 # shadcn config
│       ├── tsconfig.json
│       └── src/
│           ├── app/
│           │   ├── layout.tsx              # Root layout
│           │   ├── page.tsx                # Dashboard home
│           │   ├── session/
│           │   │   └── [id]/
│           │   │       └── page.tsx        # Session detail page
│           │   ├── settings/
│           │   │   └── page.tsx            # Settings page
│           │   └── providers.tsx           # Context providers
│           │
│           ├── components/
│           │   ├── ui/                     # shadcn components
│           │   │   ├── button.tsx
│           │   │   ├── card.tsx
│           │   │   ├── chart.tsx           # Recharts wrapper
│           │   │   ├── data-table.tsx
│           │   │   ├── progress.tsx
│           │   │   ├── skeleton.tsx
│           │   │   ├── tabs.tsx
│           │   │   └── ...
│           │   │
│           │   ├── charts/
│           │   │   ├── TokenUsageChart.tsx       # Area chart
│           │   │   ├── CostChart.tsx             # Line chart
│           │   │   ├── ContextUsageGauge.tsx     # Radial bar
│           │   │   ├── CodeChangesChart.tsx      # Bar chart
│           │   │   ├── ToolUsageChart.tsx        # Pie chart
│           │   │   └── TurnDurationChart.tsx     # Bar chart
│           │   │
│           │   ├── session/
│           │   │   ├── SessionList.tsx           # Session sidebar
│           │   │   ├── SessionCard.tsx           # Session summary
│           │   │   ├── SessionHeader.tsx         # Session info
│           │   │   └── SessionMetrics.tsx        # Metrics grid
│           │   │
│           │   ├── turn/
│           │   │   ├── TurnTable.tsx             # Turn list table
│           │   │   ├── TurnRow.tsx               # Single turn row
│           │   │   ├── TurnDetail.tsx            # Turn drill-down
│           │   │   └── ToolUsageList.tsx         # Tool breakdown
│           │   │
│           │   ├── metrics/
│           │   │   ├── CostDisplay.tsx           # Total cost
│           │   │   ├── EfficiencyScore.tsx       # Score display
│           │   │   ├── TokenCounter.tsx          # Token totals
│           │   │   └── MetricCard.tsx            # Generic metric
│           │   │
│           │   ├── layout/
│           │   │   ├── Header.tsx
│           │   │   ├── Sidebar.tsx
│           │   │   └── Footer.tsx
│           │   │
│           │   └── realtime/
│           │       ├── ConnectionStatus.tsx      # SSE status
│           │       └── LiveIndicator.tsx         # Activity dot
│           │
│           ├── hooks/
│           │   ├── useSessionData.ts             # Session query
│           │   ├── useTurnData.ts                # Turn query
│           │   ├── useMetrics.ts                 # Metrics query
│           │   ├── useSSESubscription.ts         # SSE hook
│           │   └── useRealTimeUpdates.ts         # SSE + store sync
│           │
│           ├── stores/
│           │   ├── sessionStore.ts               # Zustand session
│           │   ├── metricsStore.ts               # Zustand metrics
│           │   └── settingsStore.ts              # Zustand settings
│           │
│           ├── lib/
│           │   ├── api.ts                        # API client
│           │   ├── sse.ts                        # SSE client
│           │   ├── formatters.ts                 # Display formatters
│           │   ├── utils.ts                      # cn() utility
│           │   └── queryClient.ts                # TanStack setup
│           │
│           └── styles/
│               └── globals.css                   # Tailwind imports
│
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts                          # Main exports
            │
            ├── types/
            │   ├── index.ts                      # Type exports
            │   ├── jsonl.ts                      # JSONL types
            │   ├── session.ts                    # Session types
            │   ├── metrics.ts                    # Metrics types
            │   ├── pricing.ts                    # Pricing types
            │   ├── sse.ts                        # SSE event types
            │   └── mcp.ts                        # MCP types
            │
            ├── schemas/
            │   ├── index.ts                      # Schema exports
            │   ├── jsonlSchema.ts                # Zod JSONL schema
            │   ├── sessionSchema.ts              # Zod session schema
            │   └── metricsSchema.ts              # Zod metrics schema
            │
            ├── pricing/
            │   ├── index.ts                      # Pricing exports
            │   ├── database.ts                   # Pricing data
            │   └── calculator.ts                 # Cost calculation
            │
            └── utils/
                ├── index.ts                      # Utility exports
                ├── dates.ts                      # Date utilities
                └── formatting.ts                 # Number formatting
```

---

## Design Decisions

### 1. Hybrid MCP + HTTP Architecture

**Decision:** Use both MCP (for Claude Code integration) and HTTP/SSE (for dashboard).

**Rationale:**
- MCP provides native Claude Code tool/resource integration
- HTTP/SSE enables real-time dashboard without MCP client complexity
- Separation allows independent scaling and deployment
- Dashboard can work standalone without Claude Code

**Alternatives Considered:**
- Pure MCP with WebSocket bridge: Added complexity, non-standard
- Pure HTTP only: Loses Claude Code native integration

### 2. Monorepo with Turborepo

**Decision:** Use pnpm workspaces with Turborepo.

**Rationale:**
- Shared types between server and dashboard
- Efficient caching for builds
- Single repository for related packages
- Parallel build execution

**Alternatives Considered:**
- Separate repositories: Type synchronization overhead
- npm workspaces: Less efficient than pnpm

### 3. In-Memory Session Store

**Decision:** Store session data in-memory, not persisted database.

**Rationale:**
- JSONL files are the source of truth
- No data duplication or sync issues
- Fast access for real-time updates
- Sessions can be rebuilt from JSONL on restart

**Alternatives Considered:**
- SQLite: Adds persistence complexity, not needed
- Redis: Overkill for single-user local tool

### 4. SSE over WebSocket

**Decision:** Use Server-Sent Events for real-time updates.

**Rationale:**
- Simpler server implementation (HTTP-based)
- Automatic reconnection in browsers
- Sufficient for server-to-client streaming
- No bidirectional communication needed

**Alternatives Considered:**
- WebSocket: More complex, bidirectional not needed
- Polling: Higher latency, more resource usage

### 5. Hono over Express

**Decision:** Use Hono as HTTP framework.

**Rationale:**
- TypeScript-first design
- Smaller bundle size
- Edge runtime compatible
- Official MCP middleware support
- Modern async patterns

**Alternatives Considered:**
- Express: Older patterns, larger size
- Fastify: Good but less MCP middleware support

### 6. Recharts with shadcn/ui

**Decision:** Use Recharts wrapped with shadcn chart components.

**Rationale:**
- Official shadcn/ui chart support
- No abstraction lock-in
- Customizable and composable
- Active maintenance

**Alternatives Considered:**
- Chart.js: Less React-native integration
- Nivo: More opinionated styling
- Visx: Lower-level, more work required

### 7. Zustand for Client State

**Decision:** Use Zustand for dashboard state management.

**Rationale:**
- Minimal boilerplate
- TypeScript-first
- Works well with TanStack Query
- Persist middleware for settings

**Alternatives Considered:**
- Redux Toolkit: Heavier for this use case
- Jotai: Good but less structured
- Context: Prop drilling at scale

### 8. Incremental File Reading

**Decision:** Track byte offsets for JSONL files to read only new content.

**Rationale:**
- Avoids re-parsing entire files
- Efficient for large session logs
- Required for real-time updates

**Implementation:**
```typescript
// Store: { [filePath]: lastReadOffset }
// On change: read from lastOffset to current size
// Parse only new lines
```

---

## Security Considerations

### 1. Localhost-Only Binding

The HTTP server MUST bind to `127.0.0.1` only, preventing remote access.

```typescript
app.listen({
  port: 3100,
  hostname: '127.0.0.1',  // NOT '0.0.0.0'
});
```

### 2. CORS Configuration

Restrict CORS to localhost origins:

```typescript
const corsConfig = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
};
```

### 3. Path Traversal Prevention

Validate all file paths are within `~/.claude/projects/`:

```typescript
function isValidSessionPath(path: string): boolean {
  const resolved = path.resolve(path);
  const base = path.resolve(os.homedir(), '.claude', 'projects');
  return resolved.startsWith(base);
}
```

### 4. No Sensitive Data Exposure

The dashboard should NOT display:
- API keys or tokens
- Environment variables
- Credential file contents
- SSH keys or certificates

Tool input/output filtering:
```typescript
const REDACT_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /bearer/i,
];
```

### 5. MCP Transport Security

MCP uses stdio transport (not network), inheriting process security context.

### 6. No External Network Calls

The server should NOT:
- Fetch pricing from external APIs
- Send telemetry
- Connect to remote services

All data remains local.

---

## Appendix: Environment Configuration

### .env.example

```bash
# Server Configuration
PORT=3100
HOST=127.0.0.1

# Dashboard Configuration
NEXT_PUBLIC_API_URL=http://localhost:3100/api
NEXT_PUBLIC_SSE_URL=http://localhost:3100/api/sse

# Claude Sessions Path (default: ~/.claude/projects)
CLAUDE_SESSIONS_PATH=

# Development
NODE_ENV=development
DEBUG=analytics:*
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## References

- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code JSONL Log Format](https://github.com/HillviewCap/clog)
- [shadcn/ui Charts](https://ui.shadcn.com/docs/components/chart)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Recharts Documentation](https://recharts.org/)
- [Hono Framework](https://hono.dev/)

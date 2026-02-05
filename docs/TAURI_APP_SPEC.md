# Claude Code Analytics - Tauri Desktop Application Technical Specification

**Version:** 1.0
**Date:** 2026-02-05
**Status:** Draft
**Author:** Tech Lead / Solution Architect

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Rust Backend Module Structure](#3-rust-backend-module-structure)
4. [Frontend Component Hierarchy](#4-frontend-component-hierarchy)
5. [Database Schema](#5-database-schema)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Analytics Dimensions and Visualizations](#7-analytics-dimensions-and-visualizations)
8. [Technical Stack Details](#8-technical-stack-details)
9. [Project Phases and Milestones](#9-project-phases-and-milestones)
10. [Security Considerations](#10-security-considerations)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines a cross-platform desktop application for analyzing Claude Code session transcripts. The application provides comprehensive analytics across token usage, cost management, context efficiency, session quality, and code productivity metrics.

### 1.2 Key Objectives

1. **Real-time Session Monitoring**: Watch active Claude Code sessions and display live metrics
2. **Historical Analysis**: Aggregate and trend analysis across sessions, days, weeks
3. **Cost Optimization**: Identify inefficient patterns and provide actionable recommendations
4. **Multi-dimensional Visualization**: Interactive charts with drill-down capabilities
5. **Cross-platform Support**: macOS, Windows, and Linux via Tauri

### 1.3 Design Principles

- **Performance First**: Rust backend for efficient JSONL parsing and metric computation
- **Privacy Preserving**: All data remains local; no external network calls
- **Incremental Processing**: Watch files for changes, process only new content
- **Memory Efficient**: SQLite for persistence, streaming JSONL parsing
- **Responsive UI**: React with efficient state management and virtualized lists

---

## 2. Architecture Overview

### 2.1 High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------+
|                        Claude Code Analytics Dashboard                       |
|                              (Tauri Application)                            |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +-----------------------------------+   +--------------------------------+ |
|  |           RUST BACKEND            |   |        REACT FRONTEND         | |
|  |                                   |   |                                | |
|  |  +---------------------------+    |   |  +-------------------------+  | |
|  |  |      File Watcher         |    |   |  |     Dashboard Page      |  | |
|  |  |  (notify crate)           |    |   |  |  +-------------------+  |  | |
|  |  |  - ~/.claude/projects/    |    |   |  |  | Token Charts      |  |  | |
|  |  |  - ~/.claude/history.jsonl|    |   |  |  | Cost Display      |  |  | |
|  |  +------------+--------------+    |   |  |  | Efficiency Score  |  |  | |
|  |               |                   |   |  |  +-------------------+  |  | |
|  |               v                   |   |  +-------------------------+  | |
|  |  +---------------------------+    |   |                                | |
|  |  |      JSONL Parser         |    |   |  +-------------------------+  | |
|  |  |  - Streaming line parser  |    |   |  |    Session Detail       |  | |
|  |  |  - Entry validation       |    |   |  |  +-------------------+  |  | |
|  |  |  - Turn aggregation       |<---+--->|  |  | Turn Table        |  |  | |
|  |  +------------+--------------+    |   |  |  | Context Graph     |  |  | |
|  |               |                   |   |  |  | Tool Breakdown    |  |  | |
|  |               v                   |   |  |  +-------------------+  |  | |
|  |  +---------------------------+    |   |  +-------------------------+  | |
|  |  |   Metrics Calculator      |    |   |                                | |
|  |  |  - Token aggregation      |    |   |  +-------------------------+  | |
|  |  |  - Cost computation       |    |   |  |    Comparison View      |  | |
|  |  |  - Efficiency scoring     |    |   |  |  +-------------------+  |  | |
|  |  |  - Code change tracking   |    |   |  |  | Side-by-side      |  |  | |
|  |  +------------+--------------+    |   |  |  | Time range picker |  |  | |
|  |               |                   |   |  |  +-------------------+  |  | |
|  |               v                   |   |  +-------------------------+  | |
|  |  +---------------------------+    |   |                                | |
|  |  |     SQLite Database       |    |   |  +-------------------------+  | |
|  |  |  - Sessions table         |    |   |  |       Settings          |  | |
|  |  |  - Turns table            |    |   |  |  - Path config          |  | |
|  |  |  - Metrics table          |    |   |  |  - Pricing overrides    |  | |
|  |  |  - Code changes table     |    |   |  +-------------------------+  | |
|  |  +---------------------------+    |   |                                | |
|  |                                   |   |                                | |
|  +-----------------------------------+   +--------------------------------+ |
|                                                                             |
|  +-----------------------------------------------------------------------+ |
|  |                          Tauri IPC Bridge                              | |
|  |  Commands:                              Events:                        | |
|  |  - get_sessions()                       - session:updated              | |
|  |  - get_session_metrics(id)              - turn:new                     | |
|  |  - get_turn_details(id)                 - metrics:refresh              | |
|  |  - get_efficiency_report(id)            - file:changed                 | |
|  |  - get_comparison(id1, id2)                                            | |
|  +-----------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------+
```

### 2.2 Technology Rationale

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Desktop Framework** | Tauri 2.x | Smaller bundle size than Electron, native performance, Rust security |
| **Backend Language** | Rust | Memory safety, performance for file I/O, excellent concurrency |
| **Frontend Framework** | React 19 + TypeScript | Mature ecosystem, component reusability, type safety |
| **Charts** | Recharts | D3-based, composable, good TypeScript support |
| **Database** | SQLite (rusqlite) | Embedded, zero-config, fast for local analytics |
| **File Watching** | notify crate | Cross-platform, efficient, Rust-native |
| **Styling** | Tailwind CSS 4 | Utility-first, consistent with existing dashboard |
| **State Management** | Zustand | Lightweight, works well with Tauri events |

---

## 3. Rust Backend Module Structure

### 3.1 Crate Layout

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── build.rs
└── src/
    ├── main.rs                    # Tauri entry point
    ├── lib.rs                     # Library exports
    │
    ├── commands/                  # Tauri IPC commands
    │   ├── mod.rs
    │   ├── sessions.rs            # Session CRUD commands
    │   ├── metrics.rs             # Metrics query commands
    │   ├── turns.rs               # Turn detail commands
    │   ├── efficiency.rs          # Efficiency analysis commands
    │   ├── comparison.rs          # Session comparison commands
    │   └── settings.rs            # Configuration commands
    │
    ├── watcher/                   # File system watching
    │   ├── mod.rs
    │   ├── session_watcher.rs     # Claude session directory watcher
    │   ├── change_detector.rs     # Incremental change detection
    │   └── debouncer.rs           # Event debouncing logic
    │
    ├── parser/                    # JSONL parsing
    │   ├── mod.rs
    │   ├── jsonl_reader.rs        # Streaming JSONL reader
    │   ├── entry_parser.rs        # Entry type parsing
    │   ├── turn_aggregator.rs     # Turn boundary detection
    │   ├── subagent_parser.rs     # Subagent log parsing
    │   └── validation.rs          # Schema validation
    │
    ├── metrics/                   # Metric computation
    │   ├── mod.rs
    │   ├── token_metrics.rs       # Token aggregation
    │   ├── cost_calculator.rs     # Cost computation
    │   ├── efficiency_scorer.rs   # OES calculation
    │   ├── context_analyzer.rs    # Context efficiency (CER, CGR)
    │   ├── code_metrics.rs        # Lines changed, churn
    │   └── time_series.rs         # Time-based aggregations
    │
    ├── db/                        # Database layer
    │   ├── mod.rs
    │   ├── schema.rs              # Table definitions
    │   ├── migrations.rs          # Schema migrations
    │   ├── sessions.rs            # Session queries
    │   ├── turns.rs               # Turn queries
    │   ├── metrics.rs             # Metric queries
    │   └── code_changes.rs        # Code change queries
    │
    ├── models/                    # Data structures
    │   ├── mod.rs
    │   ├── session.rs             # Session struct
    │   ├── turn.rs                # Turn struct
    │   ├── entry.rs               # JSONL entry types
    │   ├── metrics.rs             # Computed metrics
    │   ├── pricing.rs             # Model pricing config
    │   └── efficiency.rs          # Efficiency components
    │
    ├── events/                    # Event emission
    │   ├── mod.rs
    │   └── emitter.rs             # Tauri event emission
    │
    └── config/                    # Configuration
        ├── mod.rs
        ├── paths.rs               # Path detection/configuration
        └── pricing.rs             # Pricing database
```

### 3.2 Key Module Interfaces

#### 3.2.1 Session Watcher

```rust
// watcher/session_watcher.rs

pub struct SessionWatcher {
    watcher: RecommendedWatcher,
    sessions_path: PathBuf,
    file_positions: HashMap<PathBuf, u64>,
}

impl SessionWatcher {
    pub fn new(sessions_path: PathBuf) -> Result<Self>;
    pub fn start(&mut self, tx: Sender<WatchEvent>) -> Result<()>;
    pub fn stop(&mut self) -> Result<()>;

    fn handle_change(&mut self, path: &Path) -> Option<Vec<NewEntry>>;
}

pub enum WatchEvent {
    NewSession { session_id: String, path: PathBuf },
    SessionUpdated { session_id: String, new_entries: Vec<Entry> },
    SubagentCreated { session_id: String, agent_id: String },
    FileDeleted { path: PathBuf },
}
```

#### 3.2.2 JSONL Parser

```rust
// parser/jsonl_reader.rs

pub struct IncrementalReader {
    path: PathBuf,
    position: u64,
}

impl IncrementalReader {
    pub fn new(path: PathBuf) -> Self;
    pub fn read_new_lines(&mut self) -> Result<Vec<RawEntry>>;
    pub fn reset(&mut self);
}

// parser/turn_aggregator.rs

pub struct TurnAggregator {
    current_turn: Option<PartialTurn>,
    completed_turns: Vec<Turn>,
}

impl TurnAggregator {
    pub fn process_entry(&mut self, entry: Entry) -> Option<Turn>;
    pub fn flush(&mut self) -> Option<Turn>;

    fn is_turn_boundary(&self, entry: &Entry) -> bool;
    fn is_cycle_start(&self, entry: &Entry) -> bool;
}
```

#### 3.2.3 Metrics Calculator

```rust
// metrics/efficiency_scorer.rs

pub struct EfficiencyScorer {
    pricing: PricingDatabase,
}

impl EfficiencyScorer {
    /// Calculate Overall Efficiency Score (OES)
    /// OES = 0.30*CPDU_norm + 0.25*CpD_norm + 0.15*CER + 0.15*SEI_norm + 0.15*(1-WFS)
    pub fn calculate_oes(&self, session: &SessionMetrics) -> EfficiencyScore;

    /// Calculate Cache Efficiency Ratio
    /// CER = cache_read / (cache_read + cache_write)
    pub fn calculate_cer(&self, tokens: &TokenMetrics) -> f64;

    /// Calculate Subagent Efficiency Index
    /// SEI = deliverable_units / subagent_count
    pub fn calculate_sei(&self, deliverables: u32, subagents: u32) -> Option<f64>;

    /// Calculate Context Growth Rate
    /// CGR = (final_context - initial_context) / cycles
    pub fn calculate_cgr(&self, turns: &[TurnMetrics]) -> f64;
}

pub struct EfficiencyScore {
    pub overall: f64,           // 0.0 - 1.0
    pub cost_efficiency: f64,   // Normalized CPDU
    pub time_efficiency: f64,   // Normalized CpD
    pub cache_efficiency: f64,  // CER
    pub subagent_efficiency: Option<f64>, // SEI
    pub workflow_smoothness: f64, // 1 - WFS
    pub rating: EfficiencyRating,
}

pub enum EfficiencyRating {
    Excellent,  // > 0.75
    Good,       // 0.55 - 0.75
    Average,    // 0.35 - 0.55
    NeedsImprovement, // < 0.35
}
```

#### 3.2.4 Tauri Commands

```rust
// commands/sessions.rs

#[tauri::command]
pub async fn get_sessions(
    db: State<'_, DbPool>,
    filter: Option<SessionFilter>,
) -> Result<Vec<SessionSummary>, Error>;

#[tauri::command]
pub async fn get_session_detail(
    db: State<'_, DbPool>,
    session_id: String,
) -> Result<SessionDetail, Error>;

// commands/metrics.rs

#[tauri::command]
pub async fn get_session_metrics(
    db: State<'_, DbPool>,
    session_id: String,
) -> Result<SessionMetrics, Error>;

#[tauri::command]
pub async fn get_turn_metrics(
    db: State<'_, DbPool>,
    session_id: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<TurnMetrics>, Error>;

#[tauri::command]
pub async fn get_time_series(
    db: State<'_, DbPool>,
    session_id: String,
    metric: TimeSeriesMetric,
    granularity: Granularity,
) -> Result<Vec<TimeSeriesPoint>, Error>;

// commands/comparison.rs

#[tauri::command]
pub async fn compare_sessions(
    db: State<'_, DbPool>,
    session_ids: Vec<String>,
) -> Result<SessionComparison, Error>;

#[tauri::command]
pub async fn compare_time_ranges(
    db: State<'_, DbPool>,
    range1: TimeRange,
    range2: TimeRange,
) -> Result<TimeRangeComparison, Error>;
```

---

## 4. Frontend Component Hierarchy

### 4.1 Component Tree

```
src/
├── App.tsx
├── main.tsx
│
├── pages/
│   ├── DashboardPage.tsx          # Main overview page
│   ├── SessionPage.tsx            # Single session detail
│   ├── ComparisonPage.tsx         # Side-by-side comparison
│   ├── TrendsPage.tsx             # Historical trends
│   └── SettingsPage.tsx           # Configuration
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx           # Main application shell
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── Header.tsx             # Top header bar
│   │   └── StatusBar.tsx          # Connection/sync status
│   │
│   ├── session/
│   │   ├── SessionList.tsx        # Session list sidebar
│   │   ├── SessionCard.tsx        # Session summary card
│   │   ├── SessionHeader.tsx      # Session detail header
│   │   ├── SessionFilters.tsx     # Filter controls
│   │   └── SessionSearch.tsx      # Search input
│   │
│   ├── metrics/
│   │   ├── MetricCard.tsx         # Generic metric display
│   │   ├── TokenDisplay.tsx       # Token breakdown
│   │   ├── CostDisplay.tsx        # Cost with breakdown
│   │   ├── EfficiencyGauge.tsx    # OES circular gauge
│   │   ├── ContextMeter.tsx       # Context usage bar
│   │   └── DurationDisplay.tsx    # Time formatting
│   │
│   ├── charts/
│   │   ├── TokenUsageChart.tsx    # Area chart - tokens over turns
│   │   ├── CostTrendChart.tsx     # Line chart - cost over time
│   │   ├── ContextGrowthChart.tsx # Area chart - context growth
│   │   ├── CacheEfficiencyChart.tsx # Stacked bar - cache R/W
│   │   ├── ToolUsagePie.tsx       # Pie chart - tool distribution
│   │   ├── CodeChurnChart.tsx     # Bar chart - lines +/-
│   │   ├── TurnDurationChart.tsx  # Bar chart - turn durations
│   │   ├── SubagentChart.tsx      # Sankey or tree - subagent flow
│   │   ├── EfficiencyRadar.tsx    # Radar - efficiency dimensions
│   │   └── ComparisonChart.tsx    # Multi-series comparison
│   │
│   ├── turns/
│   │   ├── TurnTable.tsx          # Virtualized turn list
│   │   ├── TurnRow.tsx            # Single turn row
│   │   ├── TurnDetail.tsx         # Expanded turn view
│   │   ├── ToolCallList.tsx       # Tool uses in turn
│   │   └── CodeChangeList.tsx     # File changes in turn
│   │
│   ├── efficiency/
│   │   ├── EfficiencyDashboard.tsx # Efficiency overview
│   │   ├── EfficiencyBreakdown.tsx # Component breakdown
│   │   ├── AntiPatternAlert.tsx   # Pattern detection alerts
│   │   └── Recommendations.tsx    # Improvement suggestions
│   │
│   ├── comparison/
│   │   ├── ComparisonView.tsx     # Side-by-side layout
│   │   ├── MetricDiff.tsx         # Metric delta display
│   │   └── TimeRangePicker.tsx    # Date range selection
│   │
│   ├── git/
│   │   ├── BranchIndicator.tsx    # Current branch display
│   │   ├── CommitList.tsx         # Commits in session
│   │   └── WorktreeStatus.tsx     # Worktree info
│   │
│   └── ui/                        # Base UI components
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Tabs.tsx
│       ├── Table.tsx
│       ├── Progress.tsx
│       ├── Skeleton.tsx
│       ├── Dialog.tsx
│       ├── Tooltip.tsx
│       └── Badge.tsx
│
├── hooks/
│   ├── useSession.ts              # Session data hook
│   ├── useTurns.ts                # Turn data hook
│   ├── useMetrics.ts              # Metrics hook
│   ├── useEfficiency.ts           # Efficiency calculations
│   ├── useTauriEvents.ts          # Tauri event subscription
│   ├── useComparison.ts           # Comparison data
│   └── useSettings.ts             # Settings management
│
├── stores/
│   ├── sessionStore.ts            # Session state
│   ├── metricsStore.ts            # Metrics cache
│   ├── filterStore.ts             # Filter state
│   └── settingsStore.ts           # App settings
│
├── lib/
│   ├── tauri.ts                   # Tauri invoke wrappers
│   ├── formatters.ts              # Number/date formatting
│   ├── chartConfig.ts             # Recharts configuration
│   └── colors.ts                  # Color palette
│
└── types/
    ├── session.ts                 # Session types
    ├── metrics.ts                 # Metric types
    ├── turn.ts                    # Turn types
    ├── efficiency.ts              # Efficiency types
    └── events.ts                  # Tauri event types
```

### 4.2 Key Component Specifications

#### 4.2.1 Dashboard Page Layout

```
+------------------------------------------------------------------+
|  [Logo] Claude Code Analytics     [Search]     [Settings] [Status]|
+------------------------------------------------------------------+
|        |                                                          |
|  S     |  +------------------+  +------------------+              |
|  E     |  | Total Cost       |  | Sessions Today   |              |
|  S     |  | $156.82          |  | 12               |              |
|  S     |  | +5.2% vs week    |  | 3 active         |              |
|  I     |  +------------------+  +------------------+              |
|  O     |                                                          |
|  N     |  +------------------+  +------------------+              |
|  S     |  | Efficiency Score |  | Cache Hit Rate   |              |
|        |  | 0.67 (Good)      |  | 73.2%            |              |
|  L     |  | [=====>    ]     |  | [=======>  ]     |              |
|  I     |  +------------------+  +------------------+              |
|  S     |                                                          |
|  T     |  +------------------------------------------------+     |
|        |  | Token Usage Over Time                          |     |
|  [     |  |   [Area Chart]                                 |     |
|   S    |  |   Input | Output | Cache Read | Cache Write    |     |
|   e    |  +------------------------------------------------+     |
|   s    |                                                          |
|   s    |  +------------------------+  +------------------------+  |
|   i    |  | Cost by Category       |  | Tool Usage             |  |
|   o    |  | [Pie Chart]            |  | [Bar Chart]            |  |
|   n    |  +------------------------+  +------------------------+  |
|        |                                                          |
|   1    |  +------------------------------------------------+     |
|   ]    |  | Recent Turns                                   |     |
|        |  | [Virtualized Table]                            |     |
|        |  | # | Time | User Prompt | Tokens | Cost | Dur   |     |
|        |  +------------------------------------------------+     |
+--------+----------------------------------------------------------+
```

#### 4.2.2 Session Detail Page Layout

```
+------------------------------------------------------------------+
| < Back to Dashboard    Session: 8caebe04-e897...    [Actions v]   |
+------------------------------------------------------------------+
| Project: droxi-data-filter | Branch: feature/xyz | Active 2h ago  |
+------------------------------------------------------------------+
|                                                                   |
|  [Overview]  [Turns]  [Efficiency]  [Code Changes]  [Subagents]   |
|                                                                   |
|  +------------------------+  +------------------------+           |
|  | Session Metrics        |  | Efficiency Components  |           |
|  |                        |  |                        |           |
|  | Total Turns: 67        |  | [Radar Chart]          |           |
|  | Duration: 2h 34m       |  |  - Cost Eff            |           |
|  | Total Cost: $106.82    |  |  - Time Eff            |           |
|  | Total Tokens: 2.1M     |  |  - Cache Eff           |           |
|  | Subagents: 88          |  |  - Workflow            |           |
|  +------------------------+  +------------------------+           |
|                                                                   |
|  +------------------------------------------------------------+  |
|  | Token Usage Over Turns                                      |  |
|  | [Zoomable Area Chart with Turn Markers]                     |  |
|  | Click turn to expand detail                                 |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  +------------------------------------------------------------+  |
|  | Turn Detail Table                                           |  |
|  | [Virtualized, Expandable Rows]                              |  |
|  | # | Start Time | Prompt Preview | Tokens | Cost | Duration |  |
|  | > Turn 1 ...                                                |  |
|  |   [Expanded: Full prompt, tool calls, code changes]         |  |
|  +------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
+------------------+       +------------------+       +------------------+
|    sessions      |       |      turns       |       |   tool_uses      |
+------------------+       +------------------+       +------------------+
| PK session_id    |<------| PK turn_id       |<------| PK tool_use_id   |
|    project_path  |       | FK session_id    |       | FK turn_id       |
|    project_name  |       |    turn_number   |       |    tool_name     |
|    branch        |       |    started_at    |       |    input_json    |
|    started_at    |       |    ended_at      |       |    result        |
|    last_activity |       |    duration_ms   |       |    is_error      |
|    model         |       |    user_message  |       |    duration_ms   |
|    is_active     |       |    assistant_msg |       +------------------+
|    file_path     |       |    model         |
+------------------+       +------------------+
         |                          |
         |                          |
         v                          v
+------------------+       +------------------+       +------------------+
| session_metrics  |       |   turn_metrics   |       |  code_changes    |
+------------------+       +------------------+       +------------------+
| FK session_id    |       | FK turn_id       |       | PK change_id     |
|    total_turns   |       |    input_tokens  |       | FK turn_id       |
|    total_duration|       |    output_tokens |       |    file_path     |
|    total_cost    |       |    cache_read    |       |    change_type   |
|    total_input   |       |    cache_write_5m|       |    lines_added   |
|    total_output  |       |    cache_write_1h|       |    lines_removed |
|    total_cache_r |       |    total_cost    |       |    extension     |
|    total_cache_w |       |    context_pct   |       +------------------+
|    efficiency    |       |    tool_count    |
|    cache_hit_rate|       +------------------+
+------------------+
         |
         v
+------------------+       +------------------+
|    subagents     |       |    git_info      |
+------------------+       +------------------+
| PK subagent_id   |       | FK session_id    |
| FK session_id    |       |    branch        |
|    agent_hash    |       |    worktree      |
|    slug          |       |    commit_count  |
|    started_at    |       |    last_commit   |
|    ended_at      |       +------------------+
|    total_tokens  |
|    total_cost    |
|    tool_count    |
+------------------+
```

### 5.2 SQL Schema Definition

```sql
-- Core session tracking
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    project_name TEXT NOT NULL,
    branch TEXT,
    started_at TEXT NOT NULL,           -- ISO-8601
    last_activity_at TEXT NOT NULL,
    model TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    file_path TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_activity ON sessions(last_activity_at DESC);
CREATE INDEX idx_sessions_active ON sessions(is_active);

-- Turn (cycle) tracking
CREATE TABLE turns (
    turn_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    user_message TEXT,
    assistant_message TEXT,
    model TEXT,
    stop_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, turn_number)
);

CREATE INDEX idx_turns_session ON turns(session_id, turn_number);
CREATE INDEX idx_turns_time ON turns(started_at);

-- Turn token metrics
CREATE TABLE turn_metrics (
    turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id) ON DELETE CASCADE,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_5m_tokens INTEGER DEFAULT 0,
    cache_write_1h_tokens INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    context_usage_pct REAL DEFAULT 0.0,
    tool_count INTEGER DEFAULT 0
);

-- Session aggregated metrics
CREATE TABLE session_metrics (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    total_turns INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cache_read INTEGER DEFAULT 0,
    total_cache_write INTEGER DEFAULT 0,
    avg_cost_per_turn REAL DEFAULT 0.0,
    avg_tokens_per_turn REAL DEFAULT 0.0,
    peak_context_pct REAL DEFAULT 0.0,
    efficiency_score REAL,
    cache_hit_rate REAL DEFAULT 0.0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tool usage tracking
CREATE TABLE tool_uses (
    tool_use_id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    input_json TEXT,
    result TEXT,
    is_error INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tool_uses_turn ON tool_uses(turn_id);
CREATE INDEX idx_tool_uses_name ON tool_uses(tool_name);

-- Code change tracking
CREATE TABLE code_changes (
    change_id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,          -- 'create', 'modify', 'delete'
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    extension TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_code_changes_turn ON code_changes(turn_id);
CREATE INDEX idx_code_changes_file ON code_changes(file_path);

-- Subagent tracking
CREATE TABLE subagents (
    subagent_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    agent_hash TEXT NOT NULL,
    slug TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cache_tokens INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    tool_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subagents_session ON subagents(session_id);

-- Git context tracking
CREATE TABLE git_info (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    branch TEXT,
    worktree TEXT,
    commit_count INTEGER DEFAULT 0,
    last_commit_hash TEXT,
    last_commit_time TEXT
);

-- File position tracking (for incremental parsing)
CREATE TABLE file_positions (
    file_path TEXT PRIMARY KEY,
    byte_position INTEGER DEFAULT 0,
    last_read_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Model pricing configuration
CREATE TABLE pricing (
    model_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    input_price_per_million REAL NOT NULL,
    output_price_per_million REAL NOT NULL,
    cache_write_5m_per_million REAL NOT NULL,
    cache_write_1h_per_million REAL NOT NULL,
    cache_read_per_million REAL NOT NULL,
    max_context_tokens INTEGER,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Insert default pricing
INSERT INTO pricing VALUES
    ('claude-opus-4-5-20251101', 'Claude Opus 4.5', 5.00, 25.00, 6.25, 10.00, 0.50, 200000, CURRENT_TIMESTAMP),
    ('claude-sonnet-4-5-20251101', 'Claude Sonnet 4.5', 3.00, 15.00, 3.75, 6.00, 0.30, 200000, CURRENT_TIMESTAMP),
    ('claude-haiku-4-5-20251101', 'Claude Haiku 4.5', 1.00, 5.00, 1.25, 2.00, 0.10, 200000, CURRENT_TIMESTAMP);
```

---

## 6. Data Flow Diagrams

### 6.1 Session Discovery and Parsing Flow

```
+-------------------+
| Application Start |
+--------+----------+
         |
         v
+-------------------+
| Load Settings     |
| - Claude path     |
| - Pricing config  |
+--------+----------+
         |
         v
+-------------------+
| Scan Session Dir  |
| ~/.claude/projects|
+--------+----------+
         |
         v
+------------------------+
| For each project dir:  |
| - Read sessions-index  |
| - Identify JSONL files |
+--------+---------------+
         |
         +------------------------+
         |                        |
         v                        v
+------------------+    +-------------------+
| New Session?     |    | Existing Session? |
| (not in DB)      |    | (check position)  |
+--------+---------+    +--------+----------+
         |                       |
         v                       v
+------------------+    +-------------------+
| Parse Full File  |    | Read New Lines    |
| from byte 0      |    | from saved pos    |
+--------+---------+    +--------+----------+
         |                       |
         +----------+------------+
                    |
                    v
         +-------------------+
         | Parse JSONL Lines |
         | - Validate schema |
         | - Extract entries |
         +--------+----------+
                  |
                  v
         +-------------------+
         | Aggregate Turns   |
         | - Detect cycles   |
         | - Group entries   |
         +--------+----------+
                  |
                  v
         +-------------------+
         | Calculate Metrics |
         | - Token counts    |
         | - Cost calc       |
         | - Context %       |
         +--------+----------+
                  |
                  v
         +-------------------+
         | Update Database   |
         | - INSERT/UPDATE   |
         | - Save position   |
         +--------+----------+
                  |
                  v
         +-------------------+
         | Emit Events       |
         | - session:updated |
         | - metrics:refresh |
         +-------------------+
```

### 6.2 Real-time Watch Flow

```
+-------------------+        +-------------------+
|   Notify Watcher  |        |   Frontend UI     |
| (File System)     |        |   (React)         |
+--------+----------+        +--------+----------+
         |                            |
         v                            v
+-------------------+        +-------------------+
| File Change Event |        | Subscribe Events  |
| - .jsonl modified |        | - useTauriEvents  |
| - new subagent    |        +--------+----------+
+--------+----------+                 |
         |                            |
         v                            |
+-------------------+                 |
| Debounce (100ms)  |                 |
+--------+----------+                 |
         |                            |
         v                            |
+-------------------+                 |
| Read New Content  |                 |
| (incremental)     |                 |
+--------+----------+                 |
         |                            |
         v                            |
+-------------------+                 |
| Parse & Calculate |                 |
+--------+----------+                 |
         |                            |
         v                            |
+-------------------+                 |
| Update DB         |                 |
+--------+----------+                 |
         |                            |
         v                            |
+-------------------+   Tauri Event   |
| Emit Event        +---------------->|
| - turn:new        |                 |
| - metrics:refresh |                 |
+-------------------+                 |
                                      v
                           +-------------------+
                           | Update Store      |
                           | - Invalidate query|
                           | - Trigger re-render|
                           +-------------------+
```

### 6.3 Metrics Calculation Pipeline

```
+-------------------+
| Raw Turn Data     |
| (from JSONL)      |
+--------+----------+
         |
         +------------------------------------------+
         |                    |                     |
         v                    v                     v
+------------------+  +------------------+  +------------------+
| Token Metrics    |  | Time Metrics     |  | Code Metrics     |
|                  |  |                  |  |                  |
| - input_tokens   |  | - started_at     |  | - files_created  |
| - output_tokens  |  | - ended_at       |  | - files_modified |
| - cache_read     |  | - duration_ms    |  | - lines_added    |
| - cache_write_5m |  |                  |  | - lines_removed  |
| - cache_write_1h |  |                  |  |                  |
+--------+---------+  +--------+---------+  +--------+---------+
         |                    |                     |
         +----------+---------+---------------------+
                    |
                    v
         +-------------------+
         | Cost Calculator   |
         |                   |
         | cost = (input/1M)*price_in +
         |        (output/1M)*price_out +
         |        (cache_r/1M)*price_cr +
         |        (cache_w5/1M)*price_cw5 +
         |        (cache_w1/1M)*price_cw1
         +--------+----------+
                  |
                  v
         +-------------------+
         | Context Analysis  |
         |                   |
         | CER = cache_read / (cache_read + cache_write)
         | CGR = (final_ctx - initial_ctx) / cycles
         | context_pct = total_ctx / max_context * 100
         +--------+----------+
                  |
                  v
         +-------------------+
         | Efficiency Scorer |
         |                   |
         | CPDU_norm = max(0, 1 - CPDU/50)
         | CpD_norm = max(0, 1 - CpD/50)
         | SEI_norm = min(1, SEI/0.5)
         |
         | OES = 0.30*CPDU_norm +
         |       0.25*CpD_norm +
         |       0.15*CER +
         |       0.15*SEI_norm +
         |       0.15*(1-WFS)
         +--------+----------+
                  |
                  v
         +-------------------+
         | Store in DB       |
         | - turn_metrics    |
         | - session_metrics |
         +-------------------+
```

---

## 7. Analytics Dimensions and Visualizations

### 7.1 Token Analysis

#### 7.1.1 Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| **Tokens per Turn** | `total_tokens / turn_count` | Average token consumption |
| **Token Velocity** | `tokens / duration_seconds` | Token throughput rate |
| **Input/Output Ratio** | `output_tokens / input_tokens` | Generation efficiency |
| **Cache Token Ratio** | `cache_tokens / total_tokens` | Cache vs fresh tokens |

#### 7.1.2 Visualizations

**Token Usage Over Time (Area Chart)**
```
Dimensions: Time (X), Tokens (Y)
Series:
  - Input Tokens (stacked)
  - Output Tokens (stacked)
  - Cache Read (stacked)
  - Cache Write (stacked)
Interactions:
  - Hover: Show breakdown tooltip
  - Click: Navigate to turn
  - Zoom: Time range selection
```

**Token Distribution by Turn (Horizontal Bar)**
```
Dimensions: Turn Number (Y), Tokens (X)
Bars: Segmented by token type
Color:
  - Input: Blue
  - Output: Green
  - Cache Read: Purple
  - Cache Write: Orange
```

### 7.2 Context Efficiency

#### 7.2.1 Metrics

| Metric | Formula | Target | Description |
|--------|---------|--------|-------------|
| **Cache Efficiency Ratio (CER)** | `cache_read / (cache_read + cache_write)` | > 0.70 | Context reuse rate |
| **Context Growth Rate (CGR)** | `(final_ctx - initial_ctx) / cycles` | < 1000 tok/cycle | Context bloat indicator |
| **Context Utilization** | `total_ctx / max_context * 100` | < 80% | Headroom remaining |
| **Subagent Efficiency Index (SEI)** | `deliverables / subagent_count` | > 0.30 | Parallelization efficiency |

#### 7.2.2 Visualizations

**Context Growth Chart (Area with Threshold)**
```
Dimensions: Turn Number (X), Context Size (Y)
Series:
  - Cumulative Context (area)
  - 80% Threshold (dashed line)
  - 100% Max Context (solid line)
Annotations:
  - Mark where CER drops below 0.5
  - Highlight context resets
```

**Cache Read/Write Ratio (Stacked Bar per Turn)**
```
Dimensions: Turn (X), Ratio (Y)
Bars:
  - Cache Read (green)
  - Cache Write (orange)
Threshold line at 70% read ratio
```

**Subagent Flow (Sankey Diagram)**
```
Nodes:
  - Main Session (left)
  - Subagents (middle)
  - Deliverables (right)
Links: Proportional to tokens consumed
Color: By efficiency (green = high SEI, red = low SEI)
```

### 7.3 Session Quality

#### 7.3.1 Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| **Session Duration** | `last_activity - started_at` | Wall clock time |
| **Active Duration** | `sum(turn_durations)` | Actual processing time |
| **Idle Ratio** | `(session_duration - active_duration) / session_duration` | User think time |
| **Smoothness Score** | `1 - (rework_cycles / total_cycles)` | Workflow friction |
| **Completion Rate** | `completed_tasks / attempted_tasks` | Goal achievement |

#### 7.3.2 Inefficient Turn Detection

A turn is flagged as **potentially inefficient** if:
- Cost > 2x session average AND output_tokens < 0.5x average
- Duration > 3x average (stuck/waiting)
- Tool errors > 2 in sequence
- Context usage > 90% (near limit)

**Visualization: Turn Health Timeline**
```
Dimensions: Time (X), Turn Status (Y categorical)
Markers:
  - Green dot: Efficient turn
  - Yellow dot: Warning turn
  - Red dot: Inefficient turn
Tooltip: Reason for classification
Click: Navigate to turn detail
```

### 7.4 Cost Management

#### 7.4.1 Metrics

| Metric | Formula | Target | Description |
|--------|---------|--------|-------------|
| **Cost per Deliverable Unit (CPDU)** | `total_cost / deliverable_units` | < $15 | Value efficiency |
| **Cost per Cycle (CPC)** | `total_cost / cycles` | < $1.20 | Per-interaction cost |
| **Cost Breakdown** | By component | - | Where money goes |
| **Subagent Cost Ratio** | `subagent_cost / total_cost` | < 30% | Orchestration overhead |

#### 7.4.2 Visualizations

**Cost Breakdown (Donut Chart)**
```
Segments:
  - Input Tokens: Blue
  - Output Tokens: Green
  - Cache Write 5m: Orange
  - Cache Write 1h: Red
  - Cache Read: Purple
Center: Total cost display
```

**Cost Trend (Line Chart with Annotations)**
```
Dimensions: Date (X), Cost (Y)
Series:
  - Daily cost
  - 7-day moving average
Annotations:
  - High-cost sessions
  - Week-over-week trend
```

**Cost vs Output Scatter Plot**
```
Dimensions: Cost (X), Deliverable Units (Y)
Points: Sessions colored by task type
Quadrants:
  - Top-left: Low cost, high output (excellent)
  - Bottom-right: High cost, low output (needs review)
Trendline: Expected cost/output ratio
```

### 7.5 Git/Worktree Analysis

#### 7.5.1 Metrics

| Metric | Description |
|--------|-------------|
| **Branch Usage** | Sessions per branch |
| **Worktree Frequency** | Worktree switches per session |
| **Commits per Session** | Productivity correlation |
| **Branch Longevity** | Branch age vs session efficiency |

#### 7.5.2 Visualizations

**Branch Activity Heatmap**
```
Dimensions: Branch (Y), Time (X)
Cells: Colored by session cost
Interactions: Click to filter sessions
```

### 7.6 Code Metrics

#### 7.6.1 Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| **Lines Generated** | `sum(lines_added)` | Total additions |
| **Lines Deleted** | `sum(lines_removed)` | Total removals |
| **Net Change** | `lines_added - lines_removed` | Net productivity |
| **Churn Rate** | `min(lines_added, lines_removed) / max(lines_added, lines_removed)` | Rework indicator |
| **Code per Dollar** | `net_lines / total_cost` | Cost efficiency |

#### 7.6.2 Visualizations

**Code Change Bar Chart**
```
Dimensions: Turn/Session (X), Lines (Y)
Bars:
  - Lines Added (above zero, green)
  - Lines Removed (below zero, red)
```

**File Type Treemap**
```
Rectangles: File extensions
Size: Total lines changed
Color: Net direction (green = added, red = removed)
```

### 7.7 Skills/Commands Analysis

#### 7.7.1 Metrics

| Metric | Description |
|--------|-------------|
| **Tool Usage Frequency** | Count per tool type |
| **Subagent Spawning** | Patterns of delegation |
| **Tool Success Rate** | Non-error percentage |
| **Tool Duration** | Average time per tool type |

#### 7.7.2 Visualizations

**Tool Usage Pie Chart**
```
Segments: Tool names (Bash, Read, Write, Grep, etc.)
Size: Usage count
Tooltip: Success rate, avg duration
```

**Tool Timeline (Gantt-style)**
```
Rows: Tool executions
X-axis: Time within turn
Color: Tool type
Marks: Success (green), Error (red)
```

### 7.8 Overall Efficiency Dashboard

**Efficiency Radar Chart**
```
Axes:
  - Cost Efficiency (CPDU normalized)
  - Time Efficiency (CpD normalized)
  - Cache Efficiency (CER)
  - Subagent Efficiency (SEI normalized)
  - Workflow Smoothness (1 - WFS)
Overlay: Session vs benchmark average
```

**Efficiency Score Gauge**
```
Type: Semi-circular gauge
Range: 0.0 - 1.0
Zones:
  - Red: 0.0 - 0.35 (Needs Improvement)
  - Yellow: 0.35 - 0.55 (Average)
  - Light Green: 0.55 - 0.75 (Good)
  - Green: 0.75 - 1.0 (Excellent)
Needle: Current OES
```

---

## 8. Technical Stack Details

### 8.1 Rust Dependencies (Cargo.toml)

```toml
[package]
name = "claude-analytics"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
# Tauri framework
tauri = { version = "2.2", features = ["protocol-asset"] }
tauri-plugin-shell = "2.0"
tauri-plugin-dialog = "2.0"

# Async runtime
tokio = { version = "1.36", features = ["full"] }

# File watching
notify = "7.0"
notify-debouncer-mini = "0.5"

# Database
rusqlite = { version = "0.32", features = ["bundled"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Date/time
chrono = { version = "0.4", features = ["serde"] }

# Error handling
thiserror = "2.0"
anyhow = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Path handling
dirs = "6.0"

# UUID generation
uuid = { version = "1.10", features = ["v4", "serde"] }

[dev-dependencies]
tempfile = "3.10"
```

### 8.2 Frontend Dependencies (package.json)

```json
{
  "name": "claude-analytics-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.2.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.60.0",
    "date-fns": "^4.1.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@tauri-apps/cli": "^2.2.0"
  }
}
```

### 8.3 Tauri Configuration (tauri.conf.json)

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/core/tauri/schema.json",
  "productName": "Claude Code Analytics",
  "version": "0.1.0",
  "identifier": "com.claudecode.analytics",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Claude Code Analytics",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app", "deb", "rpm", "msi", "nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

---

## 9. Project Phases and Milestones

### Phase 1: Foundation (Weeks 1-3)

**Milestone 1.1: Project Setup**
- [ ] Initialize Tauri project structure
- [ ] Configure Rust workspace
- [ ] Set up React with TypeScript
- [ ] Configure Tailwind CSS
- [ ] Create base component library

**Milestone 1.2: Data Layer**
- [ ] Implement SQLite schema
- [ ] Create database migrations
- [ ] Build JSONL parser with streaming
- [ ] Implement incremental file reader
- [ ] Create turn aggregation logic

**Milestone 1.3: File Watching**
- [ ] Implement notify-based watcher
- [ ] Add debouncing logic
- [ ] Create session discovery
- [ ] Handle file deletions
- [ ] Test cross-platform behavior

**Deliverables:**
- Working Tauri app shell
- Database with seeded test data
- File watcher detecting changes
- Basic UI scaffold

### Phase 2: Core Metrics (Weeks 4-6)

**Milestone 2.1: Token Metrics**
- [ ] Implement token counting
- [ ] Build cost calculator
- [ ] Create context analyzer
- [ ] Add pricing database

**Milestone 2.2: Efficiency Scoring**
- [ ] Implement OES formula
- [ ] Calculate CER, CGR, SEI
- [ ] Add workflow friction detection
- [ ] Create normalization functions

**Milestone 2.3: Basic Visualizations**
- [ ] Token usage area chart
- [ ] Cost breakdown donut
- [ ] Efficiency gauge
- [ ] Session list component

**Deliverables:**
- Full metrics pipeline
- Session list with metrics
- 3-5 working charts
- Real-time updates working

### Phase 3: Advanced Features (Weeks 7-9)

**Milestone 3.1: Turn Analysis**
- [ ] Virtualized turn table
- [ ] Turn detail expansion
- [ ] Tool usage breakdown
- [ ] Code change tracking

**Milestone 3.2: Subagent Analysis**
- [ ] Subagent log parsing
- [ ] Subagent metrics
- [ ] Subagent visualization
- [ ] SEI calculation

**Milestone 3.3: Advanced Charts**
- [ ] Context growth chart
- [ ] Cache efficiency chart
- [ ] Code churn chart
- [ ] Efficiency radar

**Deliverables:**
- Complete turn detail view
- Subagent tracking
- Full chart suite
- Drill-down navigation

### Phase 4: Comparison & Trends (Weeks 10-11)

**Milestone 4.1: Session Comparison**
- [ ] Side-by-side view
- [ ] Metric diff display
- [ ] Comparative charts

**Milestone 4.2: Historical Trends**
- [ ] Time range aggregation
- [ ] Trend charts
- [ ] Week-over-week analysis

**Milestone 4.3: Recommendations**
- [ ] Anti-pattern detection
- [ ] Improvement suggestions
- [ ] Cost optimization tips

**Deliverables:**
- Comparison page
- Trends page
- Actionable insights

### Phase 5: Polish & Release (Week 12)

**Milestone 5.1: UX Polish**
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Keyboard navigation

**Milestone 5.2: Performance**
- [ ] Query optimization
- [ ] Virtual scrolling
- [ ] Memory profiling

**Milestone 5.3: Distribution**
- [ ] macOS signing
- [ ] Windows installer
- [ ] Linux packages
- [ ] Auto-update setup

**Deliverables:**
- Production-ready builds
- Installation documentation
- User guide

---

## 10. Security Considerations

### 10.1 Data Privacy

1. **Local-only Processing**: All session data remains on user's machine
2. **No Network Calls**: Application never contacts external servers
3. **No Telemetry**: No usage data collection
4. **Secure Storage**: SQLite database in user-specific directory

### 10.2 File Access

1. **Restricted Paths**: Only read from `~/.claude/` directory
2. **Path Validation**: Reject path traversal attempts
3. **Read-only Access**: Never modify Claude Code session files

### 10.3 Sensitive Data Handling

1. **Redaction**: Redact API keys, tokens, passwords in tool outputs
2. **Filtering**: Filter sensitive file patterns (`.env`, credentials)
3. **Truncation**: Limit displayed content length

### 10.4 Application Security

1. **CSP**: Strict Content Security Policy
2. **Sandboxing**: Tauri's native sandboxing
3. **Updates**: Signed auto-updates only

---

## 11. Appendices

### Appendix A: JSONL Entry Types Reference

| Type | Description | Key Fields |
|------|-------------|------------|
| `user` | User input | `message.content`, `timestamp` |
| `assistant` | Claude response | `message.usage`, `message.content`, `stop_reason` |
| `progress` | Hook/tool progress | `hookEvent`, `hookName` |
| `summary` | Session summary | `summary`, `leafUuid` |
| `file-history-snapshot` | File state | `snapshot.trackedFileBackups` |

### Appendix B: Pricing Reference (February 2026)

| Model | Input/1M | Output/1M | Cache Write 5m/1M | Cache Write 1h/1M | Cache Read/1M |
|-------|----------|-----------|-------------------|-------------------|---------------|
| Opus 4.5 | $5.00 | $25.00 | $6.25 | $10.00 | $0.50 |
| Sonnet 4.5 | $3.00 | $15.00 | $3.75 | $6.00 | $0.30 |
| Haiku 4.5 | $1.00 | $5.00 | $1.25 | $2.00 | $0.10 |

### Appendix C: Efficiency Score Benchmarks

| Rating | OES Range | CPDU | CpD | CER | SEI |
|--------|-----------|------|-----|-----|-----|
| Excellent | > 0.75 | < $5 | < 10 | > 0.70 | > 0.40 |
| Good | 0.55 - 0.75 | $5 - $15 | 10 - 20 | 0.50 - 0.70 | 0.20 - 0.40 |
| Average | 0.35 - 0.55 | $15 - $30 | 20 - 35 | 0.30 - 0.50 | 0.10 - 0.20 |
| Needs Improvement | < 0.35 | > $30 | > 35 | < 0.30 | < 0.10 |

### Appendix D: File Paths

| Platform | Claude Sessions Path |
|----------|---------------------|
| macOS | `~/Library/Application Support/Claude/projects/` or `~/.claude/projects/` |
| Linux | `~/.claude/projects/` |
| Windows | `%APPDATA%\Claude\projects\` |

### Appendix E: Glossary

| Term | Definition |
|------|------------|
| **Cycle** | User prompt to assistant completion (stop_reason: end_turn) |
| **Turn** | Same as cycle |
| **Deliverable Unit (DU)** | Normalized output measure (1 PR = 3-5 DU) |
| **OES** | Overall Efficiency Score (0.0 - 1.0) |
| **CER** | Cache Efficiency Ratio |
| **CGR** | Context Growth Rate |
| **SEI** | Subagent Efficiency Index |
| **WFS** | Workflow Friction Score |
| **CPDU** | Cost Per Deliverable Unit |
| **CpD** | Cycles per Deliverable |

---

**Document Status:** Draft
**Review Required:** Architecture Team, Security Team
**Next Steps:** Phase 1 implementation kickoff after review approval

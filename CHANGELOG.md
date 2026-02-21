# Changelog

All notable changes to Ironhide will be documented in this file.

## [0.3.0] - 2026-02-21

### Performance Improvements
- DB-first SQL aggregate queries for dashboard summary, daily metrics, and project metrics -- eliminates JSONL parsing on cold start
- Non-blocking startup: session scan moved to background thread, window appears instantly
- Parallel session preload with 8-permit semaphore for cache misses
- Two-phase preload: Phase 1 (500 recent sessions for instant dashboard), Phase 2 (all remaining sessions in background)
- DB-first session list queries for Timeline and session list pages
- Trends page rewired to use fast SQL-backed daily metrics instead of slow JSONL parsing

### CI/CD Pipeline
- Fixed release.yml: corrected rust-toolchain action name, removed invalid paths, added test gate job
- New ci.yml workflow with lint+typecheck, rust-tests, and frontend-build jobs
- Added typecheck, test:e2e, and test:rust scripts to package.json

### Dashboard & Analytics Fixes
- Time range filtering (7d/30d/90d/All) now works correctly across Dashboard, Timeline, and Trends pages
- Fixed efficiency score: uses global CER (weighted by actual cache usage) instead of per-session average
- "All" time range shows full date range from earliest session
- Sticky header on all pages
- Educational description below efficiency gauge explaining CER values

### Trends Page
- Efficiency Over Time chart now shows real per-day CER values
- Sessions Per Day chart splits into user sessions (bars, left axis) and subagent sessions (line, right axis)
- Summary cards show user/subagent session breakdown

### Data Consistency
- Dashboard and Timeline summary cards use the same backend aggregates
- Daily metrics include user vs subagent session counts
- SQL date filtering uses robust `substr(started_at, 1, 10)` with `LIKE '20%'` guard

## [0.2.0] - 2025-01-01

### Added
- Persistent session caching and Playwright E2E test suite
- Project-oriented sessions and Gantt timeline
- Metrics accuracy fixes
- Tauri desktop app for Claude Code Analytics
- Major improvements to analytics dashboard

import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3100';
const DASHBOARD_BASE = 'http://127.0.0.1:3001';

test.setTimeout(180000); // 3 minute timeout

test.describe('Chart Diagnostics', () => {
  test('diagnose why Token Usage and Cost charts are empty', async ({ page, request }) => {
    // Get a session using API request context directly
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;
    console.log('Testing session:', sessionId);

    // Capture all console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 60000 });

    // Wait for the main content to load - look for specific elements
    console.log('Waiting for page to load...');

    // Wait for the tabs to appear (indicates session data loaded)
    await page.waitForSelector('[role="tab"]', { timeout: 30000 });
    console.log('Tabs found');

    // Wait for any loading states to finish - wait for recharts or specific content
    // Wait for either a chart wrapper OR a skeleton to disappear
    try {
      await page.waitForSelector('.recharts-wrapper', { timeout: 20000 });
      console.log('Recharts wrapper found on overview page');
    } catch (e) {
      console.log('No recharts wrapper on initial load, checking for loading states...');
      // Wait for skeleton loaders to finish
      await page.waitForTimeout(5000);
    }

    // Click Charts tab
    const chartsTab = page.locator('[role="tab"]').filter({ hasText: /charts/i });
    const tabCount = await chartsTab.count();
    console.log('Charts tab count:', tabCount);

    if (tabCount > 0) {
      console.log('Clicking Charts tab...');
      await chartsTab.first().click();

      // Wait for charts to render
      try {
        await page.waitForSelector('.recharts-wrapper', { timeout: 30000 });
        console.log('Recharts wrapper found after clicking Charts tab');
      } catch (e) {
        console.log('No recharts wrapper found after clicking Charts tab');
      }

      await page.waitForTimeout(3000);
    } else {
      console.log('Charts tab not found!');
      // Log all tabs
      const allTabs = await page.locator('[role="tab"]').allTextContents();
      console.log('Available tabs:', allTabs);
    }

    // Take screenshot at this point
    await page.screenshot({ path: 'test-results/chart-diagnostics.png', fullPage: true });

    // Get detailed info about each Recharts wrapper
    const chartDiagnostics = await page.evaluate(() => {
      const wrappers = document.querySelectorAll('.recharts-wrapper');
      const results: any[] = [];

      wrappers.forEach((wrapper, idx) => {
        const parent = wrapper.closest('[class*="Card"]');
        const title = parent?.querySelector('[class*="CardTitle"]')?.textContent || `Chart ${idx}`;

        // Get SVG details
        const svg = wrapper.querySelector('svg.recharts-surface');
        const viewBox = svg?.getAttribute('viewBox');

        // Check for Line elements
        const lineGroups = wrapper.querySelectorAll('.recharts-line');
        const lineDetails: any[] = [];

        lineGroups.forEach((lineGroup, lineIdx) => {
          const path = lineGroup.querySelector('path.recharts-line-curve');
          const d = path?.getAttribute('d');
          const stroke = path ? window.getComputedStyle(path).stroke : null;
          const strokeWidth = path ? window.getComputedStyle(path).strokeWidth : null;

          lineDetails.push({
            index: lineIdx,
            hasPath: !!path,
            dLength: d?.length || 0,
            dPreview: d?.substring(0, 100) || null,
            stroke,
            strokeWidth,
            hasValidCoords: d && d.length > 10 && !d.match(/^M\d+,\d+$/),
          });
        });

        // Check for Y-axis
        const yAxis = wrapper.querySelector('.recharts-yAxis');
        const yAxisTicks = wrapper.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value');
        const yAxisTickValues = Array.from(yAxisTicks).map(t => t.textContent);

        // Check for X-axis
        const xAxisTicks = wrapper.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value');
        const xAxisTickValues = Array.from(xAxisTicks).map(t => t.textContent);

        // Check bar elements
        const bars = wrapper.querySelectorAll('.recharts-bar-rectangle');

        // Check for Legend
        const legendItems = wrapper.querySelectorAll('.recharts-legend-item');
        const legendTexts = Array.from(legendItems).map(item => item.textContent);

        results.push({
          title,
          svgViewBox: viewBox,
          xAxisTickCount: xAxisTickValues.length,
          yAxis: {
            tickCount: yAxisTickValues.length,
            ticks: yAxisTickValues,
          },
          lines: {
            count: lineGroups.length,
            details: lineDetails,
          },
          bars: bars.length,
          legendItems: legendTexts,
        });
      });

      return results;
    });

    console.log('\n=== CHART DIAGNOSTICS ===');
    console.log('Total chart wrappers found:', chartDiagnostics.length);

    chartDiagnostics.forEach((chart, idx) => {
      console.log(`\n--- Chart ${idx + 1}: ${chart.title} ---`);
      console.log('SVG ViewBox:', chart.svgViewBox);
      console.log('X-Axis ticks:', chart.xAxisTickCount);
      console.log('Y-Axis ticks:', chart.yAxis.tickCount, chart.yAxis.ticks.join(', '));
      console.log('Lines:', chart.lines.count);
      if (chart.lines.details.length > 0) {
        chart.lines.details.forEach((line: any, i: number) => {
          console.log(`  Line ${i}: hasPath=${line.hasPath}, stroke=${line.stroke}, dLength=${line.dLength}`);
        });
      }
      console.log('Bars:', chart.bars);
      console.log('Legend:', chart.legendItems.join(', '));
    });

    // Print relevant console logs
    console.log('\n=== BROWSER CONSOLE (chart related) ===');
    consoleLogs
      .filter(log =>
        log.includes('TokenUsageChart') ||
        log.includes('CostChart') ||
        log.includes('[SessionPage]')
      )
      .forEach(log => console.log(log));

    // Specific analysis for Token Usage and Cost charts
    const tokenChart = chartDiagnostics.find(c => c.title.toLowerCase().includes('token'));
    const costChart = chartDiagnostics.find(c => c.title.toLowerCase().includes('cost'));

    if (tokenChart) {
      console.log('\n=== TOKEN USAGE CHART ANALYSIS ===');
      console.log('Line count:', tokenChart.lines.count);
      console.log('Y-Axis tick count:', tokenChart.yAxis.tickCount);

      if (tokenChart.lines.count === 0) {
        console.log('PROBLEM: No line elements in Token Usage chart');
      } else if (tokenChart.lines.details.every((l: any) => !l.hasValidCoords)) {
        console.log('PROBLEM: Line elements exist but have no valid path coordinates');
      }
    } else {
      console.log('\n=== TOKEN USAGE CHART NOT FOUND ===');
    }

    if (costChart) {
      console.log('\n=== COST CHART ANALYSIS ===');
      console.log('Line count:', costChart.lines.count);
      console.log('Y-Axis tick count:', costChart.yAxis.tickCount);
    } else {
      console.log('\n=== COST CHART NOT FOUND ===');
    }
  });

  test('fetch and analyze API data', async ({ request }) => {
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;

    console.log('Fetching metrics for session:', sessionId);
    const metricsRes = await request.get(`${API_BASE}/api/sessions/${sessionId}/metrics`);
    const metrics = await metricsRes.json();

    console.log('\n=== RAW METRICS DATA ===');
    console.log('Turn metrics count:', metrics.turnMetrics?.length || 0);

    if (metrics.turnMetrics?.length > 0) {
      // Show first 3 turns
      console.log('\nFirst 3 turns token data:');
      metrics.turnMetrics.slice(0, 3).forEach((m: any, i: number) => {
        console.log(`Turn ${m.turnNumber}:`, {
          'tokens.input': m.tokens?.input,
          'tokens.output': m.tokens?.output,
          'tokens.cacheCreation': m.tokens?.cacheCreation,
          'tokens.cacheRead': m.tokens?.cacheRead,
          'tokens.total': m.tokens?.total,
        });
      });

      console.log('\nFirst 3 turns cost data:');
      metrics.turnMetrics.slice(0, 3).forEach((m: any, i: number) => {
        console.log(`Turn ${m.turnNumber}:`, {
          'cost.input': m.cost?.input,
          'cost.output': m.cost?.output,
          'cost.cacheCreation': m.cost?.cacheCreation,
          'cost.total': m.cost?.total,
        });
      });

      // Check the breakdown visibility issue
      console.log('\n=== BREAKDOWN VISIBILITY ANALYSIS ===');

      const inputSum = metrics.turnMetrics.reduce((sum: number, m: any) => sum + (m.tokens?.input || 0), 0);
      const outputSum = metrics.turnMetrics.reduce((sum: number, m: any) => sum + (m.tokens?.output || 0), 0);
      const cacheReadSum = metrics.turnMetrics.reduce((sum: number, m: any) => sum + (m.tokens?.cacheRead || 0), 0);
      const cacheCreationSum = metrics.turnMetrics.reduce((sum: number, m: any) => sum + (m.tokens?.cacheCreation || 0), 0);
      const totalSum = metrics.turnMetrics.reduce((sum: number, m: any) => sum + (m.tokens?.total || 0), 0);

      console.log('Token totals across all turns:');
      console.log('  input:', inputSum);
      console.log('  output:', outputSum);
      console.log('  cacheRead:', cacheReadSum);
      console.log('  cacheCreation:', cacheCreationSum);
      console.log('  total:', totalSum);

      // The breakdown shows: input, output, cacheRead
      // It does NOT show: cacheCreation
      // But total = input + output + cacheCreation + cacheRead
      const breakdownSum = inputSum + outputSum + cacheReadSum;
      console.log('\nBreakdown sum (input + output + cacheRead):', breakdownSum);
      console.log('This is what the chart shows in breakdown mode');

      if (breakdownSum < totalSum * 0.1) {
        console.log('\n*** ISSUE: Breakdown fields are less than 10% of total! ***');
        console.log('cacheCreation makes up', ((cacheCreationSum / totalSum) * 100).toFixed(1), '% of total');
        console.log('cacheRead makes up', ((cacheReadSum / totalSum) * 100).toFixed(1), '% of total');
        console.log('input+output only make up', (((inputSum + outputSum) / totalSum) * 100).toFixed(1), '% of total');
      }
    }
  });
});

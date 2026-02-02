import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3100';
const DASHBOARD_BASE = 'http://127.0.0.1:3001';

test.describe('Chart Debugging', () => {
  test('capture API response for sessions', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/sessions`);
    const data = await response.json();
    console.log('Sessions API response:');
    console.log(JSON.stringify(data, null, 2).slice(0, 3000));
    expect(data.sessions).toBeDefined();
  });

  test('capture metrics API for first session', async ({ request }) => {
    // Get sessions
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();

    expect(sessions.sessions.length).toBeGreaterThan(0);

    const sessionId = sessions.sessions[0].id;
    console.log('Testing session:', sessionId);

    // Get metrics
    const metricsRes = await request.get(`${API_BASE}/api/sessions/${sessionId}/metrics`);
    const metrics = await metricsRes.json();

    console.log('Metrics response keys:', Object.keys(metrics));
    console.log('turnMetrics count:', metrics.turnMetrics?.length);

    if (metrics.turnMetrics?.length > 0) {
      console.log('\nFirst turnMetric:');
      console.log(JSON.stringify(metrics.turnMetrics[0], null, 2));

      console.log('\nSample turnMetrics (first 5):');
      console.log(JSON.stringify(metrics.turnMetrics.slice(0, 5), null, 2));

      // Check token values
      const tokensExist = metrics.turnMetrics.some((m: any) => {
        const hasTokens = m.tokens?.total > 0 || m.inputTokens > 0 || m.outputTokens > 0;
        return hasTokens;
      });
      console.log('\nAny non-zero tokens?', tokensExist);

      // Check cost values
      const costsExist = metrics.turnMetrics.some((m: any) => {
        const hasCost = m.cost?.total > 0 || m.costUsd > 0;
        return hasCost;
      });
      console.log('Any non-zero costs?', costsExist);

      // Log all keys from first turnMetric
      console.log('\nAll keys in turnMetric[0]:', Object.keys(metrics.turnMetrics[0]));

      // Check structure
      const sample = metrics.turnMetrics[0];
      console.log('\nToken-related fields:');
      console.log('  tokens:', sample.tokens);
      console.log('  inputTokens:', sample.inputTokens);
      console.log('  outputTokens:', sample.outputTokens);
      console.log('  cacheCreationInputTokens:', sample.cacheCreationInputTokens);
      console.log('  cacheReadInputTokens:', sample.cacheReadInputTokens);

      console.log('\nCost-related fields:');
      console.log('  cost:', sample.cost);
      console.log('  costUsd:', sample.costUsd);
    }
  });

  test('view session page and check charts tab', async ({ page }) => {
    // Go directly to a session page
    const sessionsRes = await page.request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;

    // Set up console logging
    page.on('console', msg => {
      if (msg.text().includes('[TokenUsageChart]') ||
          msg.text().includes('[CostChart]') ||
          msg.text().includes('[SessionPage]')) {
        console.log('Browser console:', msg.text());
      }
    });

    await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 30000 });

    // Wait for page content
    await page.waitForSelector('main', { timeout: 10000 });

    // Wait a bit for data to load
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/01-session-overview.png', fullPage: true });

    // Find the tabs - look for the TabsTrigger with "Charts" or "charts"
    const allTabTriggers = page.locator('[role="tab"]');
    const triggerCount = await allTabTriggers.count();
    console.log('Tab triggers found:', triggerCount);

    // Get text of all tabs
    for (let i = 0; i < triggerCount; i++) {
      const text = await allTabTriggers.nth(i).textContent();
      console.log(`Tab ${i}:`, text);
    }

    // Click the Charts tab
    const chartsTab = page.locator('[role="tab"]').filter({ hasText: /charts/i });
    if (await chartsTab.count() > 0) {
      console.log('Found Charts tab, clicking...');
      await chartsTab.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/02-charts-tab.png', fullPage: true });

      // Check for Recharts
      const rechartsWrappers = await page.locator('.recharts-wrapper').count();
      console.log('Recharts wrapper count:', rechartsWrappers);

      // Check for SVG elements
      const svgCount = await page.locator('svg.recharts-surface').count();
      console.log('Recharts SVG count:', svgCount);

      // Check for actual chart lines/bars/areas
      const lineCount = await page.locator('.recharts-line').count();
      const barCount = await page.locator('.recharts-bar-rectangle').count();
      const areaCount = await page.locator('.recharts-area').count();
      console.log('Chart elements - Lines:', lineCount, 'Bars:', barCount, 'Areas:', areaCount);

      // Check for path elements (the actual drawn lines)
      const pathCount = await page.locator('.recharts-line path.recharts-line-curve').count();
      console.log('Line curve paths:', pathCount);

      // Check for "no data" messages
      const noDataMessages = await page.locator('text=/no.*data|empty|unavailable/i').count();
      console.log('No data messages found:', noDataMessages);

      // Check the actual text content of the page for clues
      const mainContent = await page.locator('main').textContent();
      if (mainContent?.includes('No turn data')) {
        console.log('WARNING: Page says "No turn data available"');
      }

    } else {
      console.log('Charts tab not found');
      // List all buttons/tabs
      const buttons = await page.locator('button, [role="tab"]').allTextContents();
      console.log('Available buttons/tabs:', buttons);
    }
  });

  test('debug chart data and rendering in browser', async ({ page }) => {
    const sessionsRes = await page.request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;

    // Set up console logging for chart debugging
    page.on('console', msg => {
      if (msg.text().includes('[TokenUsageChart]') ||
          msg.text().includes('[CostChart]') ||
          msg.text().includes('[SessionPage]')) {
        console.log('Browser:', msg.text());
      }
    });

    await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 30000 });
    await page.waitForSelector('main', { timeout: 10000 });

    // Wait for data to load
    await page.waitForTimeout(3000);

    // Go to Charts tab
    const chartsTab = page.locator('[role="tab"]').filter({ hasText: /charts/i });
    if (await chartsTab.count() > 0) {
      await chartsTab.first().click();
      await page.waitForTimeout(2000);
    }

    // Evaluate in browser to understand chart state
    const chartInfo = await page.evaluate(() => {
      const wrappers = document.querySelectorAll('.recharts-wrapper');
      const info: any[] = [];

      wrappers.forEach((wrapper, idx) => {
        const parent = wrapper.closest('[class*="card"], [class*="Card"]');
        const title = parent?.querySelector('h3, [class*="title"], [class*="Title"], [class*="CardTitle"]')?.textContent;

        const svg = wrapper.querySelector('svg');
        const lines = wrapper.querySelectorAll('.recharts-line path');
        const bars = wrapper.querySelectorAll('.recharts-bar-rectangle');
        const areas = wrapper.querySelectorAll('.recharts-area-curve');
        const dots = wrapper.querySelectorAll('.recharts-dot');
        const xAxisTicks = wrapper.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick');
        const yAxisTicks = wrapper.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick');

        // Check if there are any visible paths with d attribute
        let hasVisiblePath = false;
        lines.forEach(path => {
          const d = path.getAttribute('d');
          if (d && d.length > 10) hasVisiblePath = true;
        });

        info.push({
          index: idx,
          title: title || 'unknown',
          svgWidth: svg?.getAttribute('width'),
          svgHeight: svg?.getAttribute('height'),
          lineCount: lines.length,
          barCount: bars.length,
          areaCount: areas.length,
          dotCount: dots.length,
          xAxisTickCount: xAxisTicks.length,
          yAxisTickCount: yAxisTicks.length,
          hasVisiblePath,
          hasContent: lines.length > 0 || bars.length > 0 || areas.length > 0
        });
      });

      return info;
    });

    console.log('\nChart wrapper analysis:');
    console.log(JSON.stringify(chartInfo, null, 2));
  });

  test('test chart expand modal', async ({ page }) => {
    const sessionsRes = await page.request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;

    await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 30000 });
    await page.waitForSelector('main', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Go to Charts tab
    const chartsTab = page.locator('[role="tab"]').filter({ hasText: /charts/i });
    if (await chartsTab.count() > 0) {
      await chartsTab.first().click();
      await page.waitForTimeout(2000);
    }

    // Find expand buttons - look for the Maximize2 icon
    const expandButtons = page.locator('button').filter({ has: page.locator('svg.lucide-maximize2') });
    const expandCount = await expandButtons.count();
    console.log('Expand buttons found (Maximize2):', expandCount);

    if (expandCount > 0) {
      // Click the first expand button
      await expandButtons.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/03-expanded-modal.png', fullPage: true });

      // Check for dialog/modal
      const dialog = page.locator('[role="dialog"]');
      const isDialogVisible = await dialog.isVisible();
      console.log('Dialog visible:', isDialogVisible);

      if (isDialogVisible) {
        const modalCharts = await dialog.locator('.recharts-wrapper').count();
        console.log('Charts in modal:', modalCharts);

        const modalContent = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return { found: false };

          const wrapper = dialog.querySelector('.recharts-wrapper');
          if (!wrapper) return { found: true, hasWrapper: false };

          const svg = wrapper.querySelector('svg');
          const lines = wrapper.querySelectorAll('.recharts-line path');

          // Check for brush element
          const brush = wrapper.querySelector('.recharts-brush');

          return {
            found: true,
            hasWrapper: true,
            svgWidth: svg?.getAttribute('width'),
            svgHeight: svg?.getAttribute('height'),
            lineCount: lines.length,
            areaCount: wrapper.querySelectorAll('.recharts-area').length,
            hasBrush: !!brush
          };
        });
        console.log('Modal chart content:', modalContent);
      }
    } else {
      // Try alternative selector
      const altExpandButtons = page.locator('button[aria-label="Expand chart"]');
      const altCount = await altExpandButtons.count();
      console.log('Alt expand buttons found:', altCount);
    }
  });

  test('verify overview page charts render', async ({ page }) => {
    const sessionsRes = await page.request.get(`${API_BASE}/api/sessions`);
    const sessions = await sessionsRes.json();
    const sessionId = sessions.sessions[0].id;

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[TokenUsageChart]') || text.includes('[CostChart]')) {
        console.log('Browser:', text);
      }
    });

    await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 30000 });
    await page.waitForSelector('main', { timeout: 10000 });

    // The overview tab is the default - wait longer for data
    await page.waitForTimeout(4000);

    // Check for recharts on the overview tab (it also has charts)
    const rechartsWrappers = await page.locator('.recharts-wrapper').count();
    console.log('Recharts wrappers on Overview:', rechartsWrappers);

    // Verify the page has loaded turn data
    const chartInfo = await page.evaluate(() => {
      const wrappers = document.querySelectorAll('.recharts-wrapper');
      return {
        wrapperCount: wrappers.length,
        wrappers: Array.from(wrappers).map((w, i) => {
          const parent = w.closest('[class*="Card"]');
          const title = parent?.querySelector('[class*="CardTitle"]')?.textContent || `Chart ${i}`;
          const svg = w.querySelector('svg');
          const lines = w.querySelectorAll('.recharts-line');
          return {
            title,
            svgSize: svg ? `${svg.getAttribute('width')}x${svg.getAttribute('height')}` : 'no svg',
            lineCount: lines.length
          };
        })
      };
    });

    console.log('Overview chart info:', JSON.stringify(chartInfo, null, 2));
    await page.screenshot({ path: 'test-results/04-overview-charts.png', fullPage: true });
  });
});

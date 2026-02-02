import { test, expect } from '@playwright/test';

test.describe('Chart Debugging', () => {
  test('inspect token and cost charts data', async ({ page }) => {
    // Collect console logs
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate to dashboard
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // Take initial screenshot
    await page.screenshot({ path: 'debug-initial.png', fullPage: true });

    // Check if sessions exist in sidebar
    const sidebarLinks = page.locator('a[href^="/session/"]');
    const sessionCount = await sidebarLinks.count();
    console.log(`Found ${sessionCount} session links in sidebar`);

    if (sessionCount > 0) {
      // Click first session
      await sidebarLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Give charts time to render

      // Take screenshot after loading session
      await page.screenshot({ path: 'debug-session.png', fullPage: true });

      // Check for chart elements
      const chartCards = page.locator('.recharts-wrapper');
      const chartCount = await chartCards.count();
      console.log(`Found ${chartCount} recharts wrappers`);

      // Check for lines in charts
      const chartLines = page.locator('.recharts-line');
      const lineCount = await chartLines.count();
      console.log(`Found ${lineCount} chart lines`);

      // Check for areas in charts
      const chartAreas = page.locator('.recharts-area');
      const areaCount = await chartAreas.count();
      console.log(`Found ${areaCount} chart areas`);

      // Navigate to Charts tab
      const chartsTab = page.locator('button:has-text("Charts")');
      if (await chartsTab.count() > 0) {
        await chartsTab.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'debug-charts-tab.png', fullPage: true });

        // Check chart lines again
        const chartLinesAfter = page.locator('.recharts-line');
        const lineCountAfter = await chartLinesAfter.count();
        console.log(`After switching to Charts tab: ${lineCountAfter} chart lines`);
      }

      // Try to expand first chart
      const expandButtons = page.locator('button[aria-label="Expand chart"]');
      if (await expandButtons.count() > 0) {
        await expandButtons.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'debug-expanded.png', fullPage: true });

        // Check if chart is visible in modal
        const modalChart = page.locator('[role="dialog"] .recharts-wrapper');
        const modalChartCount = await modalChart.count();
        console.log(`Charts in modal: ${modalChartCount}`);

        // Check modal dimensions
        const modalContent = page.locator('[role="dialog"]');
        if (await modalContent.count() > 0) {
          const box = await modalContent.boundingBox();
          console.log(`Modal dimensions: ${box?.width}x${box?.height}`);
        }
      }

      // Print console logs
      console.log('\n=== Console Logs ===');
      for (const log of logs) {
        if (log.includes('TokenUsageChart') || log.includes('CostChart') || log.includes('turnMetrics')) {
          console.log(log);
        }
      }
    }
  });

  test('check API data structure', async ({ page }) => {
    // Navigate directly to API
    const sessionsResponse = await page.request.get('http://localhost:3100/api/sessions');
    const sessionsData = await sessionsResponse.json();
    console.log('Sessions:', JSON.stringify(sessionsData, null, 2).slice(0, 500));

    if (sessionsData.sessions?.length > 0) {
      const sessionId = sessionsData.sessions[0].id;
      const metricsResponse = await page.request.get(`http://localhost:3100/api/sessions/${sessionId}/metrics`);
      const metricsData = await metricsResponse.json();

      console.log('\n=== First Turn Metrics ===');
      if (metricsData.turnMetrics?.[0]) {
        const firstTurn = metricsData.turnMetrics[0];
        console.log('turnNumber:', firstTurn.turnNumber);
        console.log('tokens:', JSON.stringify(firstTurn.tokens));
        console.log('cost:', JSON.stringify(firstTurn.cost));
        console.log('durationMs:', firstTurn.durationMs);
      }
    }
  });
});

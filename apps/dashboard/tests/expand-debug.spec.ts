import { test, expect } from '@playwright/test';

test.describe('Chart Expand Debug', () => {
  test('test expand functionality', async ({ page }) => {
    // First verify API is working
    const apiRes = await page.request.get('http://localhost:3100/api/sessions');
    expect(apiRes.ok()).toBe(true);
    const apiData = await apiRes.json();
    const sessionId = apiData.sessions[0].id;
    console.log('Using session:', sessionId);

    // Capture console logs
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate to session page
    await page.goto(`http://localhost:3001/session/${sessionId}`);
    await page.waitForTimeout(8000); // Wait for data to load

    // Take overview screenshot
    await page.screenshot({ path: 'expand-1-overview.png', fullPage: true });

    // Find expand buttons
    const expandButtons = page.locator('button[aria-label="Expand chart"]');
    const expandCount = await expandButtons.count();
    console.log('Expand buttons found:', expandCount);

    if (expandCount > 0) {
      // Click the first expand button (Token Usage chart)
      console.log('Clicking first expand button...');
      await expandButtons.first().click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'expand-2-modal.png', fullPage: true });

      // Check if modal is visible
      const dialog = page.locator('[role="dialog"]');
      const dialogVisible = await dialog.isVisible();
      console.log('Modal dialog visible:', dialogVisible);

      if (dialogVisible) {
        // Check modal dimensions
        const box = await dialog.boundingBox();
        console.log('Modal dimensions:', box?.width, 'x', box?.height);

        // Check for recharts in modal
        const modalCharts = page.locator('[role="dialog"] .recharts-wrapper');
        const modalChartCount = await modalCharts.count();
        console.log('Charts in modal:', modalChartCount);

        // Check for chart lines in modal
        const modalLines = page.locator('[role="dialog"] .recharts-line');
        const modalLineCount = await modalLines.count();
        console.log('Lines in modal:', modalLineCount);

        // Check for brush component (zoom)
        const brushes = page.locator('[role="dialog"] .recharts-brush');
        const brushCount = await brushes.count();
        console.log('Brush (zoom) components in modal:', brushCount);

        // Check the modal content div dimensions
        const modalContent = page.locator('[role="dialog"] > div:last-child > div:last-child');
        const contentBox = await modalContent.boundingBox();
        console.log('Modal content dimensions:', contentBox?.width, 'x', contentBox?.height);
      }

      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Now navigate to Charts tab
    console.log('\nNavigating to Charts tab...');
    const chartsTab = page.locator('button:has-text("Charts")');
    await chartsTab.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'expand-3-charts-tab.png', fullPage: true });

    // Check charts on Charts tab
    const chartsTabCharts = page.locator('.recharts-wrapper');
    const chartsTabChartCount = await chartsTabCharts.count();
    console.log('Charts on Charts tab:', chartsTabChartCount);

    // Try expand on Charts tab
    const expandButtonsCharts = page.locator('button[aria-label="Expand chart"]');
    const expandCountCharts = await expandButtonsCharts.count();
    console.log('Expand buttons on Charts tab:', expandCountCharts);

    if (expandCountCharts > 0) {
      await expandButtonsCharts.first().click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'expand-4-modal-charts-tab.png', fullPage: true });

      const dialogCharts = page.locator('[role="dialog"]');
      const dialogVisibleCharts = await dialogCharts.isVisible();
      console.log('Modal visible on Charts tab:', dialogVisibleCharts);

      if (dialogVisibleCharts) {
        const boxCharts = await dialogCharts.boundingBox();
        console.log('Modal dimensions on Charts tab:', boxCharts?.width, 'x', boxCharts?.height);

        const modalChartsCharts = page.locator('[role="dialog"] .recharts-wrapper');
        const modalChartCountCharts = await modalChartsCharts.count();
        console.log('Charts in modal on Charts tab:', modalChartCountCharts);
      }
    }

    // Print console logs
    console.log('\n=== Console Logs ===');
    for (const log of logs) {
      console.log(log);
    }
  });
});

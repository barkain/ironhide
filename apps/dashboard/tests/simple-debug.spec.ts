import { test, expect } from '@playwright/test';

test.describe('Simple Chart Debug', () => {
  test('capture dashboard with charts', async ({ page }) => {
    // First verify API is working
    const apiRes = await page.request.get('http://localhost:3100/api/sessions');
    expect(apiRes.ok()).toBe(true);
    const apiData = await apiRes.json();
    console.log('Sessions found:', apiData.sessions.length);

    const sessionId = apiData.sessions[0].id;
    console.log('Using session:', sessionId);

    // Capture console logs
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate to session page
    await page.goto(`http://localhost:3001/session/${sessionId}`);

    // Wait for specific content to appear
    await page.waitForSelector('[data-testid="metric-card"], .recharts-wrapper, h1', { timeout: 30000 }).catch(() => {
      console.log('Could not find expected elements');
    });

    await page.waitForTimeout(5000); // Extra time for charts

    // Take screenshot
    await page.screenshot({ path: 'debug-overview.png', fullPage: true });

    // Check for chart elements
    const rechartsWrappers = page.locator('.recharts-wrapper');
    const wrapperCount = await rechartsWrappers.count();
    console.log('Found recharts wrappers:', wrapperCount);

    // Check for specific chart elements
    const chartLines = page.locator('.recharts-line path');
    const lineCount = await chartLines.count();
    console.log('Found chart lines:', lineCount);

    // Check for cartesian grid (indicates chart rendered)
    const grids = page.locator('.recharts-cartesian-grid');
    const gridCount = await grids.count();
    console.log('Found cartesian grids:', gridCount);

    // Check if main content loaded
    const mainContent = await page.locator('main').innerHTML();
    console.log('Main content length:', mainContent.length);

    // Check for skeletons (loading state)
    const skeletons = page.locator('[class*="skeleton"]');
    const skeletonCount = await skeletons.count();
    console.log('Skeleton elements:', skeletonCount);

    // Check if there are cards with data
    const metricCards = page.locator('[class*="card"]');
    const cardCount = await metricCards.count();
    console.log('Cards found:', cardCount);

    // Print relevant console logs
    console.log('\n=== Relevant Console Logs ===');
    for (const log of logs) {
      if (log.includes('Chart') || log.includes('token') || log.includes('Token') || log.includes('cost') || log.includes('metric') || log.includes('error') || log.includes('warn') || log.includes('Error')) {
        console.log(log);
      }
    }

    // Print ALL console logs for debugging
    console.log('\n=== ALL Console Logs ===');
    for (const log of logs) {
      console.log(log);
    }
  });
});

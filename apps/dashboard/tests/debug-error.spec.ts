import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3100';
const DASHBOARD_BASE = 'http://127.0.0.1:3001';

test('capture all browser errors and console messages', async ({ page }) => {
  const errors: string[] = [];
  const consoleMessages: string[] = [];

  // Capture all console messages
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    errors.push(`[PageError] ${error.message}\n${error.stack}`);
  });

  // Capture failed requests
  page.on('requestfailed', request => {
    errors.push(`[RequestFailed] ${request.url()} - ${request.failure()?.errorText}`);
  });

  const sessionsRes = await page.request.get(`${API_BASE}/api/sessions`);
  const sessions = await sessionsRes.json();
  const sessionId = sessions.sessions[0].id;

  // Navigate to session page
  await page.goto(`${DASHBOARD_BASE}/session/${sessionId}`, { timeout: 30000 });

  // Wait for page to settle
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/debug-error.png', fullPage: true });

  // Click on the "1 Issue" button if it exists to see the error
  const issueButton = page.locator('button:has-text("Issue")');
  if (await issueButton.count() > 0) {
    await issueButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/debug-error-details.png', fullPage: true });

    // Try to get error text from any error overlay
    const errorOverlay = page.locator('[class*="error"], [class*="Error"], [role="alert"]');
    if (await errorOverlay.count() > 0) {
      const errorText = await errorOverlay.allTextContents();
      console.log('Error overlay content:', errorText);
    }
  }

  // Print all console messages
  console.log('\n=== Console Messages ===');
  consoleMessages.forEach(msg => console.log(msg));

  console.log('\n=== Errors ===');
  errors.forEach(err => console.log(err));

  // Check network requests for API calls
  console.log('\n=== Checking API connectivity ===');
  const apiCheck = await page.request.get(`${API_BASE}/api/sessions/${sessionId}`);
  console.log('Session API status:', apiCheck.status());

  const metricsCheck = await page.request.get(`${API_BASE}/api/sessions/${sessionId}/metrics`);
  console.log('Metrics API status:', metricsCheck.status());
});

test('check if page renders without session navigation', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`[PageError] ${error.message}`);
  });

  // Just go to homepage
  await page.goto(DASHBOARD_BASE, { timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'test-results/debug-homepage.png', fullPage: true });

  console.log('Homepage errors:', errors);

  // Check if sessions list loads
  const sessionItems = await page.locator('a[href*="/session/"]').count();
  console.log('Session links found:', sessionItems);
});

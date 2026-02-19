import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/');
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load dashboard page', async ({ page }) => {
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('should display summary stat cards', async ({ page }) => {
    // Check for stat cards - they should render even with loading state
    const statCardTitles = ['Total Cost', 'Total Turns', 'Total Tokens', 'Active Projects'];

    for (const title of statCardTitles) {
      await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should render token chart section', async ({ page }) => {
    // Look for the token chart card
    await expect(page.locator('text=Token Usage').first()).toBeVisible({ timeout: 10000 });
  });

  test('should render cost chart section', async ({ page }) => {
    // Look for the cost chart card
    await expect(page.locator('text=Cost by Project').first()).toBeVisible({ timeout: 10000 });
  });

  test('should render efficiency gauge section', async ({ page }) => {
    // Look for the efficiency gauge
    await expect(page.locator('text=Avg Efficiency Score').first()).toBeVisible({ timeout: 10000 });
  });

  test('should render recent sessions section', async ({ page }) => {
    // Look for the recent sessions section
    await expect(page.locator('text=Recent Sessions').first()).toBeVisible({ timeout: 10000 });
  });

  test('should render cost efficiency section', async ({ page }) => {
    // Look for cost efficiency section
    await expect(page.locator('text=Cost Efficiency').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Avg Cost/Session').first()).toBeVisible({ timeout: 10000 });
  });

  test('should have no critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate and wait
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Filter out expected errors (like Tauri not being available in browser)
    const criticalErrors = errors.filter(e =>
      !e.includes('__TAURI__') &&
      !e.includes('Failed to load resource') &&
      !e.includes('invoke') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

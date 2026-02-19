import { test, expect } from '@playwright/test';

test.describe('Trends Page', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/trends');
    await page.waitForLoadState('networkidle');
  });

  test('should load trends page', async ({ page }) => {
    await expect(page).toHaveURL('/trends');
    await expect(page.locator('text=Trends').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display date range selector', async ({ page }) => {
    await expect(page.locator('text=Last 7 Days').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Last 30 Days').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Last 90 Days').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Custom').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display summary cards', async ({ page }) => {
    await expect(page.locator('text=Total Cost').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Avg Efficiency').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Total Sessions').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Period').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display chart sections', async ({ page }) => {
    await expect(page.locator('text=Cost Over Time').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Efficiency Over Time').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sessions Per Day').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Token Usage Over Time').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display period comparison section', async ({ page }) => {
    await expect(page.locator('text=Period Comparison').first()).toBeVisible({ timeout: 10000 });
  });

  test('date range selector should be clickable', async ({ page }) => {
    const last7Days = page.locator('button:has-text("Last 7 Days")');
    await expect(last7Days).toBeVisible({ timeout: 10000 });
    await last7Days.click();
    // Button should become active (have different styling)
    await page.waitForTimeout(500);
  });

  test('custom date range should show date inputs when selected', async ({ page }) => {
    const customButton = page.locator('button:has-text("Custom")');
    await expect(customButton).toBeVisible({ timeout: 10000 });
    await customButton.click();
    // Should show date inputs
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('should render without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/trends');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Filter out expected errors
    const criticalErrors = errors.filter(e =>
      !e.includes('__TAURI__') &&
      !e.includes('Failed to load resource') &&
      !e.includes('invoke') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

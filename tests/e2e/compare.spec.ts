import { test, expect } from '@playwright/test';

test.describe('Compare Page', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/compare');
    await page.waitForLoadState('networkidle');
  });

  test('should load compare page', async ({ page }) => {
    await expect(page).toHaveURL('/compare');
    await expect(page.locator('text=Compare Sessions').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display comparison view or selection prompt', async ({ page }) => {
    // Should show either the comparison view or a prompt to select sessions
    const hasComparisonContent = await page.locator('text=Select').first().isVisible().catch(() => false) ||
      await page.locator('text=Compare').first().isVisible().catch(() => false);
    expect(hasComparisonContent).toBeTruthy();
  });

  test('should render without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/compare');
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

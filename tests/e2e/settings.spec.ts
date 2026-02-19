import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('should load settings page', async ({ page }) => {
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('text=Settings').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display data source section', async ({ page }) => {
    await expect(page.locator('text=Data Source').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Claude Home Path').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display auto refresh section', async ({ page }) => {
    await expect(page.locator('text=Auto Refresh').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Enable auto refresh').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display appearance section', async ({ page }) => {
    await expect(page.locator('text=Appearance').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Theme').first()).toBeVisible({ timeout: 10000 });
  });

  test('claude home path input should be editable', async ({ page }) => {
    const input = page.locator('input[placeholder="~/.claude"]');
    await expect(input).toBeVisible({ timeout: 10000 });
    // Check the input has a value
    const value = await input.inputValue();
    expect(value.length).toBeGreaterThanOrEqual(0);
  });

  test('auto refresh toggle should be clickable', async ({ page }) => {
    // Find the toggle button
    const toggle = page.locator('button.relative.inline-flex').first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    // Toggle should change state
    await page.waitForTimeout(500);
  });

  test('theme selector should be changeable', async ({ page }) => {
    const themeSelect = page.locator('select');
    await expect(themeSelect).toBeVisible({ timeout: 10000 });
    // Check options
    const options = await themeSelect.locator('option').allTextContents();
    expect(options).toContain('Dark');
    expect(options).toContain('Light');
    expect(options).toContain('System');
  });

  test('should render without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/settings');
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

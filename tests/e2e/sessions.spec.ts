import { test, expect } from '@playwright/test';

test.describe('Sessions Page', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');
  });

  test('should load sessions page', async ({ page }) => {
    await expect(page).toHaveURL('/sessions');
    await expect(page.locator('text=Sessions').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search sessions"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('should display sort buttons', async ({ page }) => {
    await expect(page.locator('text=Sort by:').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Date")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Cost")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Tokens")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Turns")').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display export button', async ({ page }) => {
    await expect(page.locator('button:has-text("Export")').first()).toBeVisible({ timeout: 10000 });
  });

  test('sort buttons should be clickable', async ({ page }) => {
    const dateButton = page.locator('button:has-text("Date")').first();
    await expect(dateButton).toBeVisible({ timeout: 10000 });
    await dateButton.click();
    // Should toggle sort direction
    await page.waitForTimeout(500);
  });

  test('search input should accept text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search sessions"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('test search');
    await expect(searchInput).toHaveValue('test search');
  });

  test('should show loading state or sessions', async ({ page }) => {
    // Should either show loading skeleton, sessions list, or empty state
    const hasLoadingSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=No sessions found').first().isVisible().catch(() => false);
    const hasSessionsHeader = await page.getByRole('heading', { name: 'Sessions' }).isVisible().catch(() => false);
    // The page should at least render something
    expect(hasLoadingSkeleton || hasEmptyState || hasSessionsHeader).toBeTruthy();
  });
});

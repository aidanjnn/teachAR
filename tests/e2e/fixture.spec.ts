import { expect, test } from '@playwright/test';

test('built fixture replays, preserves missing data, and resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A movement, made visible.' })).toBeVisible();
  await expect(page.locator('#health')).toHaveText('Connected · storage writable');
  await expect(page.locator('canvas')).toHaveAttribute('data-hand-visible', 'true');
  await page.getByRole('button', { name: 'Play motion' }).click();
  await expect(page.getByRole('button', { name: 'Pause motion' })).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole('slider').inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await page.getByRole('button', { name: 'Show tracking gap' }).click();
  await expect(page.locator('#tracking')).toHaveText('Missing — hand hidden');
  await expect(page.locator('canvas')).toHaveAttribute('data-hand-visible', 'false');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveValue('0');
  await expect(page.locator('#tracking')).toHaveText('Tracked');
  await expect(page.locator('canvas')).toHaveAttribute('data-hand-visible', 'true');
  expect(errors).toEqual([]);
});

test('fixture remains usable after a failed health check', async ({ page }) => {
  await page.route('**/api/health', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#health')).toHaveText('Unavailable · start the local server');
  await page.getByRole('button', { name: 'Show tracking gap' }).click();
  await expect(page.locator('#tracking')).toContainText('Missing');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Recheck server' }).click();
  await expect(page.locator('#health')).toContainText('Connected');
});

test('controls fit a narrow screen and support keyboard scrubbing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('slider').focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider')).toHaveValue('2000');
  await expect(page.locator('#time')).toHaveText('2.00 / 2.00 s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

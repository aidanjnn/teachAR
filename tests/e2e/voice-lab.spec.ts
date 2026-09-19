import { expect, test } from '@playwright/test';

// Chromium's fake capture device misbehaves when several contexts call getUserMedia at once,
// so this file runs its tests one after another in a single worker.
test.describe.configure({ mode: 'default' });

test('records narration with the fake microphone and transcribes it in mock mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/voice-lab.html');
  await expect(page.locator('#provider')).toHaveText('AI provider: mock');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('#narration-status')).toHaveText('Recording…');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#narration-status')).toContainText('Recorded');
  await expect(page.locator('#capture-duration')).not.toHaveText('—');
  await expect(page.locator('#capture-offset')).toContainText('ms');
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.getByRole('button', { name: 'Transcribe' }).click();
  await expect(page.locator('#transcript-table tbody tr')).toHaveCount(4);
  await expect(page.locator('#transcript-source')).toHaveText('fixture');
  expect(errors).toEqual([]);
});

test('labels simulated segments with fallback provenance and coaches in text mode', async ({ page }) => {
  await page.goto('/voice-lab.html');
  await page.getByRole('button', { name: 'Use fixture transcript' }).click();
  await page.locator('#segment-count').selectOption('3');
  await page.getByRole('button', { name: 'Generate labels' }).click();
  await expect(page.locator('#labels-table tbody tr')).toHaveCount(3);
  await expect(page.locator('#labels-provenance')).toHaveText('fallback');
  await page.getByRole('button', { name: 'Connect coach' }).click();
  await expect(page.locator('#coach-mode')).toHaveText('text');
  await page.locator('#question').fill('What now?');
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-answer')).toContainText('Step 1.');
  await expect(page.locator('#coach-source')).toHaveText('fallback');
  await page.locator('#steps').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-answer')).toContainText('Step 2.');
  await page.getByRole('button', { name: 'Ask by text' }).dblclick();
  await expect(page.locator('#coach-answer')).toContainText('Step 2.');
  await expect(page.locator('#coach-answer')).not.toContainText('dropped');
  await page.getByRole('button', { name: 'Repeat step' }).click();
  await expect(page.locator('#coach-answer')).toContainText('New attempt');
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-answer')).toContainText('Step 2.');
});

test('coach answers locally when the server cannot be reached and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/voice-lab.html');
  await page.getByRole('button', { name: 'Connect coach' }).click();
  await expect(page.locator('#coach-mode')).toHaveText('text');
  await page.route('**/api/coach', route => route.abort());
  await page.locator('#question').fill('Help');
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-answer')).toContainText('Place the base.');
  await expect(page.locator('#coach-source')).toHaveText('fallback');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

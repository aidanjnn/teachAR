import { expect, test } from '@playwright/test';
import { issueBrowserCode } from './pairing.js';

// The coach acquires the fake microphone; keep this file serial like the Voice Lab specs.
test.describe.configure({ mode: 'default' });

/** Seeds a finished two-step tutorial as the page's current draft through the tutor's own modules. */
async function seedTutorial(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const core = await import('/tutorial-core.mjs') as {
      newTutorial: (title: string) => any; prepareStep: (frames: unknown[], instruction: string, title: string) => any; finishTutorial: (tutorial: any) => any;
    };
    const store = await import('/tutorial-store.mjs') as { saveTutorial: (t: any, expected: unknown) => Promise<void>; loadTutorial: () => Promise<any>; draftVersion: (t: any) => unknown };
    const hand = (x: number) => Array.from({ length: 25 }, () => ({ p: [x, 0, 0], q: [0, 0, 0, 1] }));
    const frames = () => Array.from({ length: 40 }, (_, i) => ({ t: i * 40, left: hand(0.1 + i * 0.002), right: hand(0.3) }));
    const tutorial = core.newTutorial('Coach smoke');
    tutorial.setup = 'Two blocks on the mat.'; tutorial.calibration_span_m = 0.4;
    tutorial.steps.push(core.prepareStep(frames(), 'Slide the base to the centre.', 'Slide the base'));
    tutorial.steps.push(core.prepareStep(frames(), 'Drop the support into the base.', ''));
    tutorial.steps.forEach((step: { reviewed: boolean }) => { step.reviewed = true; });
    const finished = core.finishTutorial(tutorial);
    const existing = await store.loadTutorial().catch(() => null);
    await store.saveTutorial(finished, existing ? store.draftVersion(existing) : undefined);
    return finished.steps.map((step: { id: string }) => step.id) as string[];
  });
}

test('pairs the browser tutor, publishes a coach guide and coaches from server-stored step text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tutorial');
  await expect(page.locator('#coach-mode')).toHaveText('idle');
  const stepIds = await seedTutorial(page);
  await page.reload();
  await expect(page.locator('#tutorial-title')).toHaveValue('Coach smoke');

  // Pairing is on for the e2e server: the first Start reveals the code form.
  await page.getByRole('button', { name: 'Start coach' }).click();
  await expect(page.locator('#coach-status')).toContainText('Pair this browser');
  await page.getByLabel('Pairing code').fill(await issueBrowserCode('author'));
  await page.getByRole('button', { name: 'Pair browser' }).click();
  await expect(page.locator('#coach-status')).toContainText('Paired as author');

  // Mock provider: no live voice, so the coach settles in text mode, grounded on the published guide.
  await page.getByRole('button', { name: 'Start coach' }).click();
  await expect(page.locator('#coach-mode')).toHaveText('text', { timeout: 20_000 });
  await expect(page.locator('#coach-status')).toContainText('Paired as author');
  await expect(page.locator('#coach-status')).not.toContainText("this browser's step text");

  await page.getByLabel('Type a question').fill('what now');
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-log li').last()).toContainText('Slide the base to the centre.');

  // A step change reaches the coach through the same hook the guide calls from showStep.
  await page.evaluate(id => (window as unknown as { trailCoach: { onStep: (step: { id: string }, epoch: number) => void } }).trailCoach.onStep({ id }, 3), stepIds[1]);
  await page.getByLabel('Type a question').fill('and now');
  await page.getByRole('button', { name: 'Ask by text' }).click();
  await expect(page.locator('#coach-log li').last()).toContainText('Drop the support into the base.');
  await expect(page.locator('#coach-log li').last()).not.toContainText('Slide the base');

  // The guide the coach answered from is server-owned text, readable back by a paired client.
  const mapping = await page.evaluate(() => JSON.parse(localStorage.getItem('trail-coach-guides') ?? '{}') as Record<string, { id: string; guideRevision: number }>);
  const [entry] = Object.values(mapping);
  expect(entry?.guideRevision).toBe(1);
  const guide = await page.evaluate(async id => {
    const response = await fetch(`/api/coach-guides/${id}/query`, { method: 'POST', credentials: 'same-origin' });
    return { status: response.status, body: await response.json() as unknown };
  }, entry!.id);
  expect(guide.status).toBe(200);
  const body = guide.body as { steps: { id: string; title: string; instruction: string }[] };
  expect(body.steps.map(step => step.id)).toEqual(stepIds);
  expect(body.steps[0]).toMatchObject({ title: 'Slide the base', instruction: 'Slide the base to the centre.' });
  expect(body.steps[1]!.title).toBe('Drop the support into the base.');

  await page.getByRole('button', { name: 'Stop coach' }).click();
  await expect(page.locator('#coach-mode')).toHaveText('idle');
  expect(errors).toEqual([]);
});

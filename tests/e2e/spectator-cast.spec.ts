import { expect, test } from '@playwright/test';
test('operator-selected action view disconnects and reconnects without controlling the guide', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d')!; context.fillStyle = '#5588aa'; context.fillRect(0, 0, 320, 180);
      return canvas.captureStream(1);
    } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Spectator', exact: true }).click();
  await page.getByRole('button', { name: 'Choose cast view' }).click();
  const cast = page.getByRole('region', { name: 'Headset cast' });
  await expect(cast.getByRole('status')).toContainText('without audio');
  await expect(cast.locator('video')).toBeVisible();
  await expect(page.locator('#spectator-phase')).toHaveText('Waiting for a learner');
  await page.evaluate(() => {
    const stream = (document.querySelector('#spectator-cast video') as HTMLVideoElement).srcObject as MediaStream;
    stream.getVideoTracks()[0]!.dispatchEvent(new Event('ended'));
  });
  await expect(cast.getByRole('status')).toContainText('disconnected');
  await expect(cast.locator('video')).toBeHidden();
  await page.getByRole('button', { name: 'Choose cast view' }).click();
  await expect(cast.locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect cast' }).click();
  await expect(cast.locator('video')).toBeHidden();
});

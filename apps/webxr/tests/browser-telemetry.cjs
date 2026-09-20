const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({channel: process.env.TRAIL_BROWSER_CHANNEL || undefined, headless: true, args: ['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1000}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/telemetry/config', route => route.fulfill({contentType: 'application/json', body: '{}'}));
    await page.goto(`${process.env.TRAIL_TEST_ORIGIN || 'http://127.0.0.1:4321'}/tutorial`);
    await page.locator('#trail-diagnostics').waitFor();
    assert.equal(await page.locator('#trail-diagnostics').evaluate(el => el.parentNode === document.body), true);
    // Exercise the mounted runtime observer while its progressive disclosure is closed.
    await page.evaluate(async () => {
      const {telemetry} = await import('/telemetry.mjs');
      const data = {tutorial_key: telemetry.newId(), attempt_id: telemetry.newId(), revision: 7, step_index: 2, source: 'synthetic', mode: 'learn', phase: 'following', required_left: true, required_right: false, tracking_left: true, tracking_right: false};
      const interaction_id = telemetry.newId();
      telemetry.emit('guide_state', {...data, title: '<script>private-title</script>', token: 'sensitive-token', coordinates: [2, 3, 4]});
      for (const stage of ['targeted', 'activated', 'hit_test', 'dispatched', 'state_changed', 'feedback_rendered']) telemetry.emit('interaction', {...data, interaction_id, control: 'primary', stage, outcome: stage === 'feedback_rendered' ? 'ui_acknowledged' : 'observed'});
      telemetry.emit('guide_action', {...data, action: 'help'});
      telemetry.emit('guide_action', {...data, action: 'confirm'});
      window.safeSummary = telemetry.snapshot().events.find(event => event.type === 'step_summary')?.data;
    });
    await page.locator('#trail-diagnostics > summary').click();
    await page.getByRole('heading', {name: 'Diagnostic reconstruction — not headset video'}).waitFor();
    await page.waitForFunction(() => document.querySelector('#trail-diagnostics tbody').textContent.includes('v7'));
    const content = await page.locator('#trail-diagnostics').textContent();
    assert(content.includes('Synthetic fixture'));
    assert(content.includes('UI acknowledged'));
    assert(!content.includes('private-title') && !content.includes('sensitive-token'));
    assert.equal(await page.evaluate(() => window.safeSummary.outcome), 'confirmed');
    assert.equal(await page.evaluate(() => window.safeSummary.help_requests), 1);
    assert.equal(await page.locator('#trail-diagnostics .trail-diagnostic-safe').evaluateAll(nodes => nodes.every(node => node.children.length === 0)), true);
    assert.equal(await page.locator('#trail-diagnostics canvas, #trail-diagnostics img, #trail-diagnostics input, #trail-diagnostics video').count(), 0);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Export safe observations'}).click();
    const download = await downloading, exported = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.schema, 'trail.observations.v1');
    assert.equal(exported.steps.rows[0].completed, 1);
    const exportedText = JSON.stringify(exported);
    assert(!exportedText.includes('private-title') && !exportedText.includes('sensitive-token') && !exportedText.includes('coordinates'));
    await page.screenshot({path: '/tmp/trail-observability-panel.png'});
    await page.setViewportSize({width: 375, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({path: '/tmp/trail-observability-panel-mobile.png'});
    assert.deepEqual(errors, []);
    console.log('PASS telemetry panel: real bootstrap, synthetic provenance, closed-panel summaries, bounded safe DOM, mobile layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('browser pairing, import, four-step review, immutable finalize and reload', async ({ page, request }) => {
  test.setTimeout(90_000);
  const errors: string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  const port=process.env.E2E_PORT ?? '3101'; const bootstrap=JSON.parse(await readFile(`data/e2e-${port}/pairing.json`,'utf8')) as {code:string};
  await page.goto('/'); await page.getByRole('button',{name:'Author a guide',exact:true}).click();
  await page.getByLabel('Pairing code').fill(bootstrap.code); await page.getByRole('button',{name:'Connect workspace'}).click();
  await expect(page.locator('#pair-state')).toHaveText('Connected as author.');
  await page.getByRole('button',{name:'Import four-step sample'}).click();
  await expect(page.locator('#step-strip li')).toHaveCount(4,{timeout:30_000});
  await expect(page.locator('#author-source')).toHaveText('Synthetic recording');
  for(let index=0;index<4;index++) {
    await page.locator('#step-strip button').nth(index).click();
    await page.getByLabel('Title',{exact:true}).fill(`Place part ${index+1}`);
    await page.getByLabel('Instruction',{exact:true}).fill(`Move large part ${index+1} across the mat, then hold still.`);
    await page.getByRole('combobox',{name:'Completion',exact:true}).selectOption('path-and-pose');
    await page.getByRole('button',{name:'Apply step edits'}).click();
  }
  await page.getByRole('button',{name:'Save reviewed draft'}).click();
  await expect(page.locator('#author-status')).toContainText('Reviewed draft saved');
  await page.getByRole('button',{name:'Show checkpoint',exact:true}).click();
  await expect(page.locator('#frame-label')).toContainText('359');
  await page.getByRole('button',{name:'Finalize guide',exact:true}).click();
  await expect(page.locator('#author-status')).toContainText('Guide finalized');
  await expect(page.locator('#step-title')).toBeDisabled();
  await page.screenshot({path:'test-results/authoring-review.png',fullPage:true});
  const savedId = await page.getByLabel('Saved guides').inputValue();
  await page.reload(); await page.getByRole('button',{name:'Author a guide',exact:true}).click();
  await page.getByRole('button',{name:'Reload saved guides'}).click();
  await expect(page.locator(`#tutorial-library option[value="${savedId}"]`)).toHaveCount(1);
  const id=savedId; await page.getByLabel('Saved guides').selectOption(id!);
  await expect(page.locator('#author-status')).toContainText('Finalized guide loaded');
  await expect(page.locator('#step-strip li')).toHaveCount(4);
  const code = await page.evaluate(async () => (await (await fetch('/api/pairing-codes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({role:'learner'}) })).json()).code as string);
  const paired = await request.post('/api/pair', { data:{ code,client:'native' } }); const learner = await paired.json() as {token:string;sessionId:string};
  await page.getByRole('button',{name:'Spectator',exact:true}).click();
  await expect(page.locator('#spectator-connection')).toHaveText('Stale or disconnected');
  const published = await request.post('/api/guide-events', { headers:{Authorization:`Bearer ${learner.token}`},data:{schemaVersion:1,type:'snapshot',sessionId:learner.sessionId,runId:'browser-smoke-run',seq:1,tMs:100,state:{phase:'guiding',tutorialId:id,tutorialRevision:3,stepId:'step-1',stepRevision:1,attemptId:'attempt-1',dwellProgress:0,pathProgress:.4,nextGateByHand:{right:1},calibrationValid:true,tracking:{left:'missing',right:'valid'}}} });
  expect(published.status()).toBe(204);
  await expect(page.locator('#spectator-connection')).toHaveText('Live headset state');
  await expect(page.locator('#spectator-step')).toContainText('Place part 1');
  await page.getByRole('button',{name:'Reconnect spectator'}).click();
  await expect(page.locator('#spectator-step')).toContainText('Place part 1');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

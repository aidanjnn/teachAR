import { readFile } from 'node:fs/promises';
import { request } from '@playwright/test';
import { authorStatePath, e2eOrigin, e2ePort } from './pairing.js';

/** Exchanges the server's single-use bootstrap author code for a browser cookie that the specs reuse to mint their own codes. */
export default async function globalSetup() {
  const bootstrap = JSON.parse(await readFile(`data/e2e-${e2ePort}/pairing.json`, 'utf8')) as { code: string };
  const context = await request.newContext({ baseURL: e2eOrigin, extraHTTPHeaders: { origin: e2eOrigin } });
  try {
    const paired = await context.post('/api/pair', { data: { code: bootstrap.code, client: 'browser' } });
    if (!paired.ok()) throw new Error(`Bootstrap pairing failed (${paired.status()})`);
    await context.storageState({ path: authorStatePath });
  } finally { await context.dispose(); }
}

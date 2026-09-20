import { request } from '@playwright/test';

/** Shared e2e pairing state: the server writes one single-use author code, so global setup exchanges it once. */
export const e2ePort = process.env.E2E_PORT ?? '3101';
export const e2eOrigin = `http://127.0.0.1:${e2ePort}`;
export const authorStatePath = `data/e2e-${e2ePort}/author-state.json`;

/** Mints a fresh browser pairing code for `role` using the author cookie saved by global setup. */
export async function issueBrowserCode(role: 'author' | 'learner' | 'spectator' = 'author'): Promise<string> {
  const author = await request.newContext({ baseURL: e2eOrigin, storageState: authorStatePath, extraHTTPHeaders: { origin: e2eOrigin } });
  try {
    const response = await author.post('/api/pairing-codes', { data: { role, client: 'browser' } });
    if (!response.ok()) throw new Error(`Could not issue a ${role} code (${response.status()})`);
    return ((await response.json()) as { code: string }).code;
  } finally { await author.dispose(); }
}

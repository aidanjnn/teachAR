import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PairingAuthority } from './pairing.js';

/** Private local operator handoff; never send initial author codes to application logs. */
export async function writePairingBootstrap(authority: PairingAuthority, dataDir: string): Promise<string> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const destination = join(dataDir, 'pairing.json');
  const temporary = join(dataDir, `.pairing-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(authority.issueCode('author', authority.sessionId, 'browser')) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
  try { await rename(temporary, destination); }
  finally { await unlink(temporary).catch(() => undefined); }
  return destination;
}

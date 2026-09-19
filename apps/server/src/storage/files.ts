import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export class StoreError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}
export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const storageId = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new StoreError(400, 'Invalid storage ID');
  return id;
};

/** One process owns this directory. Per-object serialization covers read/modify/write. */
export class PrivateFiles {
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(readonly root: string) {}
  async serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(action);
    this.locks.set(key, pending);
    try { return await pending; } finally { if (this.locks.get(key) === pending) this.locks.delete(key); }
  }
  path(collection: 'recordings' | 'tutorials' | 'jobs' | 'assets', id: string, name = 'manifest.json') {
    storageId(id);
    if (!/^[a-z0-9.-]+$/.test(name)) throw new StoreError(400, 'Invalid asset name');
    return join(this.root, collection, id, name);
  }
  async write(collection: 'recordings' | 'tutorials' | 'jobs' | 'assets', id: string, value: unknown, name = 'manifest.json') {
    return this.writeBytes(collection, id, Buffer.from(JSON.stringify(value)), name);
  }
  async writeBytes(collection: 'recordings' | 'tutorials' | 'jobs' | 'assets', id: string, bytes: Uint8Array, name: string) {
    const folder = join(this.root, collection, storageId(id));
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const target = this.path(collection, id, name);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, target);
      const directory = await open(folder, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await rm(temporary, { force: true }); }
  }
  async read<T>(collection: 'recordings' | 'tutorials' | 'jobs' | 'assets', id: string, name = 'manifest.json'): Promise<T> {
    try { return JSON.parse(await readFile(this.path(collection, id, name), 'utf8')) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, 'Not found'); throw error; }
  }
  async ids(collection: 'recordings' | 'tutorials' | 'jobs' | 'assets') {
    try { return (await readdir(join(this.root, collection), { withFileTypes: true })).filter(entry => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
}

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-tutor-static-')); directories.push(path); return path; }

async function tutorFixture() {
  const tutorRoot = await temp();
  await writeFile(join(tutorRoot, 'tutorial.html'), '<!doctype html><title>Tutor fixture</title>');
  await writeFile(join(tutorRoot, 'tutorial-guide.mjs'), 'export const guide = 1;');
  await mkdir(join(tutorRoot, 'vendor'));
  await writeFile(join(tutorRoot, 'vendor', 'trail-coach.js'), 'export const coach = 1;');
  await writeFile(join(tutorRoot, 'telemetry-sentry.mjs'), 'export const telemetry = 1;');
  await writeFile(join(tutorRoot, 'telemetry.css'), '#trail-diagnostics { display: block; }');
  await writeFile(join(tutorRoot, 'vendor', 'sentry.mjs'), 'export const SDK_VERSION = "test";');
  await writeFile(join(tutorRoot, 'vendor', 'SENTRY-LICENSE.txt'), 'MIT license fixture');
  await writeFile(join(tutorRoot, 'index.html'), '<h1>legacy camera lab</h1>');
  return tutorRoot;
}

describe('browser tutor static serving', () => {
  it('serves the tutor files and the /tutorial entry from the API origin in development', async () => {
    const tutorRoot = await tutorFixture();
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { tutorRoot });
    try {
      const page = await app.inject('/tutorial.html');
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.body).toContain('Tutor fixture');
      const module = await app.inject('/tutorial-guide.mjs');
      expect(module.statusCode).toBe(200);
      expect(String(module.headers['content-type'])).toMatch(/javascript/);
      const vendor = await app.inject('/vendor/trail-coach.js');
      expect(vendor.statusCode).toBe(200);
      for (const path of ['/telemetry-sentry.mjs', '/vendor/sentry.mjs']) {
        const telemetry = await app.inject(path);
        expect(telemetry.statusCode).toBe(200);
        expect(String(telemetry.headers['content-type'])).toMatch(/javascript/);
      }
      expect((await app.inject('/telemetry.css')).headers['content-type']).toContain('text/css');
      expect((await app.inject('/vendor/SENTRY-LICENSE.txt')).body).toContain('MIT license fixture');
      const entry = await app.inject('/tutorial');
      expect(entry.statusCode).toBe(200);
      expect(entry.headers['content-type']).toContain('text/html');
      expect(entry.body).toContain('Tutor fixture');
      expect((await app.inject('/api/health')).statusCode).toBe(200);
      expect((await app.inject('/api/nope')).statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('keeps the desktop build first when both roots are present', async () => {
    const tutorRoot = await tutorFixture();
    const webRoot = await temp();
    await writeFile(join(webRoot, 'index.html'), '<h1>Trail desktop</h1>');
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { webRoot, tutorRoot });
    try {
      expect((await app.inject('/')).body).toContain('Trail desktop');
      expect((await app.inject('/index.html')).body).toContain('Trail desktop');
      expect((await app.inject('/tutorial.html')).body).toContain('Tutor fixture');
      expect((await app.inject('/tutorial')).body).toContain('Tutor fixture');
    } finally { await app.close(); }
  });

  it('does not add the /tutorial entry when no tutor root is configured', async () => {
    const app = await createApp(readConfig({ DATA_DIR: await temp() }));
    try {
      expect((await app.inject('/tutorial')).statusCode).toBe(404);
    } finally { await app.close(); }
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_NARRATION_BYTES } from '@trail/contracts';
import { createMockProvider } from '../src/ai/mock.js';
import type { AiProvider } from '../src/ai/provider.js';
import { createApp } from '../src/app.js';
import { readConfig, repositoryRoot } from '../src/config.js';
import transcriptRaw from '../../../fixtures/narration-transcript.v1.json';
import segmentsRaw from '../../../fixtures/label-segments.v1.json';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-voice-')); directories.push(path); return path; }
const mock = createMockProvider({ transcriptFixturePath: resolve(repositoryRoot, 'fixtures/narration-transcript.v1.json') });
async function mockApp() { return createApp(readConfig({ DATA_DIR: await temp() }), { provider: mock }); }
function stub(overrides: Partial<AiProvider>): AiProvider {
  return {
    name: 'openai',
    transcribe: async () => { throw new Error('boom'); },
    label: async () => { throw new Error('boom'); },
    coachText: async () => { throw new Error('boom'); },
    createLiveSession: async () => ({ schemaVersion: 1, sessionId: 'live_1', sdp: 'v=0 answer', liveModel: 'gpt-live-1' }),
    ...overrides,
  };
}
const context = { tutorialId: 't', tutorialRevision: 0, runId: 'run', attemptId: 'a', title: 'Stand', steps: [{ id: 's1', title: 'Place the base', instruction: 'Slide it.' }], currentStepId: 's1', stepRevision: 0 };
const json = { 'content-type': 'application/json' };

describe('POST /api/voice/transcriptions', () => {
  it('accepts audio with codec parameters and returns aligned spans with no-store', async () => {
    const app = await mockApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'audio/webm;codecs=opus', 'x-audio-start-offset-ms': '100', 'x-audio-duration-ms': '6000' }, payload: Buffer.alloc(2048, 1) });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.json();
      expect(body.source).toBe('fixture');
      expect(body.spans[0]).toMatchObject({ startMs: 300, endMs: 1700 });
    } finally { await app.close(); }
  });
  it('rejects unsupported media, oversized bodies, empty bodies, and bad headers with typed errors', async () => {
    const app = await mockApp();
    try {
      expect((await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'text/plain' }, payload: 'hello' })).statusCode).toBe(415);
      expect((await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'image/png' }, payload: Buffer.alloc(8) })).statusCode).toBe(415);
      const big = await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'audio/wav' }, payload: Buffer.alloc(MAX_NARRATION_BYTES + 1) });
      expect(big.statusCode).toBe(413);
      expect(big.json()).toEqual({ error: 'payload_too_large', message: expect.any(String) });
      const empty = await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'audio/wav' } });
      expect(empty.statusCode).toBe(400);
      const badHeader = await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'audio/wav', 'x-audio-start-offset-ms': '9999' }, payload: Buffer.alloc(8) });
      expect(badHeader.statusCode).toBe(400);
      expect(badHeader.json().error).toBe('invalid_request');
    } finally { await app.close(); }
  });
  it('reports a provider failure as 503 without leaking details', async () => {
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { provider: stub({}) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/voice/transcriptions', headers: { 'content-type': 'audio/wav' }, payload: Buffer.alloc(8) });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'provider_unavailable', message: expect.any(String) });
      expect(response.body).not.toContain('boom');
    } finally { await app.close(); }
  });
});

describe('POST /api/voice/labels', () => {
  it('returns fallback labels in mock mode and validates input', async () => {
    const app = await mockApp();
    try {
      const ok = await app.inject({ method: 'POST', url: '/api/voice/labels', headers: json, payload: { schemaVersion: 1, segments: segmentsRaw.segments, transcript: transcriptRaw } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().provenance.labels).toBe('fallback');
      expect(ok.json().labels).toHaveLength(3);
      const bad = await app.inject({ method: 'POST', url: '/api/voice/labels', headers: json, payload: { schemaVersion: 1, segments: [], transcript: transcriptRaw } });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toBe('invalid_request');
      expect((await app.inject({ method: 'POST', url: '/api/voice/labels', headers: json, payload: '{not json' })).statusCode).toBe(400);
      const huge = await app.inject({ method: 'POST', url: '/api/voice/labels', headers: json, payload: JSON.stringify({ schemaVersion: 1, pad: 'x'.repeat(1024 * 1024 + 1) }) });
      expect(huge.statusCode).toBe(413);
      expect(huge.json()).toEqual({ error: 'payload_too_large', message: expect.not.stringContaining('Narration') });
    } finally { await app.close(); }
  });
});

describe('POST /api/coach', () => {
  it('answers from the stored step and survives a throwing provider', async () => {
    const app = await mockApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/coach', headers: json, payload: { schemaVersion: 1, requestId: 'r1', context, question: 'What now?' } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ requestId: 'r1', stepId: 's1', answer: 'Place the base. Slide it.', source: 'fallback' });
      expect((await app.inject({ method: 'POST', url: '/api/coach', headers: json, payload: { schemaVersion: 1, requestId: 'r1', context, question: 'x'.repeat(501) } })).statusCode).toBe(400);
    } finally { await app.close(); }
    const broken = await createApp(readConfig({ DATA_DIR: await temp() }), { provider: stub({}) });
    try {
      const response = await broken.inject({ method: 'POST', url: '/api/coach', headers: json, payload: { schemaVersion: 1, requestId: 'r2', context, question: 'Help' } });
      expect(response.statusCode).toBe(200);
      expect(response.json().source).toBe('fallback');
    } finally { await broken.close(); }
  });
});

describe('POST /api/live/sessions', () => {
  it('is unavailable in mock mode and returns the SDP answer from a live provider', async () => {
    const app = await mockApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/live/sessions', headers: json, payload: { schemaVersion: 1, sdp: 'v=0 offer', context } });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('live_unavailable');
      expect((await app.inject({ method: 'POST', url: '/api/live/sessions', headers: json, payload: { schemaVersion: 1, context } })).statusCode).toBe(400);
    } finally { await app.close(); }
    const live = await createApp(readConfig({ DATA_DIR: await temp(), AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-secret-value' }), { provider: stub({}) });
    try {
      const response = await live.inject({ method: 'POST', url: '/api/live/sessions', headers: json, payload: { schemaVersion: 1, sdp: 'v=0 offer', context } });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ schemaVersion: 1, sessionId: 'live_1', sdp: 'v=0 answer', liveModel: 'gpt-live-1' });
      const health = await live.inject('/api/health');
      expect(health.json().providers.ai).toBe('openai');
      expect(health.body).not.toContain('sk-secret-value');
      expect(response.body).not.toContain('sk-secret-value');
    } finally { await live.close(); }
  });
});

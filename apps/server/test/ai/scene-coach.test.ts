import { describe, expect, it } from 'vitest';
import { createOmniSceneCoach, pcmToWav, readCompletionStream, sceneInstructions, violatesAdviceRules, SceneCoachError } from '../../src/ai/scene-coach.js';

const context = {
  tutorialId: 'guide-1', tutorialRevision: 2, runId: 'run', attemptId: 'a', title: 'Paper crane',
  steps: [{ id: 's1', title: 'Fold the diagonal', instruction: 'Fold the square corner to corner and crease.' }, { id: 's2', title: 'Open', instruction: 'Open the sheet again.' }],
  currentStepId: 's1', stepRevision: 3,
};
const image = { mimeType: 'image/jpeg' as const, dataBase64: Buffer.alloc(96, 7).toString('base64') };
const pcm = Buffer.from(Array.from({ length: 480 }, (_, i) => (i % 2 ? 0x7f : 0x01)));
function sse(events: unknown[]): Response {
  const body = events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('omni scene coach gateway', () => {
  it('sends one streamed multimodal completion and returns the transcript with the audio wrapped as WAV', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return sse([
        { choices: [{ delta: { content: 'Turn the sheet' } }] },
        { choices: [{ delta: { audio: { transcript: 'Turn the sheet', data: pcm.subarray(0, 240).toString('base64') } } }] },
        { choices: [{ delta: { audio: { transcript: ' so the marked corner is nearest you.', data: pcm.subarray(240).toString('base64') } } }] },
        '[DONE]',
      ]);
    }) as typeof fetch;
    const coach = createOmniSceneCoach({ apiKey: 'sk-omni-test', baseUrl: 'https://gateway.example/v1', model: 'qwen3.5-omni-flash', voice: 'Cherry', fetchImpl });
    const advice = await coach.advise({ context, question: 'Is my paper placed right?', image, reference: image, source: 'quest-camera' }, AbortSignal.timeout(5_000));
    expect(advice.transcript).toBe('Turn the sheet so the marked corner is nearest you.');
    expect(advice.model).toBe('qwen3.5-omni-flash');
    const wav = Buffer.from(advice.audio!.dataBase64, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44).equals(pcm)).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://gateway.example/v1/chat/completions');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-omni-test');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: 'qwen3.5-omni-flash', stream: true, modalities: ['text', 'audio'], audio: { voice: 'Cherry', format: 'wav' } });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('Never say a step is done');
    expect(body.messages[0].content).toContain('Fold the square corner to corner');
    const parts = body.messages[1].content;
    expect(parts.map((part: { type: string }) => part.type)).toEqual(['image_url', 'image_url', 'text']);
    expect(parts[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(parts[2].text).toContain('Is my paper placed right?');
    expect(parts[2].text).toContain('headset camera');
  });
  it('accepts a gateway that answers once as JSON and reports no audio when none came back', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'I cannot see the sheet from here.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const coach = createOmniSceneCoach({ apiKey: 'k', baseUrl: 'https://gateway.example/v1', model: 'm', voice: 'v', fetchImpl });
    const advice = await coach.advise({ context, question: 'Where is it?', image, reference: null, source: 'workspace-webcam' }, AbortSignal.timeout(5_000));
    expect(advice).toEqual({ transcript: 'I cannot see the sheet from here.', audio: null, model: 'm' });
  });
  it('turns gateway refusals, empty answers and timeouts into a typed 503 without the body', async () => {
    const refused = createOmniSceneCoach({ apiKey: 'k', baseUrl: 'https://gateway.example/v1', model: 'm', voice: 'v', fetchImpl: (async () => new Response('{"error":"bad key sk-secret"}', { status: 401 })) as typeof fetch });
    await expect(refused.advise({ context, question: 'q', image, reference: null, source: 'quest-camera' }, AbortSignal.timeout(5_000))).rejects.toMatchObject({ name: 'SceneCoachError', status: 401, message: 'OMNI gateway answered 401' });
    const empty = createOmniSceneCoach({ apiKey: 'k', baseUrl: 'https://gateway.example/v1', model: 'm', voice: 'v', fetchImpl: (async () => sse(['[DONE]'])) as typeof fetch });
    await expect(empty.advise({ context, question: 'q', image, reference: null, source: 'quest-camera' }, AbortSignal.timeout(5_000))).rejects.toBeInstanceOf(SceneCoachError);
    const aborted = new AbortController(); aborted.abort();
    const slow = createOmniSceneCoach({ apiKey: 'k', baseUrl: 'https://gateway.example/v1', model: 'm', voice: 'v', fetchImpl: (async (_url, init) => { if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError'); return sse([]); }) as typeof fetch });
    await expect(slow.advise({ context, question: 'q', image, reference: null, source: 'quest-camera' }, aborted.signal)).rejects.toMatchObject({ status: 503, message: 'OMNI request timed out' });
  });
  it('cancels an oversized single-JSON answer while reading it, before decoding', async () => {
    let delivered = 0, cancelled = false;
    const chunk = new Uint8Array(1024 * 1024).fill(0x41);
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (delivered >= 20) { controller.close(); return; } delivered++; controller.enqueue(chunk); }, cancel() { cancelled = true; } });
    await expect(readCompletionStream(new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }))).rejects.toMatchObject({ message: 'OMNI response too large' });
    expect(cancelled).toBe(true);
    expect(delivered).toBeLessThanOrEqual(10);
  });
  it('parses partial lines across chunks and stops at [DONE]', async () => {
    const chunks = ['data: {"choices":[{"delta":{"con', 'tent":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content":" ignored"}}]}\n'];
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
    const answer = await readCompletionStream(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    expect(answer.text).toBe('Hello');
  });
  it('keeps the coach rules in the instructions and passes audio that already has a WAV header through', () => {
    const text = sceneInstructions(context);
    expect(text).toContain('Current step 1 of 2: "Fold the diagonal"');
    expect(text).toContain('Never give measurements');
    const wav = pcmToWav(Buffer.alloc(10, 1));
    expect(pcmToWav(wav)).toBe(wav);
  });
  it('flags completion claims, verification claims and measurements as rule violations', () => {
    for (const bad of ['Step completed, well done.', "You're done with this step.", 'That looks correct, move on.', 'Move it 3 cm to the left.', 'Rotate by 45 degrees.', 'Place it at x: 12.']) expect(violatesAdviceRules(bad), bad).toBe(true);
    for (const ok of ['Turn the sheet so the marked corner is nearest you.', 'I cannot see the left edge; move your hand.', 'The sheet is a little to the left of where the expert had it.']) expect(violatesAdviceRules(ok), ok).toBe(false);
  });
});

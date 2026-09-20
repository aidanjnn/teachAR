/**
 * Entry for the coach bundle the Quest Browser tutor loads from /vendor/trail-coach.js.
 * It re-exports the desktop coach runtime unchanged and adds the two pairing calls the tutor needs.
 * Provider keys never appear here: the runtime only posts an SDP offer to our own server.
 */
export { createCoach } from './guide/coach.js';
export type { CoachApi, CoachOptions, TranscriptEntry, LiveError } from './guide/coach.js';
export type { CoachMode, CoachState } from './guide/coach-state.js';

export type PairingStatus =
  | { status: 'no-pairing' }
  | { status: 'unpaired'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'paired'; role: string; sessionId: string };

/** POST /api/session: 404 means the server runs without pairing, 401/403 means this browser must pair first, anything else is a server problem, not a pairing one. */
export async function sessionState(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<PairingStatus> {
  let response: Response;
  try {
    response = await fetchImpl('/api/session', { method: 'POST', credentials: 'same-origin' });
  } catch {
    return { status: 'unavailable', message: 'The server did not answer.' };
  }
  if (response.status === 404) return { status: 'no-pairing' };
  if (response.status === 401 || response.status === 403) return { status: 'unpaired', message: 'Pair this browser with the server first.' };
  if (!response.ok) return { status: 'unavailable', message: `The server answered ${response.status}.` };
  const body = (await response.json().catch(() => ({}))) as { role?: unknown; sessionId?: unknown };
  if (typeof body.role !== 'string' || typeof body.sessionId !== 'string') return { status: 'unpaired', message: 'The server session was unreadable.' };
  return { status: 'paired', role: body.role, sessionId: body.sessionId };
}

/** POST /api/pair with a short-lived code. Codes are single-use and expire after five minutes. */
export async function pairBrowser(code: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<{ ok: true; role: string } | { ok: false; message: string }> {
  const trimmed = code.trim();
  if (!/^[0-9]{8}$/.test(trimmed)) return { ok: false, message: 'Enter the eight-digit pairing code.' };
  let response: Response;
  try {
    response = await fetchImpl('/api/pair', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: trimmed, client: 'browser' }),
    });
  } catch {
    return { ok: false, message: 'The server did not answer.' };
  }
  if (response.status === 401) return { ok: false, message: 'Code not accepted. Codes are single-use and expire after five minutes.' };
  if (!response.ok) return { ok: false, message: `Pairing failed (${response.status}).` };
  const body = (await response.json().catch(() => ({}))) as { role?: unknown };
  return { ok: true, role: typeof body.role === 'string' ? body.role : 'paired' };
}

import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { GuideEventSchema, type GuideEvent, type SpectatorState } from '@trail/contracts';
import type { PairingAuthority } from '../auth/pairing.js';

/** The headset is the sole state publisher. No spectator message can control it. */
export class SpectatorRelay {
  private latest: GuideEvent | null = null;
  private updatedAt = 0;
  private publisher: WebSocket | null = null;
  private readonly viewers = new Set<WebSocket>();
  private readonly retired = new Set<string>();
  private runId: string | null = null;
  private seq = -1;
  private lastBroadcast = 0;
  constructor(private readonly now: () => number = Date.now) {}
  snapshot(): SpectatorState { return { type: 'spectator-state', connected: this.publisher !== null, updatedAt: this.updatedAt, snapshot: this.latest }; }
  private send(socket: WebSocket) {
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1024) { socket.close(1013, 'Slow reader; reconnect for snapshot'); return; }
    socket.send(JSON.stringify(this.snapshot()));
  }
  private broadcast() { this.lastBroadcast = this.now(); for (const socket of this.viewers) this.send(socket); }
  async register(app: FastifyInstance, auth: PairingAuthority) {
    await app.register(websocket, { options: { maxPayload: 16 * 1024, perMessageDeflate: false } });
    app.get('/ws', { websocket: true, preValidation: auth.require({ roles: ['learner', 'spectator', 'author'] }) }, (socket, request) => {
      const principal = auth.authorize(request, { roles: ['learner', 'spectator', 'author'] });
      if (principal.sessionId !== auth.sessionId || this.viewers.size >= 32) { socket.close(1008, 'Session or connection limit'); return; }
      if (principal.role === 'learner') {
        if (this.publisher) { socket.close(1008, 'A learner already owns this session'); return; }
        this.publisher = socket; this.broadcast();
      } else { this.viewers.add(socket); }
      let count = 0; let window = this.now();
      const expiry = setTimeout(() => socket.close(1008, 'Pairing expired'), Math.max(1, principal.expiresAt - this.now()));
      expiry.unref();
      socket.on('message', (bytes, binary) => {
        try {
          auth.authorize(request, { roles: [principal.role], sessionId: principal.sessionId });
          if (this.now() - window >= 1000) { count = 0; window = this.now(); }
          if (++count > 30 || binary) throw new Error('Message limit');
          const input: unknown = JSON.parse(bytes.toString());
          if (typeof input === 'object' && input !== null && Object.keys(input).length === 1 && 'type' in input && input.type === 'snapshot-request') { this.send(socket); return; }
          if (principal.role !== 'learner') throw new Error('Spectators are read only');
          const event = GuideEventSchema.parse(input);
          if (event.sessionId !== principal.sessionId || this.retired.has(event.runId)) throw new Error('Wrong session or retired run');
          if (event.runId !== this.runId) {
            if (event.type !== 'snapshot' || this.retired.size >= 128) throw new Error('New run requires full snapshot');
            if (this.runId) this.retired.add(this.runId);
            this.runId = event.runId; this.seq = -1; this.latest = null;
          }
          if (event.seq <= this.seq) return;
          this.seq = event.seq;
          if (event.type === 'snapshot' || event.type === 'tracking-changed') {
            const previous = this.latest;
            this.latest = event; this.updatedAt = this.now();
            const changed = !previous || !('state' in previous) || previous.state.phase !== event.state.phase || previous.state.stepId !== event.state.stepId || previous.state.attemptId !== event.state.attemptId;
            if (changed || this.now() - this.lastBroadcast >= 100) this.broadcast();
          } else if (event.type === 'guide-ended') {
            this.latest = event; this.updatedAt = this.now(); this.broadcast();
          }
        } catch { socket.close(1008, 'Invalid or unauthorized relay message'); }
      });
      socket.on('close', () => { clearTimeout(expiry); this.viewers.delete(socket); if (this.publisher === socket) { this.publisher = null; this.broadcast(); } });
      socket.on('error', () => { socket.close(); });
      this.send(socket);
    });
    app.addHook('onClose', async () => { for (const socket of this.viewers) socket.terminate(); this.publisher?.terminate(); this.viewers.clear(); });
  }
}

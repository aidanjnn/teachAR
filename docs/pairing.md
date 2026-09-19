# Pairing and native transport

`createPairingAuthority` in `apps/server/src/auth/pairing.ts` owns one ephemeral
demo session. `registerPairingRoutes(app, authority)` installs pairing/session/code
routes. Server app/environment/UI composition is supplied by the authoring/storage
workstream; this module never silently enables unauthenticated feature routes.

Construct the authority with exact `allowedOrigins` and `allowUsbLoopback: false`
by default. Keep Fastify `trustProxy` disabled unless a separately configured,
trusted reverse proxy is the only allowed peer. `X-Forwarded-Proto` from arbitrary
clients is not transport evidence. TLS must terminate at the server or a properly
restricted TLS proxy. HTTP works only when explicitly enabled, both the actual
peer and Host are loopback, and the browser Origin is allowlisted.

On server startup, call `writePairingBootstrap(authority, dataDir)` to write
`pairing.json` atomically with mode 0600. It contains the initial **author** code,
role, demo session UUID and epoch expiry. Read it locally; do not log or commit it.
Redeem within five minutes. Codes are eight random decimal digits, single-use,
stored hashed, with at most 64 pending and rate limits of 10 attempts/IP/minute
and 100 total/minute. Tokens contain 256 random bits, are hashed in memory, expire
after one hour, and are capped at 128. Restart revokes all credentials.

- `POST /api/pair`: `{code, client: "browser" | "native"}`. Browser receives an
  HttpOnly, SameSite=Strict cookie (Secure with HTTPS); native receives `token`.
  Both receive role, sessionId, client and expiresAt. No token appears in a URL.
- `POST /api/session` (also native `GET`): authenticated session identity.
- `DELETE /api/session`: revoke this credential and clear the cookie.
- `POST /api/pairing-codes`: authenticated author submits `{role}` to issue a
  code for author, learner or spectator in the same session. Share only the needed
  role's code. Spectators cannot issue codes, advance guides or request frames.

Every protected consumer uses `authority.authorize(request, {roles, sessionId})`
or `authority.require(...)` as a Fastify HTTP/WS pre-validation hook. Bind payload
session identity to the returned principal before executing side effects. Reject
unexpected Origins even when bearer-authenticated; missing Origin never grants
access. Browser cookies require exact Origin, including WS upgrades. Same-origin
browser GET often omits Origin and scripts cannot set this forbidden header: use
POST read aliases for protected desktop reads. Never weaken this policy just to
make a browser GET succeed. Ambiguous cookie plus bearer credentials are rejected.

Native credentials are memory-only. `NativeApiConnection` clears credentials and
aborts requests on pause/focus loss/disable; callback generations prevent stale
responses from applying to a later pairing. Configure HTTPS normally. A development
APK may explicitly enable the `adb reverse` loopback exception; release builds
reject it. Loaded local guidance remains independent of these network states.

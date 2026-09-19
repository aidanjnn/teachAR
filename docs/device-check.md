# Device setup gate — pending

No headset checks have run for this scaffold. The planned hardware is a Quest 3S;
actual device, OS, Browser versions, and USB authorization still need inspection.

After `pnpm dev`, the proposed USB route is `adb devices`, then
`adb reverse tcp:5173 tcp:5173`, followed by `http://localhost:5173` in the headset.
Check the local health status and AR-support diagnostic. For the built application,
use `pnpm build && pnpm start` and reverse port 3001 instead. The route follows
[Meta's remote-debugging instructions](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/)
but has not been validated here.

AR session entry, sampling/rendering in one reference space, bare-hand capture,
microphone concurrency, mat calibration, and cross-person transfer remain later
implementation and acceptance gates. A desktop capability query cannot prove them.

Do not expose this scaffold through a tunnel: pairing and Origin checks are not
implemented. Keep the default loopback binding. Record actual hardware evidence
in `docs/validation.md` only when it exists, including commit, device/software,
origin, scenario, measured result, and remaining issues.

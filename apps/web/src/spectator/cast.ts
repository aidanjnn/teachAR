/** An operator-selected cast sits beside authoritative headset telemetry; it never advances guidance. */
export function mountCast(root: HTMLElement) {
  root.innerHTML = '<h3>Headset action view</h3><p>Open the Quest cast, then choose its window or tab. Confirm that physical hands and ghost guidance are visible.</p><video playsinline controls muted hidden aria-label="Operator-selected headset cast"></video><p role="status">No action view connected.</p><button type="button">Choose cast view</button><button type="button" disabled>Disconnect cast</button>';
  const video = root.querySelector('video')!; const state = root.querySelector('[role="status"]')!;
  const [choose, disconnect] = Array.from(root.querySelectorAll('button')) as [HTMLButtonElement, HTMLButtonElement];
  let stream: MediaStream | undefined; let revision = 0;
  function stop(message = 'Action view disconnected. Choose the cast again to reconnect.') {
    revision++; const previous = stream; stream = undefined;
    previous?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    video.pause(); video.srcObject = null; video.hidden = true; disconnect.disabled = true; state.textContent = message;
  }
  choose.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) { state.textContent = 'Screen sharing is unavailable in this browser. Display the Quest cast in a separate window beside progress.'; return; }
    stop(); const expected = revision; choose.disabled = true;
    try {
      const selected = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (expected !== revision) { selected.getTracks().forEach(track => track.stop()); return; }
      if (!selected.getVideoTracks().length) { selected.getTracks().forEach(track => track.stop()); throw new Error('No video'); }
      stream = selected; video.srcObject = stream; video.muted = true; video.hidden = false; disconnect.disabled = false;
      stream.getVideoTracks().forEach(track => { track.onended = () => stop(); });
      state.textContent = selected.getAudioTracks().length
        ? 'Operator-selected view connected. Use video controls to enable cast audio; verify audio and image match the learner.'
        : 'Operator-selected view connected without audio. Verify the image matches the learner; reconnect with tab audio if available.';
      void video.play().catch(() => { state.textContent = 'Cast connected. Press Play to display it.'; });
    } catch { if (expected === revision) state.textContent = 'Cast selection cancelled or unavailable. Choose the cast again to retry.'; }
    finally { choose.disabled = false; }
  });
  disconnect.addEventListener('click', () => stop());
  return () => stop('Action view closed.');
}

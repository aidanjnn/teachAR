/** Capability query only. Requesting an immersive session belongs to TRAIL-04. */
export async function xrAvailability(): Promise<string> {
  if (!window.isSecureContext) return 'Secure connection required';
  if (!navigator.xr) return 'WebXR unavailable in this browser';
  try {
    return await navigator.xr.isSessionSupported('immersive-ar')
      ? 'AR supported; capture is not implemented yet'
      : 'Immersive AR unavailable';
  } catch {
    return 'Unable to check AR support';
  }
}

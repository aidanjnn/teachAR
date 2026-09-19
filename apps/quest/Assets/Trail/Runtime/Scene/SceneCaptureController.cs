using System;
using System.Security.Cryptography;
using Meta.XR;
using UnityEngine;
using UnityEngine.Rendering;

namespace Trail.Runtime.Scene
{
    /// <summary>On-demand source-only MRUK readback. Owns one camera and at most one GPU readback.</summary>
    [DefaultExecutionOrder(10000)]
    public sealed class SceneCaptureController : MonoBehaviour
    {
        public PassthroughCameraAccess CameraAccess;
        public string Status { get; private set; } = "unavailable";
        public bool ReadyForCapture => foreground && isActiveAndEnabled && CameraAccess != null && CameraAccess.enabled && CameraAccess.IsPlaying && !readback;
        public bool SourceHealthy => foreground && CameraAccess != null && CameraAccess.enabled && CameraAccess.IsPlaying && Now - lastDeliveryAt <= 500;
        public string SourceSessionId => gate.SourceSessionId;
        public long SourceFrameSequence => gate.SourceFrameSequence;
        public event Action<CapturedSceneFrame> Captured;
        public event Action<string> Unavailable;
        private readonly FreshFrameGate gate = new FreshFrameGate();
        private bool paused;
        private bool focused = true;
        private bool foreground => !paused && focused;
        private bool readback;
        private double requestAt;
        private double lastDeliveryAt = double.NegativeInfinity;
        private static double Now => Time.realtimeSinceStartupAsDouble * 1000.0;
        private const string PermissionName = "horizonos.permission.HEADSET_CAMERA";

        public void EnableCamera()
        {
            if (!foreground || CameraAccess == null || !PassthroughCameraAccess.IsSupported) { Fail("camera-unsupported"); return; }
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(PermissionName))
            {
                Status = "permission-required";
                var callbacks = new UnityEngine.Android.PermissionCallbacks();
                callbacks.PermissionGranted += _ => { if (this != null && isActiveAndEnabled && foreground) EnableCamera(); };
                callbacks.PermissionDenied += _ => { if (this != null) Fail("permission-denied"); };
                UnityEngine.Android.Permission.RequestUserPermission(PermissionName, callbacks);
                return;
            }
#else
            // Editor/Link frames are not standalone Quest acceptance. This diagnostic intentionally fails closed.
            Fail("standalone-headset-required"); return;
#endif
#pragma warning disable CS0162
            CameraAccess.RequestedResolution = new Vector2Int(1280, 960);
            CameraAccess.TargetMaterial = null; // no overlay target; acquisition remains independent of scene rendering
            CameraAccess.enabled = true; Status = "starting";
#pragma warning restore CS0162
        }
        public void RequestFrame(string nonce)
        {
            if (!foreground || !isActiveAndEnabled || CameraAccess == null || !CameraAccess.enabled || !CameraAccess.IsPlaying || readback)
                throw new InvalidOperationException("Camera unavailable or busy");
            // Include any already-delivered frame in the baseline, even if this runs before LateUpdate.
            if (CameraAccess.IsUpdatedThisFrame && gate.Delivered(CameraAccess.Timestamp.Ticks, Now)) lastDeliveryAt = Now;
            gate.Begin(nonce, Now); requestAt = Now; Status = "awaiting-fresh-frame";
        }
        public void Cancel() { gate.Invalidate(); Status = "cancelled"; }
        private void LateUpdate()
        {
            if (CameraAccess == null || !CameraAccess.enabled || !foreground) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(PermissionName)) { StopCamera("permission-denied"); return; }
#endif
            if (gate.Pending && Now - requestAt > 2000) { Fail("fresh-frame-timeout"); return; }
            if (!CameraAccess.IsPlaying) return;
            if (CameraAccess.IsUpdatedThisFrame && gate.Delivered(CameraAccess.Timestamp.Ticks, Now)) lastDeliveryAt = Now;
            if (!gate.Pending) { if (!readback) Status = "ready"; return; }
            var ticket = gate.TryCopy(Now);
            if (ticket == null) return;
            var texture = CameraAccess.GetTexture();
            if (texture == null || texture.width < 1 || texture.height < 1 || texture.width > 1280 || texture.height > 1280 || !SystemInfo.supportsAsyncGPUReadback)
            { gate.ReleaseCopy(); Fail("unsupported-frame"); return; }
            readback = true; Status = "copying";
            var owned = new RenderTexture(texture.width, texture.height, 0, RenderTextureFormat.ARGB32);
            if (!owned.Create()) { Destroy(owned); readback = false; gate.ReleaseCopy(); Fail("readback-allocation-failed"); return; }
            var commands = new CommandBuffer { name = "Trail source snapshot" };
            // MRUK's native texture update is queued before this command buffer. Snapshot and readback are
            // ordered on that same queue; the retained RenderTexture cannot change with the next sensor frame.
            try {
                commands.Blit(texture, owned);
                commands.RequestAsyncReadback(owned, 0, TextureFormat.RGBA32, request => FinishReadback(request, owned, ticket));
                Graphics.ExecuteCommandBuffer(commands);
            } catch { owned.Release(); Destroy(owned); readback = false; gate.ReleaseCopy(); Fail("readback-submit-failed"); }
            finally { commands.Release(); }
        }
        private void FinishReadback(AsyncGPUReadbackRequest request, RenderTexture owned, FrameTicket ticket)
        {
            Texture2D cpu = null;
            try
            {
                if (this == null || !foreground || !isActiveAndEnabled || ticket.Generation != gate.Generation)
                { gate.Complete(ticket, Now); return; }
                if (request.hasError) { gate.ReleaseCopy(); Fail("readback-failed"); return; }
                // Copy callback-owned data before any encoding; no cached skins, screen captures or rendered camera overlays.
                var pixels = request.GetData<byte>().ToArray();
                cpu = new Texture2D(owned.width, owned.height, TextureFormat.RGBA32, false);
                cpu.LoadRawTextureData(pixels); cpu.Apply(); Array.Clear(pixels, 0, pixels.Length);
                var encoded = cpu.EncodeToJPG(85);
                if (encoded == null || encoded.Length > 2 * 1024 * 1024 || !gate.Complete(ticket, Now))
                { if (encoded != null) Array.Clear(encoded, 0, encoded.Length); Fail("stale-or-oversized-frame"); return; }
                Status = "captured";
                var frame = new CapturedSceneFrame(ticket, encoded, owned.width, owned.height);
                try { Captured?.Invoke(frame); } finally { frame.Dispose(); }
            }
            catch { gate.ReleaseCopy(); if (this != null) Fail("readback-failed"); }
            finally { if (cpu != null) Destroy(cpu); owned.Release(); Destroy(owned); readback = false; }
        }
        private void Fail(string reason) { gate.Invalidate(); Status = reason; Unavailable?.Invoke(reason); }
        private void StopCamera(string reason)
        {
            gate.Restart(); if (CameraAccess != null) CameraAccess.enabled = false; Status = reason; Unavailable?.Invoke(reason);
        }
        private void OnApplicationPause(bool paused) { this.paused = paused; if (paused) StopCamera("paused"); }
        private void OnApplicationFocus(bool focused) { this.focused = focused; if (!focused) StopCamera("focus-lost"); }
        private void OnDisable() { StopCamera("disabled"); }
        private void OnDestroy() { gate.Invalidate(); }
    }
    /// <summary>Pixels are borrowed synchronously during Captured; copy/encode for upload before returning. Sensor ticks are identity only, never server age.</summary>
    public sealed class CapturedSceneFrame : IDisposable
    {
        public readonly FrameTicket Ticket;
        public readonly byte[] Jpeg;
        public readonly int Width, Height;
        public readonly string Sha256;
        public CapturedSceneFrame(FrameTicket ticket, byte[] jpeg, int width, int height)
        {
            Ticket = ticket; Jpeg = jpeg; Width = width; Height = height;
            using (var sha = SHA256.Create()) Sha256 = BitConverter.ToString(sha.ComputeHash(jpeg)).Replace("-", "").ToLowerInvariant();
        }
        public void Dispose() { Array.Clear(Jpeg, 0, Jpeg.Length); }
    }
}

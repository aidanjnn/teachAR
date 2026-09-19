using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Trail.Runtime.Network
{
    public enum ConnectionState { Unpaired, Pairing, Ready, Unavailable, Expired }

    /// <summary>Memory-only native bearer transport. Never owns guide progression or logs request data.</summary>
    public sealed class NativeApiConnection : MonoBehaviour
    {
        [SerializeField] private string apiOrigin = "https://localhost:3443";
        [SerializeField] private bool usbLoopbackDevelopment;
        private readonly PairedSession session = new PairedSession();
        private readonly HashSet<UnityWebRequest> active = new HashSet<UnityWebRequest>();
        private long generation;
        private ConnectionPolicy policy;
        public ConnectionState State { get; private set; } = ConnectionState.Unpaired;
        public string SessionId => session.SessionId;
        public string Role => session.Role;
        public event Action<ConnectionState> StateChanged;
        public event Action SessionInvalidated;
        private static double Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        private void SetState(ConnectionState value) { State = value; StateChanged?.Invoke(value); }

        public void Configure(string origin, bool allowUsbLoopback = false)
        {
            var next = new ConnectionPolicy(origin, allowUsbLoopback && Debug.isDebugBuild);
            Disconnect(); apiOrigin = origin; usbLoopbackDevelopment = allowUsbLoopback; policy = next;
        }
        public void Pair(string code)
        {
            Disconnect();
            if (code == null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[0-9]{8}$")) { SetState(ConnectionState.Unavailable); return; }
            try { policy = new ConnectionPolicy(apiOrigin, usbLoopbackDevelopment && Debug.isDebugBuild); }
            catch (ArgumentException) { SetState(ConnectionState.Unavailable); return; }
            SetState(ConnectionState.Pairing);
            StartCoroutine(Send("POST", "/api/pair", "{\"code\":\"" + code + "\",\"client\":\"native\"}", false, (status, body) =>
            {
                if (status != 200) { SetState(ConnectionState.Unavailable); return; }
                try
                {
                    var result = JsonUtility.FromJson<PairResponse>(body);
                    if (result == null || result.client != "native") throw new ArgumentException();
                    session.Accept(result.token, result.role, result.sessionId, result.expiresAt, Now);
                    SetState(ConnectionState.Ready);
                }
                catch (Exception) { session.Clear(); SetState(ConnectionState.Unavailable); }
            }, 8192));
        }
        /// <summary>Result status 0 means transport/unavailable; callbacks suppressed after lifecycle invalidation.</summary>
        public void Request(string method, string path, string json, Action<long, string> completed)
        {
            if (completed == null) throw new ArgumentNullException(nameof(completed));
            if (!session.IsAvailable(Now)) { Disconnect(); SetState(ConnectionState.Expired); completed(0, ""); return; }
            if (method != "GET" && method != "POST" && method != "PUT" && method != "PATCH" && method != "DELETE") throw new ArgumentException("Unsupported method");
            policy.Endpoint(path); // Reject before starting a coroutine.
            StartCoroutine(Send(method, path, json, true, completed, 16 * 1024 * 1024));
        }
        private IEnumerator Send(string method, string path, string json, bool authenticated, Action<long, string> completed, int maxResponse)
        {
            var revision = generation;
            if (active.Count >= 4 || (json != null && Encoding.UTF8.GetByteCount(json) > 16 * 1024 * 1024)) { completed(0, ""); yield break; }
            using (var request = new UnityWebRequest(policy.Endpoint(path), method))
            {
                var download = new BoundedDownload(maxResponse);
                request.downloadHandler = download;
                request.redirectLimit = 0; request.timeout = 10;
                request.SetRequestHeader("Accept", "application/json");
                if (authenticated) request.SetRequestHeader("Authorization", "Bearer " + session.Token);
                if (json != null) { request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)); request.SetRequestHeader("Content-Type", "application/json"); }
                active.Add(request);
                try
                {
                    yield return request.SendWebRequest();
                    if (revision != generation) yield break;
                    if (request.responseCode == 401) { session.Clear(); SetState(ConnectionState.Expired); SessionInvalidated?.Invoke(); }
                    if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.DataProcessingError) { SetState(ConnectionState.Unavailable); completed(0, ""); }
                    else completed(request.responseCode, download.Text);
                }
                finally { active.Remove(request); }
            }
        }
        public void Disconnect()
        {
            generation++;
            foreach (var request in active) request.Abort();
            StopAllCoroutines(); active.Clear(); session.Clear(); policy = null;
            SetState(ConnectionState.Unpaired); SessionInvalidated?.Invoke();
        }
        private void Update() { if (State == ConnectionState.Ready && !session.IsAvailable(Now)) { Disconnect(); SetState(ConnectionState.Expired); } }
        private void OnDisable() => Disconnect();
        private void OnApplicationPause(bool paused) { if (paused) Disconnect(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Disconnect(); }
        [Serializable] private sealed class PairResponse { public string token; public string role; public string sessionId; public string client; public double expiresAt; }
        private sealed class BoundedDownload : DownloadHandlerScript
        {
            private readonly MemoryStream bytes = new MemoryStream();
            private readonly int limit;
            public BoundedDownload(int limit) : base(new byte[8192]) { this.limit = limit; }
            protected override bool ReceiveData(byte[] data, int length) { if (length < 0 || bytes.Length + length > limit) return false; bytes.Write(data, 0, length); return true; }
            public string Text => Encoding.UTF8.GetString(bytes.ToArray());
            public override void Dispose() { bytes.Dispose(); base.Dispose(); }
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Storage
{
    public sealed class NativeStorageFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 40;
        // Local use needs no session. Honest and obviously not a server-issued identifier.
        public const string LocalSessionId = "local-device-no-paired-session";
        public string Status { get; private set; } = "Guides stored on this headset load without pairing; publishing still needs an author pairing.";
        public string SelectedTitle => library.Length == 0 ? "No ready guide" : library[selected].Title;
        // Reflects the merged library: device-only guides count, so losing the backend does not empty it.
        public bool HasReadyGuides => library.Length > 0;
        public bool SelectedIsStoredOnDevice => library.Length > 0 && library[selected].StoredOnDevice;
        public CaptureReplaySession Capture { get; private set; }
        public event Action<Recording, string, string[]> RecordingUploaded;
        private GuideController guide;
        private NativeApiConnection connection;
        private PrivateTutorialCache cache;
        private Recording lastCapture;
        private byte[] lastNarration;
        private TutorialLibraryEntry[] library = new TutorialLibraryEntry[0];
        private int selected;
        private bool busy;
        private long generation;
        private long transportGeneration;
        private string pendingPath;
        private GuideEvent pendingTelemetry;
        private bool telemetryInFlight;
        private double lastTelemetry;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("tutorial-storage", root => root.AddComponent<NativeStorageFeature>());
        public void Initialize(PlatformContext context)
        {
            connection = context.Connection;
            // The rig is still deactivated during composition; without includeInactive the capture
            // lookup silently returned null and no recording was ever saved locally.
            Capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true); guide = context.Root.GetComponentInChildren<GuideController>(true);
            if (Capture == null) throw new InvalidOperationException("Storage requires the capture feature");
            cache = new PrivateTutorialCache(Application.persistentDataPath); cache.RecoverInterruptedWrites();
            // Populate from private storage first: the library must be useful with no server at all.
            library = TutorialLibrary.Merge(null, LocalEntries()); selected = 0;
            Status = library.Length == 0
                ? "No guide stored on this headset yet. Record one, or pair once to download a reviewed guide."
                : library.Length + " guide(s) stored on this headset. Preload needs no pairing.";
            try
            {
                lastCapture = cache.LoadLatestCapture(out var authoring);
                if (lastCapture != null)
                {
                    lastNarration = cache.LoadNarration(lastCapture);
                    if (authoring != null)
                    {
                        var takes = cache.LoadAuthoredTakes(authoring.TutorialId); var waves = new byte[takes.Length][];
                        for (var i = 0; i < takes.Length; i++) waves[i] = cache.LoadNarration(takes[i].Recording);
                        Capture.RestoreAuthoring(takes, authoring, waves);
                    }
                    else Capture.LoadRecording(lastCapture);
                }
            }
            catch (Exception) { Status = "Saved authoring state could not be restored; earlier private files are preserved."; }
            if (lastCapture != null) Status = "Saved recording restored. " + Status;
            pendingPath = Path.Combine(Application.persistentDataPath, "trail-pending-upload.json");
            if (Capture != null) Capture.RecordingCompleted += SaveCapture;
            if (guide != null) guide.Telemetry += OnTelemetry;
            connection.SessionInvalidated += Invalidated;
            connection.StateChanged += ConnectionChanged;
            var panel = new GameObject("Tutorial storage controls"); panel.transform.SetParent(context.Root.transform, false); panel.transform.position = context.TrackingSpace.TransformPoint(new Vector3(.48f, 1.15f, .8f)); panel.AddComponent<StorageControlPanel>().Storage = this;
        }
        private void SaveCapture(Recording recording)
        {
            try { cache.SaveCapture(recording, Capture.LastAuthoringMetadata, Capture.LastNarration); lastCapture = recording; lastNarration = Capture.LastNarration; Status = "Recording saved privately. Upload as author to review on desktop."; }
            catch (Exception) { Status = "Local save failed. Free private storage and record again."; }
        }
        public void UploadLastCapture()
        {
            if (busy || connection == null || connection.Role != "author") { Status = "Pair as author before uploading."; return; }
            if (File.Exists(pendingPath))
            {
                try { if (new FileInfo(pendingPath).Length > 96L*1024*1024) throw new IOException(); var pending = JsonUtility.FromJson<PendingUpload>(File.ReadAllText(pendingPath)); ResumeUpload(pending); }
                catch (Exception) { Status = "Interrupted upload metadata is invalid; inspect private storage."; }
                return;
            }
            if (Capture != null && Capture.Takes.Count > 0)
            {
                try { lastCapture = Capture.ExportTakes(); lastNarration = Capture.ExportedNarration; }
                catch (Exception) { Status = "Saved actions exceed one upload or a take is unfinished. Keep the tutorial within 120 seconds and 3600 frames."; return; }
            }
            if (lastCapture == null) { Status = "Record a new demonstration first."; return; }
            if (lastCapture.Audio != null)
            {
                try { NarrationPcm.Validate(lastNarration, lastCapture.Audio); }
                catch (ArgumentException) { Status = "Narration bytes are missing or invalid; saved motion is preserved."; return; }
            }
            busy = true; var revision = ++generation;
            var r = ContractJson.ParseRecording(ContractJson.SerializeRecording(lastCapture));
            var uploadNarration = lastNarration == null ? null : (byte[])lastNarration.Clone();
            var localTakes = new List<string>(); if (Capture != null) foreach (var take in Capture.Takes) localTakes.Add(take.Recording.Id);
            var metadata = new RecordingMetadata { SchemaVersion = r.SchemaVersion, Id = r.Id, CoordinateFrame = r.CoordinateFrame, Workspace = r.Workspace, JointOrder = r.JointOrder, NominalSampleHz = r.NominalSampleHz, DurationMs = r.DurationMs, Markers = r.Markers, Audio = r.Audio, Source = r.Source };
            connection.Request("POST", "/api/recordings", ContractJson.SerializeCreateRecordingRequest(new CreateRecordingRequest { Metadata = metadata }), (status, text) =>
            {
                if (revision != generation) return;
                try
                {
                    if (status != 200) throw new IOException();
                    var created = JsonUtility.FromJson<Created>(text); Guid parsed; if (!Guid.TryParseExact(created.id,"D",out parsed)) throw new IOException();
                    r.Id = created.id;
                    var json = ContractJson.SerializeRecording(r); var pending = new PendingUpload { id = r.Id, json = json, hash = PrivateTutorialCache.Hash(Encoding.UTF8.GetBytes(json)),
                        narrationBase64 = uploadNarration == null ? null : Convert.ToBase64String(uploadNarration), narrationHash = uploadNarration == null ? null : PrivateTutorialCache.Hash(uploadNarration), takeIds = localTakes.ToArray() };
                    WritePending(pending); busy = false; ResumeUpload(pending);
                }
                catch (Exception) { busy = false; Status = "Could not create upload. Desktop can inspect an unfinished server upload."; }
            });
        }
        private void WritePending(PendingUpload pending)
        {
            var temporary = pendingPath + ".tmp";
            if (File.Exists(temporary)) File.Delete(temporary);
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { var bytes = Encoding.UTF8.GetBytes(JsonUtility.ToJson(pending)); file.Write(bytes,0,bytes.Length); file.Flush(true); }
            if (File.Exists(pendingPath)) File.Replace(temporary,pendingPath,null); else File.Move(temporary,pendingPath);
        }
        private void ResumeUpload(PendingUpload pending)
        {
            Guid parsed; if (!Guid.TryParseExact(pending.id,"D",out parsed)) throw new IOException();
            var recording = ContractJson.ParseRecording(pending.json); var bytes = Encoding.UTF8.GetBytes(pending.json);
            if (recording.Id != pending.id || bytes.Length > PrivateTutorialCache.MaximumRecordingBytes || PrivateTutorialCache.Hash(bytes) != pending.hash) throw new IOException();
            byte[] narration = null;
            if (recording.Audio != null)
            {
                if (string.IsNullOrEmpty(pending.narrationBase64) || pending.narrationBase64.Length > 16 * 1024 * 1024) throw new IOException("Missing narration upload.");
                narration = Convert.FromBase64String(pending.narrationBase64); NarrationPcm.Validate(narration, recording.Audio);
                if (PrivateTutorialCache.Hash(narration) != pending.narrationHash) throw new IOException("Narration upload integrity failed.");
            }
            else if (!string.IsNullOrEmpty(pending.narrationBase64)) throw new IOException("Undeclared narration upload.");
            busy = true; var revision = ++generation; var count = (bytes.Length + 1024 * 1024 - 1) / (1024 * 1024);
            Action<int> send = null;
            send = index =>
            {
                if (revision != generation) return;
                if (index == count)
                {
                    connection.Request("POST", "/api/recordings/" + pending.id + "/finalize-bytes", ContractJson.SerializeFinalizeRecordingRequest(new FinalizeRecordingRequest { ChunkCount = count, Sha256 = pending.hash }), (status,text) =>
                    {
                        if (revision != generation) return;
                        if (status != 200) { busy = false; Status = "Upload finalization failed. Retry preserves the saved recording."; return; }
                        RecordingUploaded?.Invoke(recording, pending.hash, pending.takeIds ?? Array.Empty<string>());
                        connection.Request("POST", "/api/tutorial-jobs", "{\"recordingId\":\"" + pending.id + "\",\"recordingHash\":\"" + pending.hash + "\",\"segmentationRevision\":1}", (jobStatus,jobText) =>
                        {
                            if (revision != generation) return; busy = false;
                            if (jobStatus != 202) { Status = "Recording saved on server; retry compilation from desktop."; return; }
                            var job = JsonUtility.FromJson<Job>(jobText);
                            if (job.status == "complete") { File.Delete(pendingPath); Status = "Draft ready. Review every step on the desktop."; }
                            else Status = "Recording preserved. Segmentation needs boundary review or a new recording.";
                        }, timeoutSeconds: 60);
                    }); return;
                }
                var length = Math.Min(1024 * 1024, bytes.Length-index*1024*1024); var part = new byte[length]; Buffer.BlockCopy(bytes,index*1024*1024,part,0,length);
                Status = "Uploading motion " + (index+1) + "/" + count;
                var body = "{\"dataBase64\":\""+Convert.ToBase64String(part)+"\",\"sha256\":\""+PrivateTutorialCache.Hash(part)+"\"}";
                connection.Request("PUT", "/api/recordings/"+pending.id+"/bytes/"+index,body,(status,text) => { if (revision != generation) return; if (status != 200) { busy=false; Status="Upload interrupted. Tap Upload to retry identical chunks."; return; } send(index+1); });
            };
            if (narration == null) send(0);
            else
            {
                Status = "Uploading synchronized narration.";
                connection.RequestBytes("PUT", "/api/recordings/" + pending.id + "/narration", narration, "audio/wav", (status, text) =>
                {
                    if (revision != generation) return;
                    if (status != 200) { busy = false; Status = "Narration upload interrupted. Retry uses the same saved bytes."; return; }
                    try { if (JsonUtility.FromJson<NarrationUpload>(text).sha256 != pending.narrationHash) throw new IOException(); }
                    catch (Exception) { busy = false; Status = "Server narration checksum did not match; motion was not finalized."; return; }
                    send(0);
                });
            }
        }
        /// <summary>Server refresh stays a paired operation; it merges into, never replaces, local entries.</summary>
        public void RefreshLibrary()
        {
            if (busy || connection == null) return;
            if (connection.State != ConnectionState.Ready)
            { Status = "Pair to refresh from the server. Guides already on this headset stay available."; return; }
            busy=true; var revision=++generation;
            connection.Request("GET","/api/tutorials",null,(status,text) => {
                if(revision!=generation)return; busy=false;
                TutorialItem[] fetched=null;
                try { if(status!=200)throw new IOException(); fetched=JsonUtility.FromJson<Library>("{\"items\":"+text+"}").items ?? new TutorialItem[0]; }
                catch(Exception) { fetched=null; }
                library=TutorialLibrary.Merge(Rows(fetched),LocalEntries()); selected=0;
                Status=fetched==null
                    ? "Server library unavailable. "+library.Length+" guide(s) on this headset remain available."
                    : library.Length+" guide(s) listed; those already on this headset load without pairing.";
            });
        }
        private CachedTutorial[] LocalEntries()
        { try { return cache.ListReady(); } catch (Exception) { return new CachedTutorial[0]; } }
        /// <summary>Server rows that fail validation are dropped rather than shown as loadable.</summary>
        private static TutorialLibraryEntry[] Rows(TutorialItem[] items)
        {
            var rows = new List<TutorialLibraryEntry>();
            foreach (var item in items ?? new TutorialItem[0])
            {
                if (item == null || item.status != "ready") continue;
                try { rows.Add(new TutorialLibraryEntry(item.id, item.revision, item.title, item.steps, false)); }
                catch (ArgumentException) { }
            }
            return rows.ToArray();
        }
        public void NextGuide() { if(library.Length>0)selected=(selected+1)%library.Length; }
        /// <summary>Local-first. A guide already on this headset loads with no server, no pairing and no
        /// role; only downloading one that is absent needs the learner role.</summary>
        public void PreloadSelected()
        {
            if(busy || library.Length==0 || guide==null) { Status="Record or download a guide before preloading."; return; }
            var item=library[selected];
            var paired=connection!=null && connection.State==ConnectionState.Ready && connection.Role=="learner" && !string.IsNullOrWhiteSpace(connection.SessionId);
            try {
                // Load re-verifies the stored recording against its stored hash; nothing unverified passes here.
                var cached=cache.Load(item.Id,item.Revision);
                guide.Preload(cached.Tutorial,cached.Recording,cached.RecordingHash,paired?connection.SessionId:LocalSessionId,cached.Recording.Source!="live");
                Status=(paired?"Loaded from this headset's storage; spectator telemetry uses the paired session. ":"Loaded from this headset's storage with no pairing. ")
                    +"Independently calibrate the learner workspace.";
                return;
            } catch(Exception) { }
            var listedLocally=false;
            foreach(var local in LocalEntries()) if(local.Id==item.Id && local.Revision==item.Revision) listedLocally=true;
            if(connection==null || connection.Role!="learner")
            { Status=listedLocally?"This headset's copy failed its integrity check. Pair as learner to download it again.":"That guide is not on this headset. Pair as learner to download it."; return; }
            busy=true; var revision=++generation;
            connection.Request("GET","/api/tutorials/"+item.Id,null,(status,text)=> {
                if(revision!=generation)return;
                try {
                    if(status!=200)throw new IOException(); var tutorial=ContractJson.ParseTutorial(text); if(tutorial.Status!="ready")throw new IOException(); var tutorialBytes=Encoding.UTF8.GetBytes(text);
                    connection.Request("GET","/api/recordings/"+tutorial.RecordingId+"/download",null,(metaStatus,metaText)=> {
                        if(revision!=generation)return;
                        try {
                            if(metaStatus!=200)throw new IOException(); var download=JsonUtility.FromJson<Download>(metaText);
                            if(download.bytes<=0 || download.bytes>PrivateTutorialCache.MaximumRecordingBytes || download.chunkCount<=0 || download.chunkCount>64 || download.sha256!=tutorial.RecordingHash)throw new IOException();
                            var data=new MemoryStream(); Action<int> get=null;
                            get=index=> {
                                if(revision!=generation) { data.Dispose(); return; }
                                if(index==download.chunkCount) {
                                    try { if(data.Length!=download.bytes)throw new IOException(); var loaded=cache.StoreReady(tutorialBytes,data.ToArray(),download.sha256); guide.Preload(loaded.Tutorial,loaded.Recording,loaded.RecordingHash,connection.SessionId,loaded.Recording.Source!="live"); library=TutorialLibrary.Merge(library,LocalEntries()); Status="Downloaded and stored on this headset; future loads need no pairing. Calibrate this learner workspace before starting."; }
                                    catch(Exception) { Status="Preload integrity or private storage check failed."; }
                                    finally { data.Dispose(); busy=false; } return;
                                }
                                connection.Request("GET","/api/recordings/"+tutorial.RecordingId+"/content/"+index,null,(partStatus,partText)=> {
                                    if(revision!=generation) { data.Dispose(); return; }
                                    try { if(partStatus!=200)throw new IOException(); var part=Convert.FromBase64String(JsonUtility.FromJson<BytePart>(partText).dataBase64); if(part.Length>1024*1024 || data.Length+part.Length>download.bytes)throw new IOException(); data.Write(part,0,part.Length); get(index+1); }
                                    catch(Exception) { data.Dispose(); busy=false; Status="Preload interrupted. Retry before starting the guide."; }
                                });
                            }; get(0);
                        } catch(Exception) { busy=false; Status="Recording download metadata invalid or unavailable."; }
                    });
                } catch(Exception) { busy=false; Status="Ready tutorial unavailable."; }
            });
        }
        private void ConnectionChanged(ConnectionState state)
        {
            if (state == ConnectionState.Ready && connection.Role == "learner" && guide != null) guide.RebindTelemetrySession(connection.SessionId);
        }
        private void OnTelemetry(GuideEvent value) { pendingTelemetry=value; }
        private void Update()
        {
            if(connection==null || connection.State!=ConnectionState.Ready || connection.Role!="learner" || telemetryInFlight || pendingTelemetry==null || MotionClock.NowMs-lastTelemetry<100)return;
            var value=pendingTelemetry; pendingTelemetry=null; telemetryInFlight=true; lastTelemetry=MotionClock.NowMs; var revision=transportGeneration;
            connection.Request("POST","/api/guide-events",ContractJson.SerializeGuideEvent(value),(status,text)=> { if(revision!=transportGeneration)return; telemetryInFlight=false; });
        }
        private void Invalidated() { generation++; transportGeneration++; busy=false; telemetryInFlight=false; pendingTelemetry=null; Status="Backend disconnected. Loaded guidance stays local; reconnect to sync."; }
        private void OnDestroy() { if(Capture!=null)Capture.RecordingCompleted-=SaveCapture; if(guide!=null)guide.Telemetry-=OnTelemetry; if(connection!=null) { connection.SessionInvalidated-=Invalidated; connection.StateChanged-=ConnectionChanged; } }
        [Serializable] private sealed class PendingUpload { public string id,json,hash,narrationBase64,narrationHash; public string[] takeIds; }
        [Serializable] private sealed class NarrationUpload { public string sha256; }
        [Serializable] private sealed class Created { public string id; }
        [Serializable] private sealed class Job { public string status; }
        [Serializable] private sealed class TutorialItem { public string id,title,status; public int revision,steps; }
        [Serializable] private sealed class Library { public TutorialItem[] items; }
        [Serializable] private sealed class Download { public string sha256; public int bytes,chunkCount; }
        [Serializable] private sealed class BytePart { public string dataBase64; }
    }
}

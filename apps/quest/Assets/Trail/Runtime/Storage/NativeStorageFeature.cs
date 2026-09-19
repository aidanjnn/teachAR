using System;
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
        public string Status { get; private set; } = "Record locally, upload as author, review on desktop, then preload as learner.";
        public string SelectedTitle => library.Length == 0 ? "No ready guide" : library[selected].title;
        public CaptureReplaySession Capture { get; private set; }
        private GuideController guide;
        private NativeApiConnection connection;
        private PrivateTutorialCache cache;
        private Recording lastCapture;
        private TutorialItem[] library = new TutorialItem[0];
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
            connection = context.Connection; Capture = context.Root.GetComponentInChildren<CaptureReplaySession>(); guide = context.Root.GetComponentInChildren<GuideController>();
            cache = new PrivateTutorialCache(Application.persistentDataPath); cache.RecoverInterruptedWrites();
            try { lastCapture = cache.LoadLatestCapture(); if (lastCapture != null) Status = "Saved recording restored. Upload as author to review on desktop."; } catch (Exception) { }
            pendingPath = Path.Combine(Application.persistentDataPath, "trail-pending-upload.json");
            if (Capture != null) Capture.RecordingCompleted += SaveCapture;
            if (guide != null) guide.Telemetry += OnTelemetry;
            connection.SessionInvalidated += Invalidated;
            connection.StateChanged += ConnectionChanged;
            var panel = new GameObject("Tutorial storage controls"); panel.transform.SetParent(context.Root.transform, false); panel.transform.position = context.TrackingSpace.TransformPoint(new Vector3(.48f, 1.15f, .8f)); panel.AddComponent<StorageControlPanel>().Storage = this;
        }
        private void SaveCapture(Recording recording)
        {
            try { cache.SaveCapture(recording); lastCapture = recording; Status = "Recording saved privately. Upload as author to review on desktop."; }
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
            if (lastCapture == null) { Status = "Record a new demonstration first."; return; }
            if (lastCapture.Audio != null) { Status = "Narration upload is provided by the voice integration."; return; }
            busy = true; var revision = ++generation;
            var r = ContractJson.ParseRecording(ContractJson.SerializeRecording(lastCapture));
            var metadata = new RecordingMetadata { SchemaVersion = r.SchemaVersion, Id = r.Id, CoordinateFrame = r.CoordinateFrame, Workspace = r.Workspace, JointOrder = r.JointOrder, NominalSampleHz = r.NominalSampleHz, DurationMs = r.DurationMs, Markers = r.Markers, Audio = r.Audio, Source = r.Source };
            connection.Request("POST", "/api/recordings", ContractJson.SerializeCreateRecordingRequest(new CreateRecordingRequest { Metadata = metadata }), (status, text) =>
            {
                if (revision != generation) return;
                try
                {
                    if (status != 200) throw new IOException();
                    var created = JsonUtility.FromJson<Created>(text); Guid parsed; if (!Guid.TryParseExact(created.id,"D",out parsed)) throw new IOException();
                    r.Id = created.id;
                    var json = ContractJson.SerializeRecording(r); var pending = new PendingUpload { id = r.Id, json = json, hash = PrivateTutorialCache.Hash(Encoding.UTF8.GetBytes(json)) };
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
                        connection.Request("POST", "/api/tutorial-jobs", "{\"recordingId\":\"" + pending.id + "\",\"recordingHash\":\"" + pending.hash + "\",\"segmentationRevision\":1}", (jobStatus,jobText) =>
                        {
                            if (revision != generation) return; busy = false;
                            if (jobStatus != 202) { Status = "Recording saved on server; retry compilation from desktop."; return; }
                            var job = JsonUtility.FromJson<Job>(jobText);
                            if (job.status == "complete") { File.Delete(pendingPath); Status = "Draft ready. Review every step on the desktop."; }
                            else Status = "Recording preserved. Segmentation needs boundary review or a new recording.";
                        });
                    }); return;
                }
                var length = Math.Min(1024 * 1024, bytes.Length-index*1024*1024); var part = new byte[length]; Buffer.BlockCopy(bytes,index*1024*1024,part,0,length);
                Status = "Uploading motion " + (index+1) + "/" + count;
                var body = "{\"dataBase64\":\""+Convert.ToBase64String(part)+"\",\"sha256\":\""+PrivateTutorialCache.Hash(part)+"\"}";
                connection.Request("PUT", "/api/recordings/"+pending.id+"/bytes/"+index,body,(status,text) => { if (revision != generation) return; if (status != 200) { busy=false; Status="Upload interrupted. Tap Upload to retry identical chunks."; return; } send(index+1); });
            };
            send(0);
        }
        public void RefreshLibrary()
        {
            if (busy || connection == null) return; busy=true; var revision=++generation;
            connection.Request("GET","/api/tutorials",null,(status,text) => {
                if(revision!=generation)return; busy=false;
                try { if(status!=200)throw new IOException(); library=JsonUtility.FromJson<Library>("{\"items\":"+text+"}").items ?? new TutorialItem[0]; selected=0; Status=library.Length+" finalized guides available."; }
                catch(Exception) { Status="Guide library unavailable. An already loaded guide remains local."; }
            });
        }
        public void NextGuide() { if(library.Length>0)selected=(selected+1)%library.Length; }
        public void PreloadSelected()
        {
            if(busy || library.Length==0 || guide==null || connection.Role!="learner") { Status="Choose a ready guide and pair as learner."; return; }
            var item=library[selected];
            try { var cached=cache.Load(item.id,item.revision); guide.Preload(cached.Tutorial,cached.Recording,cached.RecordingHash,connection.SessionId,cached.Recording.Source!="live"); Status="Cached guide loaded. Independently calibrate the learner workspace."; return; } catch(Exception) { }
            busy=true; var revision=++generation;
            connection.Request("GET","/api/tutorials/"+item.id,null,(status,text)=> {
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
                                    try { if(data.Length!=download.bytes)throw new IOException(); var loaded=cache.StoreReady(tutorialBytes,data.ToArray(),download.sha256); guide.Preload(loaded.Tutorial,loaded.Recording,loaded.RecordingHash,connection.SessionId,loaded.Recording.Source!="live"); Status="Guide preloaded. Calibrate this learner workspace before starting."; }
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
        [Serializable] private sealed class PendingUpload { public string id,json,hash; }
        [Serializable] private sealed class Created { public string id; }
        [Serializable] private sealed class Job { public string status; }
        [Serializable] private sealed class TutorialItem { public string id,title,status; public int revision,steps; }
        [Serializable] private sealed class Library { public TutorialItem[] items; }
        [Serializable] private sealed class Download { public string sha256; public int bytes,chunkCount; }
        [Serializable] private sealed class BytePart { public string dataBase64; }
    }
}

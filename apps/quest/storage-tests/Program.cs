using System;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;
using Trail.Runtime.Storage;
class Program
{
    static int checks;
    static void Check(bool result, string name) { if (!result) throw new Exception(name); checks++; }
    static void Throws(Action action, string name) { try { action(); } catch { checks++; return; } throw new Exception(name); }
    static void Main()
    {
        var root = Path.Combine(Path.GetTempPath(), "trail-cache-" + Guid.NewGuid().ToString("N"));
        try
        {
            var recording = File.ReadAllBytes("fixtures/contracts/recording.json");
            var hash = PrivateTutorialCache.Hash(recording);
            var tutorial = JsonNode.Parse(File.ReadAllText("fixtures/contracts/tutorial.json"));
            var id = Guid.NewGuid().ToString("D");
            tutorial["id"] = id; tutorial["recordingHash"] = hash; tutorial["status"] = "ready";
            var bytes = Encoding.UTF8.GetBytes(tutorial.ToJsonString());
            var cache = new PrivateTutorialCache(root);
            var loaded = cache.StoreReady(bytes, recording, hash);
            Check(loaded.Tutorial.Id == id, "preload identity");
            var reloaded = new PrivateTutorialCache(root).Load(id, loaded.Tutorial.Revision);
            Check(reloaded.RecordingHash == hash, "restart hash");
            Check(cache.StoreReady(bytes, recording, hash).Tutorial.Id == id, "idempotent preload");
            Throws(() => cache.StoreReady(bytes, recording, new string('0',64)), "hash mismatch");
            Throws(() => cache.Load("../escape", 1), "containment");
            tutorial["steps"][0]["instruction"] = "changed after ready";
            Throws(() => cache.StoreReady(Encoding.UTF8.GetBytes(tutorial.ToJsonString()), recording, hash), "immutable cache");
            tutorial["status"] = "draft";
            Throws(() => cache.StoreReady(Encoding.UTF8.GetBytes(tutorial.ToJsonString()), recording, hash), "draft rejected");
            var limited = new PrivateTutorialCache(root + "-full", () => 0);
            Throws(() => limited.StoreReady(bytes, recording, hash), "insufficient disk space");
            var pending = Path.Combine(root, "trail-cache", ".pending-test"); Directory.CreateDirectory(pending); File.WriteAllText(Path.Combine(pending, "partial"), "incomplete");
            cache.RecoverInterruptedWrites(); Check(!Directory.Exists(pending), "interrupted preload removed");
            var folder = Path.Combine(root, "trail-cache", id + "-" + loaded.Tutorial.Revision);
            File.WriteAllText(Path.Combine(folder, "recording.json"), "{}");
            Throws(() => cache.Load(id, loaded.Tutorial.Revision), "corruption rejected");
            // Already loaded guide retains independent data through disk/network failure.
            Check(loaded.Recording.Frames.Length > 0 && loaded.Tutorial.Status == "ready", "open guide survives storage loss");
            var saved = cache.SaveCapture(loaded.Recording); Check(File.Exists(Path.Combine(root, "trail-cache", saved)), "capture atomically persisted");
            var restored = new PrivateTutorialCache(root).LoadLatestCapture();
            Check(restored != null && restored.Id == loaded.Recording.Id && restored.Frames.Length == loaded.Recording.Frames.Length, "saved capture restored after restart");
            File.WriteAllText(Path.Combine(root, "trail-cache", "capture-corrupt.json"), "{");
            Check(new PrivateTutorialCache(root).LoadLatestCapture() != null, "corrupt capture skipped in favour of valid one");
            Console.WriteLine("Native storage behavior: " + checks + " checks passed (.NET; no Unity/device claim)");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root,true); if (Directory.Exists(root + "-full")) Directory.Delete(root + "-full",true); }
    }
}

using System;
using System.IO;
using System.Text;
using Trail.Contracts;
using Trail.Runtime.Storage;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("usage: Seed <staging-dir> [tutorial-guid]");
            return 2;
        }
        var staging = Path.GetFullPath(args[0]);
        // A stable default id keeps repeated seeding idempotent: StoreReady treats an
        // identical ready tutorial as immutable rather than duplicating it.
        var id = args.Length > 1 ? args[1] : "8f14e45f-ceea-467a-9bd6-1a0dfd2d9f11";
        if (!Guid.TryParseExact(id, "D", out _))
        { Console.Error.WriteLine("tutorial id must be a D-format GUID"); return 2; }

        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../.."));
        var recordingPath = Path.Combine(root, "fixtures/contracts/recording.json");
        var tutorialPath = Path.Combine(root, "fixtures/contracts/tutorial.json");
        if (!File.Exists(recordingPath) || !File.Exists(tutorialPath))
        { Console.Error.WriteLine("fixtures not found under " + root); return 2; }

        // Hash the exact bytes that will be stored; re-serialising would change the hash.
        var recordingJson = File.ReadAllBytes(recordingPath);
        var recordingHash = PrivateTutorialCache.Hash(recordingJson);

        var tutorial = ContractJson.ParseTutorial(File.ReadAllText(tutorialPath));
        tutorial.Id = id;
        tutorial.RecordingHash = recordingHash;
        var tutorialJson = new UTF8Encoding(false).GetBytes(ContractJson.SerializeTutorial(tutorial));

        Directory.CreateDirectory(staging);
        // Real validation: binding, hash, workspace and every target derived from a recorded wrist.
        var cache = new PrivateTutorialCache(staging, () => long.MaxValue);
        var stored = cache.StoreReady(tutorialJson, recordingJson, recordingHash);
        // Prove it reloads exactly as the runtime will.
        var reloaded = cache.Load(stored.Tutorial.Id, stored.Tutorial.Revision);

        Console.WriteLine("seeded " + Path.Combine(staging, "trail-cache"));
        Console.WriteLine("  tutorial " + reloaded.Tutorial.Id + " revision " + reloaded.Tutorial.Revision +
            ", " + reloaded.Tutorial.Steps.Length + " step(s), status " + reloaded.Tutorial.Status);
        Console.WriteLine("  recording " + reloaded.Recording.Id + ", " + reloaded.Recording.Frames.Length +
            " frames, source " + reloaded.Recording.Source);
        Console.WriteLine("  recording sha256 " + reloaded.RecordingHash);
        Console.WriteLine("SYNTHETIC FIXTURE: not a human demonstration, teaches no physical task, and");
        Console.WriteLine("the runtime preloads it as a synthetic diagnostic and says so in the headset.");
        return 0;
    }
}

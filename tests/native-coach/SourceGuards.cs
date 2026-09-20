using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Trail.Tests.Coach
{
    /// <summary>
    /// Static dependency and asset guards, independent of the separate adapter behavioral harness.
    /// These checks alone prove nothing about runtime behaviour on a headset.
    /// </summary>
    public static class SourceGuards
    {
        public static int Checks { get; private set; }
        private static readonly string[] PureFiles =
        {
            "CoachContext.cs", "CoachWire.cs", "CoachJson.cs", "CoachSessionState.cs", "CoachSession.cs", "CoachTransport.cs",
        };
        private const string Adapter = "NativeVoiceCoach.cs";

        public static int RunAll()
        {
            var folder = Path.Combine(Root(), "apps", "quest", "Assets", "Trail", "Runtime", "Coach");
            PureLayerStaysPure(folder);
            AdapterNeverDrivesTheGuide(folder);
            EveryAssetHasAMetaFile(folder);
            return 3;
        }

        private static void PureLayerStaysPure(string folder)
        {
            // The pure build already proves this by referencing nothing; this catches a stray using before it compiles in Unity.
            var forbidden = new[] { "UnityEngine", "UnityEditor", "System.IO", "System.Net", "System.Threading", "DateTime", "Stopwatch", "Console.", "Debug." };
            foreach (var file in PureFiles)
            {
                var text = File.ReadAllText(Path.Combine(folder, file));
                foreach (var token in forbidden)
                    Check(text.IndexOf(token, StringComparison.Ordinal) < 0, file + " holds no " + token);
                Check(text.IndexOf("Random", StringComparison.Ordinal) < 0, file + " draws no randomness");
            }
            var compiled = File.ReadAllText(Path.Combine(Root(), "tests", "native-coach", "CoachPure.csproj"));
            foreach (var file in PureFiles)
                Check(compiled.Contains("/Coach/" + file + "\""), file + " is compiled by the pure harness project");
            var compiledLines = compiled.Split('\n').Where(line => line.Contains("<Compile")).ToArray();
            Check(compiledLines.Length == PureFiles.Length, "the pure build compiles only the pure files");
            Check(!compiledLines.Any(line => line.Contains(Adapter)), "the MonoBehaviour adapter is excluded from the pure build");
            Check(!compiled.Contains("<Reference") && !compiled.Contains("PackageReference"), "the pure build resolves no external assembly");
        }

        private static void AdapterNeverDrivesTheGuide(string folder)
        {
            var text = File.ReadAllText(Path.Combine(folder, Adapter));
            var progression = new[]
            {
                "StartStep", "ConfirmStep", "GuideAction", "GuideInput", "GuideEffect", "PauseForInspection",
                "Guide.Pause", "Guide.Resume", "Guide.Repeat", "Session.Dispatch(new Guide", ".Invalidate(",
            };
            foreach (var call in progression)
                Check(text.IndexOf(call, StringComparison.Ordinal) < 0, "the coach adapter never calls " + call);
            Check(text.Contains("GuideTelemetry.Context("), "the coach adapter reads guide identity through the shared read-only helper");
            // Every exit path Unity can deliver is handled, and each one funnels into the pure reducer.
            foreach (var hook in new[] { "OnApplicationPause", "OnApplicationFocus", "OnDisable", "OnDestroy" })
                Check(text.Contains(hook), "the coach adapter handles " + hook);
            Check(text.Contains("Microphone.Release()"), "the coach adapter releases the microphone device");
            Check(Regex.IsMatch(text, @"if \(Microphone != null\) Microphone\.Release\(\);\s*\n\s*if \(Transport != null\)"),
                "the microphone is released before anything that can fail");
            foreach (var word in new[] { "Bearer", "Authorization", "apiKey", "OPENAI" })
                Check(text.IndexOf(word, StringComparison.Ordinal) < 0, "the coach adapter names no credential (" + word + ")");
            Check(!Regex.IsMatch(text, @"Debug\.Log\w*\("), "the coach adapter logs nothing at all");
        }

        private static void EveryAssetHasAMetaFile(string folder)
        {
            var guids = new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
            foreach (var path in Directory.GetFiles(folder).Where(path => !path.EndsWith(".meta", StringComparison.Ordinal)).OrderBy(path => path, StringComparer.Ordinal))
            {
                var meta = path + ".meta";
                Check(File.Exists(meta), Path.GetFileName(path) + " has a sibling .meta file");
                var guid = Regex.Match(File.ReadAllText(meta), "^guid: ([a-f0-9]{32})$", RegexOptions.Multiline);
                Check(guid.Success, Path.GetFileName(meta) + " carries a 32-hex GUID");
                Check(guids.Add(guid.Groups[1].Value), Path.GetFileName(meta) + " carries a GUID unique in this folder");
            }
            Check(File.Exists(Path.Combine(folder, "Trail.Coach.asmdef")), "the coach assembly definition exists");
            var asmdef = File.ReadAllText(Path.Combine(folder, "Trail.Coach.asmdef"));
            Check(asmdef.Contains("\"Trail.Guide\""), "the coach assembly may read the guide assembly");
            Check(!asmdef.Contains("\"noEngineReferences\": true"), "the coach assembly carries the adapter, so it keeps engine references");
        }

        private static string Root()
        {
            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            while (directory != null && !Directory.Exists(Path.Combine(directory.FullName, "apps", "quest"))) directory = directory.Parent;
            if (directory == null) throw new Exception("FAILED: could not locate the repository root from " + AppContext.BaseDirectory);
            return directory.FullName;
        }

        private static void Check(bool condition, string what)
        {
            Checks++;
            if (!condition) throw new Exception("FAILED: " + what);
        }
    }
}

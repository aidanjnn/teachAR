using System;
using System.IO;
using System.Linq;
using Trail.Contracts;
using Trail.Runtime.Record;
using Trail.Runtime.Storage;

internal static class Program
{
    private static int checks;
    private static void Check(bool condition, string message) { checks++; if (!condition) throw new Exception(message); }
    private static void Reject(Action action) { checks++; try { action(); } catch (ArgumentException) { return; } throw new Exception("Expected rejection"); }
    private static int Main(string[] args)
    {
        var temp = Path.Combine(Path.GetTempPath(), "trail-narration-" + Guid.NewGuid().ToString("N"));
        try
        {
            var samples = new short[] { short.MinValue, -1, 0, 1, short.MaxValue };
            var wave = NarrationPcm.Encode(samples);
            Check(NarrationPcm.Decode(wave).SequenceEqual(samples), "PCM signed extremes round trip");
            Check(wave.Length == 54 && wave[22] == 1 && wave[34] == 16, "canonical PCM16 mono header");
            Reject(() => NarrationPcm.Decode(wave.Take(53).ToArray()));
            var bad = (byte[])wave.Clone(); bad[24] = 0; Reject(() => NarrationPcm.Decode(bad));
            var timeline = new NarrationTimeline();
            timeline.AppendTo(100, (_, __) => 111);
            timeline.AppendTo(100, (_, __) => throw new Exception("paused time must not read microphone"));
            timeline.AppendTo(200, (_, __) => 222);
            timeline.AppendTo(300, (_, __) => 333); // return gesture, trimmed below
            var kept = NarrationPcm.Decode(timeline.Trim(50, 150));
            Check(kept.Length == 7200 && kept.Take(2400).All(v => v == 111) && kept.Skip(2400).All(v => v == 222), "pause omitted and half-open trim excludes return audio");
            Reject(() => timeline.AppendTo(299, (_, __) => 0));
            Reject(() => timeline.Trim(250, 100));
            Reject(() => NarrationPcm.SampleAt(120001));
            var recording = ContractJson.ParseRecording(File.ReadAllText("fixtures/contracts/recording.json"));
            recording.Audio = NarrationPcm.Metadata(timeline.Trim(0, recording.DurationMs));
            var takeWave = timeline.Trim(0, recording.DurationMs);
            if (args.Length == 1)
            {
                var export = Path.GetFullPath(args[0]); Directory.CreateDirectory(export);
                File.WriteAllBytes(Path.Combine(export, "narration.wav"), takeWave);
                File.WriteAllText(Path.Combine(export, "recording.json"), ContractJson.SerializeRecording(recording));
            }
            var combined = NarrationPcm.Join(new[] { recording, recording }, new[] { takeWave, takeWave });
            var joined = NarrationPcm.Decode(combined); var second = NarrationPcm.SampleAt(recording.DurationMs + 1000.0 / 30);
            Check(joined.Take(NarrationPcm.SampleAt(recording.DurationMs)).All(v => v == 111), "first take preserved");
            Check(joined.Skip(NarrationPcm.SampleAt(recording.DurationMs)).Take(second - NarrationPcm.SampleAt(recording.DurationMs)).All(v => v == 0), "inter-take motion gap is silence");
            Check(joined.Skip(second).All(v => v == 111), "second take aligned with exported motion boundary");
            Reject(() => NarrationPcm.Join(new[] { recording }, new byte[][] { null }));
            var cache = new PrivateTutorialCache(temp);
            cache.SaveCapture(recording, narration: takeWave);
            var reloaded = new PrivateTutorialCache(temp).LoadLatestCapture();
            Check(reloaded != null && cache.LoadNarration(reloaded).SequenceEqual(takeWave), "private narration survives restart with integrity verification");
            var changed = NarrationPcm.Decode(takeWave); changed[0]++;
            var immutable = false; try { cache.SaveCapture(recording, narration: NarrationPcm.Encode(changed)); } catch (IOException) { immutable = true; }
            Check(immutable, "same recording identity cannot rewrite saved narration");
            var path = Directory.GetFiles(temp, "narration.wav", SearchOption.AllDirectories).Single();
            var corrupt = File.ReadAllBytes(path); corrupt[44] ^= 1; File.WriteAllBytes(path, corrupt);
            Check(cache.LoadLatestCapture() == null, "corrupt narration cannot restore a misleading complete capture");
            Console.WriteLine("PASS: " + checks + " narration assertions (synthetic PCM, pause/trim alignment, take merge, private persistence). No device/audio/provider execution.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
    }
}

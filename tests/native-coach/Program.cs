using System;
using Trail.Tests.Coach;

internal static class Program
{
    private static int Main()
    {
        try
        {
            var reducer = CoachScenarios.RunAll();
            var wire = CoachJsonScenarios.RunAll();
            var guards = SourceGuards.RunAll();
            Console.WriteLine($"PASS: {reducer} coach session scenarios, {CoachScenarios.Checks} assertions (actual pure C#, compiled with no Unity, Meta, contracts or motion reference).");
            Console.WriteLine($"PASS: {wire} coach wire scenarios, {CoachJsonScenarios.Checks} assertions (strict encoding and parsing; no server, provider or network contacted).");
            Console.WriteLine($"PASS: {guards} source guards, {SourceGuards.Checks} assertions (static dependency and asset checks; separate AdapterHarness exercises the adapter).");
            Console.WriteLine("LIMITS: no Unity compilation, no APK, no microphone, no WebRTC transport, no GPT Live session, no headset. " +
                              "Native adapters are covered separately by Unity compilation and injected-effect runtime tests.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}

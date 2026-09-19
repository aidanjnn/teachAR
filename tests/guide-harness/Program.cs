using System;
using Trail.Tests.Guide;

internal static class Program
{
    private static int Main()
    {
        try
        {
            var count = GuideScenarios.RunAll();
            Console.WriteLine($"PASS: {count} real C# guide scenarios. Source: synthetic diagnostic; no physical tracking, Unity or headset claim.");
            Console.WriteLine(GuideScenarios.DiagnosticTrace());
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}

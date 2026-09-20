using System;
using Trail.Tests.EditMode;
CaptureFixtureAssertions.RunAll();
Console.WriteLine("PASS: native capture domain fixtures (actual C#; not Unity or headset evidence)");
RecordingFixtureAssertions.RunAll();
Console.WriteLine("PASS: save position and take lifecycle fixtures (actual C#; not Unity or headset evidence)");

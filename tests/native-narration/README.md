# Native narration diagnostic

Run `dotnet run --project tests/native-narration/Narration.csproj` from the repository root.
An optional output directory writes a synthetic `narration.wav` and matching
`recording.json` for cross-language boundary tests.

Checks compile the actual canonical PCM16 mono WAV codec, paused-time-free sample
assembly, half-open trimming, inter-take motion/audio alignment, and private
persistence/integrity. Unity capture lifecycle tests additionally inject synthetic
audio into the real recording director. Neither proves microphone timing or audio
quality on Quest. Native capture declares a 100 ms estimated synchronization bound
and rejects overruns/drift outside that bound; hardware measurements are still needed.

# Native storage diagnostics

From the repository root, run `dotnet run --project apps/quest/storage-tests/Storage.csproj`.
This dependency-free .NET harness compiles the real canonical parser and cache; it tests
hash binding, restart, immutable retry, corruption, disk-space failure, interrupted-write
cleanup and data survival in an open preload.

`dotnet build apps/quest/storage-tests/UnityCompile.csproj` additionally compiles actual
storage, guide, capture and network source against installed Unity managed assemblies.
Override `UnityManagedPath` when necessary. It deliberately fails when real assemblies
are absent; it does not use Unity stubs. This is not an Editor package import or Android
IL2CPP result. Unity's own storage test is in `Assets/Trail/Tests/Storage`.

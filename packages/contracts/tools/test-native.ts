import { spawnSync } from 'node:child_process';
const dotnet = process.env.DOTNET || 'dotnet';
const run = spawnSync(dotnet, ['run', '--project', 'packages/contracts/native-tests/Contracts.csproj'], {
  stdio: 'inherit', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' },
});
if (run.error) throw new Error('Pure C# contract checks could not start. Install/use an existing .NET 8 SDK and set DOTNET to its executable. No native check ran.', { cause: run.error });
if (run.status !== 0) throw new Error(`Pure C# contract checks failed (${run.status})`);

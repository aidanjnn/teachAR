# AI providers

`provider.ts` defines `AiProvider`. `mock.ts` is deterministic and keyless. `openai.ts`
talks to the SDK through `openai-gateway.ts` (whisper-1 timestamps, Structured Outputs
labels and text coach, GPT-Live session creation). Pure helpers: `align.ts`, `labels.ts`,
`coach-prompts.ts`. Providers never log audio, transcripts, or keys, and always return
typed fallbacks instead of throwing for model failures.

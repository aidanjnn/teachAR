---
name: trail-cleanup
description: Simplify an implemented Trail change or fix concrete review findings while preserving its spatial contracts and runtime behavior. Use for cleanup, simplify, polish, or make the diff smaller.
---

# Clean up a Trail change

Read [AGENTS.md](../../../../AGENTS.md), the complete task diff, and immediate
consumers/tests where needed. Scope the pass to this change; preserve unrelated
work. A cleanup request authorizes edits, not commits or publication by itself.

1. Identify intended behavior and invariants before editing. Refer to plan
   sections 6–8 for affected contracts, reducer states, and recovery behavior.
2. Remove dead code, debug capture dumps, stale comments, unused dependencies,
   duplicated transformations, and unnecessary pass-through layers. Prefer
   clear module boundaries over a new framework or general-purpose utility.
3. Preserve units, transform direction, half-open ranges, schema/revision
   handling, explicit missing-hand states, start gate/dwell, and truthful
   provenance. Do not simplify away pauses, stale-response checks, atomic
   storage, upload limits, or mock/live distinctions.
4. Keep motion free of I/O and timers. Reuse rendering objects where hot-path
   allocation is demonstrated; do not turn a cleanup into speculative tuning.
   Do not reformat another workstream or update the lockfile incidentally.
5. Fix supported in-scope review findings; do not implement new product behavior
   solely because a reviewer suggested it. When a contract must change, update
   consumers, fixtures, and migration/version notes together.
6. Run focused [checks](../../../references/validation.md) for changed behavior.
   Expand for cross-package changes or an actual failure. Reuse previous
   passing evidence for unchanged inputs; signoff owns the full readiness gate
   when that workflow is requested.

Report the simplifications/fixes, checks, and remaining concrete limits.

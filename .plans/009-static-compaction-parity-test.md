# static compaction parity test

## objective
Add an explicit regression test proving async compaction output matches Pi normal compaction output for a real long conversation under deterministic summarization.

## status
- [x] found real Pi session logs under `~/.pi/agent/sessions/`
- [x] selected real EDC session `2026-07-02T06-29-44-805Z_019f2184-e2e4-7d71-8150-1b03d0f6bd39.jsonl`
- [x] verified selected session has recorded `totalTokens=203701`, which is >50% of a 400k context window
- [x] extracted pruned fixture to `test-fixtures/edc-real-long-session.jsonl`
- [x] gated the long real-fixture parity test behind `PI_RUN_REAL_COMPACTION_PARITY=1`; default `bun test` skips it
- [x] added post-apply reconstruction regression: async handoff + Pi `buildSessionContext` preserves raw entries from `firstKeptEntryId` through messages appended after async start, with no raw gaps/duplicates
- [x] verified default suite: `bun test`
- [x] verified explicit parity: `PI_RUN_REAL_COMPACTION_PARITY=1 bun test src/index.test.ts -t "real long edc conversation"`
- [x] verified typecheck: `bun run typecheck`
- [x] verified syntax check: `bun run check`

## notes
- The fixture preserves real prompts/tool calls/usage/structure, but prunes opaque reasoning signatures and truncates huge text outputs.
- The test intentionally uses a deterministic stream function for exact equality. Live LLM output equality would be nondeterministic and flaky.
- The no-gap invariant depends on Pi's native compaction context reconstruction: `compactionSummary` first, then raw messages from `firstKeptEntryId` through the compaction entry's parent/current head.

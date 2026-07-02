# fix review findings 2026-07-02

## objective
Fix all findings from the 2026-07-02 design and implementation review: one functional gap, one doc mismatch, two observability/UX gaps, one dead check, and five nits. Keep changes minimal; all existing tests and typecheck must stay green.

## verification gates (run after each step)
```bash
bun test
bun run typecheck
bun run check
```

## findings and fixes

### 1. silent dead zone on small context windows (functional gap)
`startAsyncJobWithDeps` auto-start window is `startRatio * contextWindow < tokens <= contextWindow - reserveTokens`. With defaults (ratio 0.8, reserveTokens 16384) the window is empty for context windows under ~82k, so the extension never auto-starts and gives no indication why.

- [x] in `src/job.ts`, detect the empty-window condition: `Math.floor(contextWindow * startRatio) >= contextWindow - reserveTokens`
- [x] surface it in `/async-compact-status` output: extend `formatRuntimeStatus` (in `src/runtime-state.ts`) with a `startWindow` line, e.g. `startWindow: empty (contextWindow 32000, startRatio 0.8, reserveTokens 16384)` vs `startWindow: 25600..183616`. Compute in `showStatus` in `src/index.ts` from `ctx.model` and current settings; show `startWindow: unknown` when model/settings are unavailable
- [x] document the constraint in README env config section and in ASYNC_COMPACTION_DESIGN.md limitations
- [x] add test: status output reports empty window for a small-context model; auto path does not start a job in that configuration

### 2. README enable-flag mismatch (docs)
`isEnabled()` returns true for anything except literal `"0"`, i.e. enabled by default when unset, but README/design present `PI_ASYNC_PREFIX_COMPACTION=1` as the enabling setting.

- [x] keep current code behavior (enabled by default); fix docs instead
- [x] README env section: state explicitly "enabled by default; set `PI_ASYNC_PREFIX_COMPACTION=0` to disable" and drop the misleading `=1` line from the example block (or comment it as optional/no-op)
- [x] same wording fix in ASYNC_COMPACTION_DESIGN.md configuration section

### 3. apply errors after handoff are swallowed (observability)
`session_before_compact` sets state to idle before returning the ready result, so a later `ctx.compact()` failure hits `recordApplyError` when status is no longer `ready` and is dropped silently.

- [x] track the handed-off job: add `lastHandedOffJobId: string | undefined` to `RuntimeState` (or reuse a small `handedOff` field), set it in the `session_before_compact` handler when returning the result
- [x] change `recordApplyError` to also record the failure when `state.status === "idle"` and the jobId matches the handed-off job: set status `failed`, reason `FAILED`, error `apply failed: <message>`
- [x] clear the handed-off marker on successful `session_compact` for our own marker
- [x] add test: trigger handoff via `session_before_compact`, then invoke the captured `onError`; expect status `failed` and the error recorded

### 4. dead prompt-version validation check
`validateReadyJob` compares `job.promptVersion` (set from `SUMMARY_PROMPT_VERSION` in the same process) against `SUMMARY_PROMPT_VERSION`; state is in-memory only, so it can never fire.

- [x] remove the check from `src/validation.ts` (decision: drop rather than keep as future-proofing, since design doc explicitly says state never persists; re-add if persistence ever lands)
- [x] keep `promptVersion` in `Snapshot`/marker types: it is still meaningful in `getAsyncCompactionMarker`, which reads persisted entry details across process restarts — do not touch that path
- [x] update ASYNC_COMPACTION_DESIGN.md apply-validation list (remove step 6, renumber)

### 5. `/async-compact-now` silent no-op paths (UX)
Forced start gives no feedback when disabled, settings-disabled, model missing, pending job already running, or `prepareAsyncCompaction` returns undefined.

- [x] make `startAsyncJobWithDeps` return a small discriminated result, e.g. `"started" | "already_pending" | "ready_reused" | "not_started"` (exact variants at implementer's discretion, keep minimal)
- [x] in the `async-compact-now` handler only (not `turn_end`), notify on non-started outcomes: one short info line, e.g. `async compaction not started: job already pending` / `nothing to compact` / `disabled`
- [x] keep happy path silent (existing test "manual trigger command does not write status text to chat" must still pass — verify it exercises the started path; adjust harness ctx so preparation succeeds, or scope the assertion)
- [x] add test: forced trigger while disabled notifies; forced trigger while pending notifies

### 6. nits (single cleanup commit)
- [x] `src/index.ts`: remove `export { prepareAsyncCompaction }` and `export { validateReadyJob }` re-exports; update `src/index.test.ts` to import from `./preparation` and `./validation` directly
- [x] `src/index.ts`: `clearCliStatus` takes `ExtensionContext` (or the narrower shared ctx type used elsewhere) instead of the hand-rolled inline structural type
- [x] `src/utils.ts`: export/reuse the existing `isThinkingLevel` guard in `getAsyncCompactionMarker` instead of the `as` cast; return undefined when the guard fails
- [x] `src/job.ts`: add a short comment on the threshold block explaining why Pi's exported `shouldCompact` is not used (early-start ratio semantics differ from Pi's trigger)
- [x] dedupe drift risk between `shouldReplaceReadyJob` and `validateReadyJob`: extract the shared session/model/thinking/settings checks into one helper in `src/validation.ts` that both call (size/preview check stays where it is since inputs differ); skip if the extraction turns out uglier than the duplication — in that case add a cross-reference comment in both places instead

## execution order
1. finding 4 (dead check removal) — smallest, unblocks doc renumbering
2. finding 2 (docs)
3. finding 1 (dead-zone surfacing + docs + tests)
4. finding 3 (handoff error recording + test)
5. finding 5 (manual command feedback + tests)
6. finding 6 (nits)
7. full gates, then update ASYNC_COMPACTION_DESIGN.md/README once at the end for anything touched

## status
- [x] finding 4: remove dead prompt-version check
- [x] finding 2: fix enable-flag docs
- [x] finding 1: empty start-window surfacing
- [x] finding 3: record post-handoff apply errors
- [x] finding 5: manual command no-op feedback
- [x] finding 6: nits cleanup
- [x] all gates green (`bun test`, `bun run typecheck`, `bun run check`)

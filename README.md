# pi async prefix compaction

Pi extension that precomputes compaction summaries in the background, then applies a ready summary when Pi triggers `/compact` or auto-compaction.

## install

From npm:

```bash
pi install npm:pi-async-prefix-compaction
```

From git:

```bash
pi install git:github.com/almogdepaz/pi_compaction@v0.1.0
```

Local development:

```bash
pi install .
```

or test for one run:

```bash
pi -e .
```

## usage

Async compaction precomputes and then triggers Pi compaction automatically:

- background summary starts after a turn when context crosses the start threshold
- when the summary is ready, the extension calls Pi's compaction flow
- Pi fires `session_before_compact`
- if the ready async summary validates, the extension returns it
- otherwise Pi falls back to normal synchronous compaction

Manual `/compact` still works and can also use a ready async summary.

While a background summary is running, Pi's status bar shows `async_compaction ...`. The extension clears that status when the background job finishes, fails, or is invalidated, so the normal CLI returns while idle.

Manual trigger, bypassing the early-start threshold:

```text
/async-compact-now
```

## env config

```bash
PI_ASYNC_PREFIX_COMPACTION_START_RATIO=0.8
PI_ASYNC_PREFIX_COMPACTION_TIMEOUT_MS=300000
```

The extension is enabled by default; set `PI_ASYNC_PREFIX_COMPACTION=0` to disable. Reserve and keep-recent tokens come from Pi's normal `compaction` settings. Automatic background jobs only start when `floor(contextWindow * START_RATIO) < tokens <= contextWindow - reserveTokens`; if that window is empty, use a larger context model, lower the start ratio, or lower Pi's reserve tokens.

## development

```bash
bun install
bun test
bun run typecheck
bun run check
bun pm pack --dry-run
```

This package is tested against Pi `0.80.3`. The Pi core packages are declared as peer dependencies because Pi provides them at runtime.

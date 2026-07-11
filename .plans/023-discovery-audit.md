# discovery audit

## objective
Check how discoverable `pi-async-compaction` is across package/search surfaces and identify concrete next steps to improve exposure.

## status
- [x] npm search checks
- [x] github search checks
- [x] pi.dev package/search checks
- [x] public search engine checks where accessible
- [x] tune metadata for exact-match search phrases
- [x] publish patch release
- [x] summarize gaps and next actions

## findings
- DuckDuckGo does not show the package yet for exact or phrase searches. This is expected for a same-day package/repo.
- npm package metadata resolves and latest is `0.1.4`, but npm search API still does not return `pi-async-compaction` in the top 100 for `pi-async-compaction`, `async context compaction pi`, or `pi coding agent compaction`. This looks like npm search index lag/ranking, not publish failure.
- GitHub repo search returns `almogdepaz/pi-async-compaction`, but `pablopunk/pi-async-compaction` currently ranks above it for exact package-name search.
- pi.dev package detail page resolves and now shows `0.1.4` plus the exact-match description.

## action taken
Published `0.1.4` with improved metadata exact-match density:
- description includes `async context compaction` and `Pi coding agent`
- keywords include `pi-coding-agent`, `pi-async-compaction`, `async-context-compaction`, `context-window`, and `token-management`
- GitHub description uses the same exact phrasing
- README and `llms.txt` reinforce exact package-name discovery

## verification
- `bun test` passed: 48 pass, 1 skip.
- `bun run typecheck` passed.
- `bun run check` passed.
- `bun pm pack --dry-run` packed 15 files as `pi-async-compaction-0.1.4.tgz`.
- `npm publish --access public` published `pi-async-compaction@0.1.4`.
- `npm view pi-async-compaction` shows latest `0.1.4` with updated description/keywords.
- `npm_config_min_release_age=0 pi install npm:pi-async-compaction@0.1.4` works.
- `gh release create v0.1.4` created GitHub release notes.
- `https://pi.dev/packages/pi-async-compaction` shows `0.1.4` and the exact-match description.

## next actions outside repo metadata
- Get at least one backlink/index trigger from a public post, GitHub discussion, or Pi community page.
- Ask/coordinate with `pablopunk/pi-async-compaction` if that repo is abandoned or conflicting, because it outranks ours on GitHub exact search.
- Recheck npm search after its index catches up.

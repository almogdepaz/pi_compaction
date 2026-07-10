# rename and publish pi async compaction

## objective
Rename the public package/repo from `pi-async-prefix-compaction` / `pi_compaction` to `pi-async-compaction`, publish to npm, and make it eligible for the Pi package catalog.

## status
- [x] confirm GitHub repo rename capability
- [x] update package metadata/docs/user-facing strings
- [x] verify tests/typecheck/check/pack
- [ ] commit and push rename changes
- [ ] rename GitHub repository and update remote
- [ ] publish npm package
- [ ] verify npm package and Pi catalog eligibility

## notes
Keep internal `asyncPrefixCompaction` marker unchanged; it is implementation metadata and changing it is unnecessary compatibility churn.
Pi package catalog discovers npm packages with the `pi-package` keyword and `pi` manifest; package already has both.

## verification so far
- `bun test` passed: 48 pass, 1 skipped.
- `bun run typecheck` passed.
- `bun run check` passed.
- `bun pm pack --dry-run` packed 12 files as `pi-async-compaction-0.1.0.tgz`.
- `npm view pi-async-compaction version` returned no package, so the name appears available.

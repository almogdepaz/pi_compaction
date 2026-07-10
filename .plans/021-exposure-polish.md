# exposure polish

## objective
Do low-risk repo/package polish that improves discoverability and trust without requiring user-provided media or credentials.

## status
- [x] improve README search/title/badges/roadmap
- [x] add changelog
- [x] add issue templates
- [x] add GitHub release notes for v0.1.2
- [x] verify and push
- [x] publish 0.1.2 because package-distributed README changed

## notes
No runtime behavior changes. Do not fabricate demo screenshots/gifs. Package README changed, so published a patch release for npm/pi.dev visibility.

## verification
- `bun test` passed: 48 pass, 1 skip.
- `bun run typecheck` passed.
- `bun run check` passed.
- `bun pm pack --dry-run` packed 13 files as `pi-async-compaction-0.1.2.tgz`.
- `npm publish --access public` published `pi-async-compaction@0.1.2`.
- `gh release create v0.1.2` created GitHub release notes.

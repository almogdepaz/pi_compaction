# fix edc review issues

## objective
Address actionable EDC audit findings without broad refactors.

## status
- [x] identify actionable findings
- [x] add failing regression for empty compaction summary
- [x] fix empty-summary failure state
- [x] remove trivial dead type exports
- [x] add failing regression for unchanged-leaf settings drift
- [x] fix ready-job replacement drift check order
- [x] fix timeout pending-state ownership
- [x] remove one-call marker wrapper
- [x] run final verification

## scope
- fix low correctness/UX issue in `src/job.ts`
- fix ready-job reuse drift issue in `src/job.ts`
- fix timeout behavior in `src/job.ts`
- shrink unnecessary exported/wrapper type surface where trivial

## out of scope
- splitting `src/index.test.ts`
- refactoring `startAsyncJobWithDeps`
- extracting shared validation drift helper unless needed for the fix

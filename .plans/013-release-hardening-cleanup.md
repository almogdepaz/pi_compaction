# release hardening cleanup

## objective
Run opt-in parity and clean up post-status-command leftovers plus oversized tests without changing runtime behavior beyond removing unused state.

## status
- [x] run opt-in long parity test
- [x] verify `lastAppliedJobId` references
- [x] remove dead `lastAppliedJobId` state
- [x] split monolithic tests by behavior area
- [x] run full verification

## scope
- remove status-command leftover state only if unreferenced by behavior
- split tests mechanically by existing describe groups
- do not refactor `startAsyncJobWithDeps`

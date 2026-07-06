# remove status command

## objective
Remove the explicit `/async-compact-status` command because pending/ready status is already shown in the CLI status line.

## status
- [x] identify command/tests/docs
- [x] add failing regression that status command is not registered
- [x] remove command implementation and dead formatter surface
- [x] update docs
- [x] run verification

## scope
- remove command registration from extension
- remove status-command-only tests/docs
- keep CLI status-line behavior (`ctx.ui.setStatus`) unchanged

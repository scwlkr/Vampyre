# To-do Docs

This directory holds unfinished, planned, and follow-through docs.

## Files

- [ROADMAP.md](./ROADMAP.md) - MVP roadmap, completion notes, post-MVP follow-through, and later hardening items.
- [mac-native-validation-runner.md](./mac-native-validation-runner.md) - implementation handoff for remote macOS build and validation.

## Current Follow-through

Tracked in [../STATUS.md](../STATUS.md):

- Continue the daemon-owned Pinmark product loop after scheduler/budget/throttle conditions allow it.
- Implement the Mac-native validation runner so Vampyre can dispatch and record macOS build/test proof without using the Owner's MacBook.
- Validate Pinmark missing-permission behavior on a Mac without Screen Recording permission or after an intentional TCC reset.

## Open Questions

- Whether the repo should add CI workflows for the TypeScript test/build suite.
- Whether a checked-in env example is useful, given the current host setup path creates `~/vampyre/config/vampyre.env`.
- Whether future Builder intake artifacts should stay under a live intake directory or move directly to an archive after repo creation.

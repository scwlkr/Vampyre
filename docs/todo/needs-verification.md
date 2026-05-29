# Needs Verification

Items here should not be promoted into source-of-truth docs until verified.

## Pinmark Native Behavior

- Missing Screen Recording permission behavior needs validation on a Mac without
  permission or after an intentional TCC reset.
- Persistent GUI/TCC smoke tests need a stable Mac runner before they can be
  considered routine daemon proof.

## Docs And Runtime

- Any future `.env.example` decision needs review against the current host setup
  path, which creates the runtime env stub directly on `wlkrlab`.
- Future CLI additions must be checked against `node dist/cli.js --help` before
  reference docs are updated.

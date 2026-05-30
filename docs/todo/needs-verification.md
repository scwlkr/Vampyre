# Needs Verification

Items here should not be promoted into source-of-truth docs until verified.

## Pinmark Native Behavior

- Pinmark is paused while this remains unresolved.
- Missing Screen Recording permission behavior needs validation on a Mac without
  permission or after an intentional TCC reset.
- Persistent GUI/TCC smoke tests need a stable Mac runner before they can be
  considered routine daemon proof.

## MiniMark Native Behavior

- Confirm the first native app shell launches in hosted macOS validation without
  TCC permission prompts.
- Confirm the future `minimark-visual-proof` artifact contains a real product
  screenshot before making Visual Proof required for MiniMark.

## Docs And Runtime

- Any future `.env.example` decision needs review against the current host setup
  path, which creates the runtime env stub directly on `wlkrlab`.
- Future CLI additions must be checked against `node dist/cli.js --help` before
  reference docs are updated.

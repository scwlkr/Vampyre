# Project Model

Vampyre manages software projects as entries in one Project Portfolio.

## Purpose

The target user is the Owner, who wants software projects to keep moving with
minimal manual coordination while still preserving review, approval, validation,
and rollback surfaces.

Vampyre solves the operational problem of repeatedly deciding what project can
move next, launching bounded work, preserving proof, and surfacing what needs
Owner attention.

## Portfolio

The portfolio is managed by one central daemon, not one daemon per repository.
The daemon loads a Project Registry from `~/vampyre/config/project-registry.json`
on `wlkrlab`.

Current default profiles:

- `palette-wow`: Safe/Watcher Mode for `scwlkr/paletteWOW`.
- `screenshot-tool`: paused Builder Mode for private `scwlkr/pinmark`.
- `minimark`: active Builder Mode for private `scwlkr/minimark`.
- `keepingus`: active Builder Mode for private `scwlkr/keepingus`.

## Safe/Watcher Mode

Safe/Watcher Mode sustains existing projects through low-risk improvements,
issue/PR handling, validation, docs, accessibility, and daily forward motion.

Auto-safe work can proceed without prior Owner approval, but it ends in an
Owner-reviewed pull request. Vampyre does not merge its own daemon-created PRs.

## Builder Mode

Builder Mode turns an approved idea into a real project. For active product-loop
projects like MiniMark, the approved product-loop policy is
`continuous-product-loop-direct-main`, so validated daemon output may push
directly to `main` while the repo remains private.

Builder-created repos default to private until a Launch Visibility Gate approves
public visibility.

## Current Stage

The daemon MVP proof is closed. The current stage is Post-MVP Product Loop
Proof, focused on keeping MiniMark moving while onboarding KeepingUs as a
web-app Builder project with faster hosted validation. Pinmark waits for
stronger permission-heavy native app testing.

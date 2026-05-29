# Pinmark Repo Plan

Status: awaiting Owner repo-plan approval

Approval target:

- Project: `screenshot-tool`
- Approval Kind: `builder-repo-plan`
- Approval Key: `pinmark-repo-plan`

Direction approval:

- GitHub issue: https://github.com/scwlkr/Vampyre/issues/6
- Selected direction: Pinmark

## Selected Direction

Pinmark is a fast local-first screenshot markup desk for Mac users who want to capture, redact, pin, annotate, OCR, and export polished screenshots without creating a cloud account.

The first build should optimize for a polished native capture and markup loop before upload destinations, share links, team accounts, or video recording.

## Repository Settings

- Repository owner: `scwlkr`
- Repository name recommendation: `pinmark`
- Visibility: private
- Description: `Local-first macOS screenshot markup, redaction, pinning, OCR, and polished export.`
- Default branch: `main`
- License: MIT for now, unless the Owner wants the repo to stay all-rights-reserved before public launch.
- Topics:
  - `macos`
  - `swift`
  - `swiftui`
  - `screenshot`
  - `screen-capture`
  - `annotation`
  - `ocr`
  - `privacy-first`
  - `local-first`

## GitHub Features

Enable:

- Issues
- Pull requests
- Discussions, disabled for the private MVP unless the Owner wants product notes there
- Wiki disabled
- Projects disabled until real planning pressure appears
- Actions enabled, initially for build/test/lint only
- Dependabot enabled after the first package/dependency graph exists

## Initial Repository Files

Create the repository with:

- `README.md`
- `CONTEXT.md`
- `docs/ROADMAP.md`
- `docs/STATUS.md`
- `docs/adr/0001-build-native-local-first-macos-app.md`
- `docs/adr/0002-start-private-until-launch-visibility-gate.md`
- `.gitignore`
- initial Swift package or Xcode project scaffold, depending on the first implementation spike

The selected direction should become the new repo's Project Contract. Unselected RelayShot rationale remains archived in this Vampyre Builder Intake Area.

## Initial Technical Direction

- Platform: macOS
- Primary language: Swift
- UI: SwiftUI for primary surfaces, AppKit where needed for menu-bar behavior, floating panels, and capture/editor windows
- Capture: native macOS capture path, with ScreenCaptureKit evaluated early and lower-level screenshot APIs allowed if they better fit still capture
- OCR: Apple Vision
- Global shortcuts: KeyboardShortcuts package candidate
- Updates: defer Sparkle until direct-distribution packaging is needed
- Storage: local application support directory for history and settings
- Secrets: none in the MVP

## First Build Scope

Build toward a private Initial Baseline with:

1. Menu-bar app shell.
2. First-run screen recording permission explanation and missing-permission state.
3. Region or full-screen capture path.
4. Markup editor with crop, arrow, rectangle, text, highlighter, and blur or pixelate redaction.
5. Floating pin window for a captured image.
6. Local history list with copy, reveal, and delete.
7. Export to clipboard and file.
8. Basic polished export preset with padding, background, and shadow.

## Explicit Non-Goals For Initial Baseline

- Upload destinations or share links.
- Cloud accounts.
- Team collaboration.
- Screen recording or GIF export.
- Scrolling capture.
- AI redaction.
- Public launch or public repository visibility.

## Distribution Plan

Use direct distribution for the first private Initial Baseline so the project can move quickly while capture, permissions, hotkeys, and editor UX settle.

Keep the codebase Mac App Store-aware where reasonable, but do not let App Store packaging, sandbox review, pricing, or public marketing block the first working product shape.

After the Initial Baseline is real, run a Launch Visibility Gate and a distribution decision:

- continue direct distribution with Developer ID signing, notarization, and Sparkle updates, or
- pursue Mac App Store distribution if sandbox behavior and product goals still fit.

## Approval Gate

Do not create the `pinmark` repository until this Repo Plan is approved in GitHub with the `vampyre:approval` label and the required approval fields:

```text
Project: screenshot-tool
Approval Kind: builder-repo-plan
Approval Key: pinmark-repo-plan
```

The approval comment must include the literal approval marker and should confirm the repo name or provide an edited repo name.

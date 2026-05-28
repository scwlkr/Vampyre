# Screenshot Tool Evidence Brief

Research date: 2026-05-28

## Raw Idea

Build a real macOS screenshot tool with quick markup features similar in spirit to ShareX.

## Research Scope

This was a bounded external scan for the Builder Vision Pair. It focused on ShareX feature expectations, current macOS screenshot tools, macOS capture/distribution constraints, and reusable open-source building blocks. It is not a full competitive teardown, pricing study, trademark search, or technical spike.

## Sources

- [ShareX GitHub](https://github.com/ShareX/ShareX)
- [CleanShot X features](https://cleanshot.com/features)
- [Shottr](https://shottr.cc/)
- [Xnapper](https://xnapper.com/)
- [TechSmith Snagit features](https://www.techsmith.com/snagit/features/)
- [Apple ScreenCaptureKit](https://developer.apple.com/documentation/ScreenCaptureKit)
- [Apple Screen and System Audio Recording settings](https://support.apple.com/en-ie/guide/mac-help/mchld6aa7d23/mac)
- [Apple App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- [Apple Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts)
- [Sparkle](https://sparkle-project.github.io/)

## Key Findings

1. ShareX sets a power-user expectation, not just a screenshot expectation. Its public positioning combines capture, recording, file sharing, upload destinations, OCR, image annotation, custom uploaders, hotkeys, scrolling screenshots, and command-line/workflow surfaces. A macOS version "in spirit" should not be only a pretty markup window; it should decide whether automation and routing are first-class or intentionally deferred.

2. The current Mac market already covers many baseline features. CleanShot X emphasizes capture, recording, quick access, cloud links, floating screenshots, OCR, history, and customization. Shottr emphasizes small native footprint, fast capture, scrolling screenshots, redaction/pixelation, OCR/QR, combining shots, pinning, ruler tools, and annotation. Xnapper emphasizes beautified output, automatic balance/backgrounds, redaction, text selection, social sizes, history, and native speed. Snagit pushes deeper into tutorials, recording, templates, AI redaction, text recognition, and collaboration links.

3. Two product wedges look credible. One is a macOS-native ShareX-style workflow router for people who need capture -> annotate -> upload/share/link with user-owned destinations. The other is a faster local-first markup desk focused on capture, redaction, pinning, OCR, polished export, and zero cloud account in the MVP.

4. macOS capture should start native. ScreenCaptureKit is Apple's current framework for high-performance display, app, and window capture streams. For still screenshots, the first implementation can combine native capture APIs with AppKit/SwiftUI editing rather than starting with a cross-platform shell.

5. Permission UX is a product requirement. Apple exposes screen and system audio recording as a Privacy & Security permission controlled by the user. A screenshot app that reads screen pixels needs a clear first-run explanation and a graceful "permission missing" state; this cannot be treated as a backend error.

6. Distribution choice changes scope. Direct distribution needs Developer ID signing and notarization for normal Gatekeeper trust. Mac App Store distribution requires App Sandbox, and sandbox entitlements can affect global shortcuts, file access, uploads, helper tools, and update strategy. The Repo Plan should choose the first distribution path explicitly instead of letting Xcode defaults decide.

7. Useful reusable assets exist, but the core editor still needs product work. KeyboardShortcuts can cover customizable global hotkeys in a sandbox-compatible way. Sparkle can support direct-distribution updates. Apple Vision can provide on-device OCR. AppKit panels can support floating/pinned screenshots. The hard parts remain capture UX, annotation interactions, redaction reliability, upload privacy, and scrolling capture edge cases.

## Build Constraints

- Do not collect or store user upload credentials casually. If upload destinations are part of the selected vision, credential storage and redaction rules need to be part of the Project Contract.
- Treat screen recording permission as an explicit onboarding path with a failed-permission state.
- Avoid promising scrolling capture, video recording, or cloud sharing in the first baseline unless the selected direction truly needs them.
- If direct distribution is selected, plan for signing, notarization, and update delivery. If Mac App Store distribution is selected, plan for sandbox limits from the start.
- Keep the first project private until the Initial Baseline exists and a Launch Visibility Gate approves public visibility.

## Reusable Assets

- Native stack candidate: Swift, SwiftUI, AppKit, ScreenCaptureKit, Vision, ImageIO/CoreGraphics.
- Open-source package candidates:
  - KeyboardShortcuts for user-configurable global shortcuts.
  - Sparkle for direct-distribution updates.
- Workflow candidates:
  - A first-run permission screen before capture.
  - A local-only history folder before any cloud or custom uploader work.
  - A redaction-first annotation toolbar before broad design effects.

## Research Limits

- No prototype was built.
- No source code audit was performed on competitor or open-source apps.
- No App Store Review Guideline deep dive was performed beyond sandbox/notarization implications.
- No trademark/domain availability check was performed for the working names.
- No pricing, licensing, or monetization recommendation is included in this brief.

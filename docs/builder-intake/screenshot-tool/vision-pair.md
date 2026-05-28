# Screenshot Tool Vision Pair

Status: awaiting Owner direction approval

Approval target:

- Project: `screenshot-tool`
- Approval Kind: `builder-vision`
- Approval Key: `screenshot-tool`

To approve a direction, use the GitHub approval issue and include `VAMPYRE_APPROVED` plus the selected option name.

## Raw Idea

A real macOS screenshot tool with quick markup features similar in spirit to ShareX.

## Vision Option A: RelayShot

### Product Direction

RelayShot is a macOS-native capture and sharing workflow tool for developers, support teams, and builders who want screenshots to move quickly from screen to markup to a useful destination.

### Lightweight Brand Direction

- Working product name: RelayShot
- Positioning: a ShareX-inspired Mac screenshot workflow router with quick markup and user-owned sharing paths.
- Tone: practical, fast, private-by-default, workflow-heavy.
- Target user: developers, support operators, technical founders, and project owners who frequently capture bugs, UI states, and evidence for GitHub, Slack, docs, or customer support.
- Core differentiator: capture output can be routed, named, copied, uploaded, and linked through configurable workflows instead of ending as a random desktop file.
- Likely repo name recommendation: `relayshot`

### MVP Scope

- Menu-bar app with configurable global shortcuts.
- Capture region, window, and full screen.
- Quick annotation: arrow, rectangle, text, blur/pixelate, numbered step marker, crop.
- Local capture history with copy, save, reveal, and delete.
- One user-owned upload destination in the first baseline, preferably S3-compatible storage or GitHub Releases/Gists only if approval confirms that fit.
- Clipboard output modes: image, file path, Markdown image/link, and public or private URL when upload is configured.
- First-run screen recording permission flow.

### Deferred

- Scrolling capture.
- Video recording and GIF export.
- Team cloud accounts.
- AI redaction.
- Broad upload-destination marketplace.

### Build Implications

This direction is closer to ShareX's automation identity, but it is also the higher-risk build. It needs more product policy around upload credentials, link privacy, failed uploads, destination testing, and secret storage. It likely fits direct distribution first, with Developer ID signing, notarization, and Sparkle-style updates after the baseline is real.

## Vision Option B: Pinmark

### Product Direction

Pinmark is a fast local-first screenshot markup desk for Mac users who want to capture, redact, pin, annotate, and export polished screenshots without creating a cloud account.

### Lightweight Brand Direction

- Working product name: Pinmark
- Positioning: a fast native Mac screenshot tool for clean local markup, redaction, pinning, and polished export.
- Tone: calm, precise, privacy-first, visually clean.
- Target user: designers, frontend engineers, founders, writers, and anyone who prepares screenshots for feedback, docs, social posts, bug reports, or launch material.
- Core differentiator: the fastest path from capture to clear marked-up evidence, with local privacy and pinned reference screenshots as first-class workflow.
- Likely repo name recommendation: `pinmark`

### MVP Scope

- Menu-bar app with configurable global shortcuts.
- Capture region, window, and full screen.
- Quick annotation: arrow, rectangle, text, blur/pixelate, highlighter, crop.
- Pin any capture as a floating reference panel.
- On-device OCR copy using Apple Vision.
- Beautified export with background, padding, border radius, shadow, and social/document presets.
- Local history with no cloud dependency.
- First-run screen recording permission flow.

### Deferred

- Upload destinations and share links.
- Screen recording.
- Scrolling capture.
- Team collaboration.
- Custom automation workflows.

### Build Implications

This direction is easier to make excellent quickly because it avoids upload credentials, account systems, and link privacy in the first baseline. It is less ShareX-like than RelayShot, but it still satisfies the quick-capture/quick-markup need and creates a useful app sooner. It has a clearer route to Mac App Store compatibility if sandbox constraints remain acceptable.

## Comparison

| Dimension | RelayShot | Pinmark |
| --- | --- | --- |
| Primary wedge | Capture and route screenshots into useful destinations | Capture, redact, pin, and polish screenshots locally |
| ShareX similarity | High | Medium |
| First baseline risk | Higher | Lower |
| Secret handling | Required if uploads ship early | Avoided in MVP |
| Best first user | Developer/support power user | Builder/designer/docs user |
| Distribution bias | Direct distribution first | Mac App Store or direct distribution |
| Strongest reason to choose | User-owned screenshot workflows are the clearest gap vs existing Mac tools | Faster path to a polished real app with fewer privacy and integration risks |

## Recommendation

Choose RelayShot if the goal is to prove a true ShareX-style macOS product with capture workflows and user-owned sharing. Choose Pinmark if the goal is to reach a polished Initial Baseline faster and defer upload/routing complexity until the core capture and markup experience is excellent.

Vampyre's suggested default is RelayShot because the original Raw Idea explicitly points toward ShareX, and workflow routing is the more distinct product bet. The approval issue should still let the Owner choose Pinmark if build speed and local polish matter more for the first project.

## Approval Gate

Do not create the screenshot-tool repository yet. After the Owner approves one option in GitHub, create a Repo Plan for the selected direction with one repo-name recommendation, visibility, description, topics, license, enabled GitHub features, default branch, and initial files/docs.

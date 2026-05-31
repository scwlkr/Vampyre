# KeepingUs Repo Plan

Status: awaiting Owner repo-plan approval

## Approval Gate

- Project: `keepingus`
- Approval Kind: `builder-repo-plan`
- Approval Key: `keepingus-repo-plan`
- Recommended repository: `scwlkr/keepingus`
- Visibility: private by default
- Builder template: `keepingus`

Do not create the `scwlkr/keepingus` repository until this repo plan is
approved through a GitHub issue labeled `vampyre:approval` with matching
approval fields.

## Owner Idea

KeepingUs is a small private photo-sharing web app for close friends and
family. Users can create or join a private circle, upload one or multiple
photos at any aspect ratio, add an optional caption, and see what everyone is
up to in a mostly chronological feed.

Each user has a simple profile showing name, profile photo, bio/status, and a
grid of their posts. Profiles are only visible to people in the same private
circle.

Posts use Nice/Vice reactions instead of likes or upvotes. Nice keeps good
posts visible longer. Vice sinks bad, weird, or low-effort posts lower. The
feed should stay mostly chronological, with simple group judgment applied as a
small ranking adjustment.

## Product Boundary

In scope for the first private product loop:

- Invite-only private circles.
- Multi-photo posting at mixed aspect ratios.
- Optional captions.
- Mostly chronological feed.
- Nice/Vice reactions.
- Simple same-circle profiles.
- Profile post grid.
- Clear privacy boundary between circles.

Explicit non-goals:

- Public profiles.
- Follower counts.
- Ads.
- Reels or short-video mechanics.
- Explore page.
- Public search or public discovery.
- Complex recommendation algorithm.
- Public popularity scores.

## Technical Starting Point

Start as a dependency-light web app because browser and Linux-hosted validation
are easier for Vampyre to run continuously than permission-heavy native app
validation.

Initial repository shape:

- Static web shell under `web/`.
- Testable feed and visibility rules under `src/`.
- Node built-in test runner under `tests/`.
- Build script that copies the static app to `dist/`.
- GitHub Actions workflow `web-validation.yml`.
- Modular project docs using lowercase `docs/status.md`.

Initial validation:

```sh
corepack pnpm test
corepack pnpm build
```

Runtime project profile after repo creation:

- Mode: Builder.
- Cadence: `builder-loop-after-owner-approval`.
- Autonomy policy: `continuous-product-loop-direct-main`.
- Hosted validation: GitHub Actions `web-validation.yml` on `ubuntu-latest`.

## First Product Loop

The first real product slice should build a local private-circle demo with:

- Sample circle members.
- Multi-photo posts.
- Optional captions.
- Nice/Vice reactions.
- Same-circle profile cards.
- Mostly chronological feed ordering.

Persistence, auth, uploads, image storage, deployment, and browser screenshot
proof can follow after the interaction model is visible and tested.

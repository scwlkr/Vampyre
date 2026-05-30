# Mac-native validation runner handoff

## Goal

Vampyre should be able to build and validate macOS apps without requiring the Owner to test on a MacBook or other personal Apple device.

`wlkrlab` remains the always-on daemon and workspace host. Native macOS execution is delegated to a remote macOS runner, with results pulled back into Vampyre status, run journals, blockers, GitHub records, and Telegram alerts.

## Decision

Do not try to solve this with Linux containers on `wlkrlab`.

Use this implementation path:

1. Add a GitHub Actions macOS workflow to each macOS app repo for routine build, unit, fixture, and package validation.
2. Add a Vampyre validation command that can dispatch that workflow from `wlkrlab`, poll the run, store the result, and link the proof in check-ins.
3. Add a persistent self-hosted or cloud Mac runner only for tests that need a logged-in GUI session, stable TCC state, ScreenCaptureKit smoke coverage, or deeper app automation.

## Implementation status

- 2026-05-29: Phases 1-4 were implemented for Pinmark with hosted GitHub Actions macOS validation, `vampyre validation request`, SQLite `external_validation_runs`, native-validation reports, blockers, and Check-in Summary links.
- 2026-05-30: Phase 5 is implemented. Build Agent output now requests configured native validation after direct-main or PR-mode pushes, surfaces run URLs, and relies on the native-validation state path for success, failure, and timeout blockers.
- 2026-05-30: Pinmark is paused until stronger permission-heavy GUI/TCC testing exists. MiniMark is now the active no-permission macOS app target for routine hosted validation.
- Latest proven Pinmark hosted run before the pivot: `26668895659` on `macos-15` for `scwlkr/pinmark` `main`, automatically dispatched by Build Agent Run Journal `run-20260530T001815Z-screenshot-tool`.
- Next implementation slice: keep MiniMark on hosted macOS validation, then add persistent Mac runner support only when returning to permission-heavy GUI/TCC smoke tests.

## Why containers are not enough

- Linux containers share a Linux kernel. They do not provide AppKit, SwiftUI, ScreenCaptureKit, Vision, Xcode, macOS signing behavior, or TCC.
- macOS virtualization still needs a Mac host. Apple's Virtualization framework is documented for creating and managing VMs on Apple silicon and Intel-based Mac computers, not on a Linux server.
- Screen and system audio recording is intentionally user-controlled in macOS Privacy & Security settings. Apple device-management docs also state that the `ScreenCapture` PPPC service can be denied by profile but cannot be granted by profile.

This means `wlkrlab` can orchestrate, persist state, dispatch jobs, and report outcomes, but it should not pretend to be the native macOS execution environment.

## Target architecture

```text
wlkrlab Vampyre daemon
  -> GitHub API workflow dispatch
  -> scwlkr/minimark .github/workflows/macos-validation.yml
  -> GitHub-hosted macOS runner or self-hosted Mac runner
  -> GitHub Actions run URL, status, conclusion, logs
  -> Vampyre SQLite state, run journal/report, check-in summary, Telegram alert
```

The first useful version should work with GitHub-hosted macOS runners. The persistent Mac runner is a later add-on for GUI/TCC-specific smoke tests.

## Phase 1: hosted macOS workflow

Add `.github/workflows/macos-validation.yml` to macOS app repos. Use a pinned
macOS label instead of `macos-latest` so runner image changes do not silently
change the validation environment. For MiniMark, start with SwiftPM validation
that requires no permissions.

Start with build-safe validation:

```yaml
name: Mac Validation

on:
  workflow_dispatch:
    inputs:
      ref_name:
        description: Git ref to validate
        required: false
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  build:
    runs-on: macos-15
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref_name || github.ref }}

      - name: Show toolchain
        run: |
          sw_vers
          xcodebuild -version
          swift --version

      - name: Swift tests
        run: swift test

      - name: Swift build
        run: swift build

      - name: App build
        run: xcodebuild -scheme MiniMarkApp -destination 'platform=macOS' build
```

Then add fixture-based native tests that do not require live screen capture:

- Annotation model and selection behavior.
- Export rendering against checked-in fixture images.
- OCR post-processing against fixture text observations.
- Permission-copy and missing-permission prompt state.
- Any AppKit/SwiftUI view model logic that can run in XCTest without granting Screen Recording.

Keep live ScreenCaptureKit tests out of the default hosted workflow until there is a runner with a known GUI/TCC setup.

## Phase 2: Vampyre GitHub Actions integration

Add GitHub Actions workflow support under the existing GitHub boundary.

Suggested API helpers in `src/github/client.ts`:

- `dispatchGitHubWorkflow(client, { repo, workflowId, ref, inputs })`
- `listGitHubWorkflowRuns(client, { repo, workflowId, branch, event, createdAfter })`
- `getGitHubWorkflowRun(client, { repo, runId })`
- `listGitHubWorkflowJobs(client, { repo, runId })`

The dispatch helper should tolerate both possible API shapes:

- A response that includes the run id and URLs.
- A response that only confirms dispatch, followed by finding the newest `workflow_dispatch` run for the workflow, branch, and request time.

Do not print tokens, request bodies containing secrets, or raw authorization headers.

## Phase 3: project profile and CLI

Add an optional native-validation block to Project Profiles. Keep the first version narrow and GitHub Actions-specific:

```json
{
  "nativeValidation": {
    "provider": "github-actions",
    "workflowId": "macos-validation.yml",
    "runnerLabel": "macos-15",
    "requiredConclusion": "success",
    "timeoutSeconds": 1800
  }
}
```

Add a host-capable CLI command:

```bash
node dist/cli.js validation request --host wlkrlab --project minimark --ref main --wait
```

Expected behavior:

1. Load the runtime Project Registry and resolve the project.
2. Confirm the project has a GitHub repo and native-validation config.
3. Read `GITHUB_TOKEN` only from the host secret source.
4. Dispatch the configured workflow at the requested ref.
5. Poll with bounded backoff until success, failure, cancellation, or timeout.
6. Persist a report under `~/vampyre/reports/native-validation/<project-id>/`.
7. Persist the latest result in SQLite.
8. Print only status, conclusion, workflow URL, and sanitized failure summaries.

## Phase 4: state, check-ins, and blockers

Add a migration for external validation state. A minimal table is enough:

```sql
create table external_validation_runs (
  id text primary key,
  project_id text not null,
  provider text not null,
  repo text not null,
  workflow_id text not null,
  ref text not null,
  provider_run_id text,
  provider_url text,
  status text not null,
  conclusion text,
  requested_at text not null,
  started_at text,
  completed_at text,
  checked_at text not null,
  error_summary text
);
```

Wire the latest result into the Check-in Summary:

- Show latest native validation status per macOS project.
- Link the GitHub Actions run when available.
- Treat failed or timed-out native validation as a project-local blocker.
- Send a Telegram Immediate Alert for failed validation after useful work.

The first version can be operator-triggered. Build Agent integration can follow after the status path is proven.

## Phase 5: Build Agent adoption

Implemented on 2026-05-30.

The Build Agent now requests native validation for configured macOS projects
after pushed output.

For approved direct-main product-loop projects like MiniMark:

1. Run existing Linux-side validation first, such as `git diff --check`.
2. Commit and push the scoped change to `main` under the approved direct-main policy.
3. Fast-forward the managed runtime clone after push.
4. Dispatch native validation on the pushed ref or commit.
5. If it fails, create or update a project-local blocker and link the GitHub Actions run.
6. Keep the next action in the managed repo's `docs/STATUS.md` focused on fixing the failed native validation.

For PR-mode projects, native validation can run on the pushed branch and be recorded in the PR body or a review issue before Owner merge.

## Phase 6: persistent Mac runner for GUI and TCC

Use a persistent Mac runner when the app needs real GUI or capture validation.

Requirements:

- A hosted Mac service, owned Mac mini, or other Mac hardware that can run Xcode and a GitHub self-hosted runner.
- Runner registered with labels such as `self-hosted`, `macOS`, project-specific
  labels, and `macos-gui`.
- Xcode and command-line tools installed.
- Runner process started from a logged-in GUI user when tests require app launch or ScreenCaptureKit behavior.
- No secret values in runner logs.
- Optional remote desktop access for one-time runner setup and permission inspection.

Use this runner for a small smoke suite, not every routine build:

- App launches.
- Permission-denied state shows the expected guidance.
- Fixture capture import opens the editor.
- Live ScreenCaptureKit capture works when the runner has the required user-granted permission.
- Export writes a valid PNG with expected annotation pixels.

Do not bypass TCC by editing private databases. Use fixture-based tests for most coverage and reserve live capture tests for the runner where permission state is known.

## Acceptance criteria

- MiniMark has a macOS GitHub Actions workflow that can be manually dispatched and reaches a terminal conclusion without using the Owner's MacBook.
- Pinmark remains paused until permission-heavy GUI/TCC validation is routine.
- Vampyre can dispatch the workflow from `wlkrlab`, poll the result, and store a sanitized report.
- `vampyre status --host wlkrlab` shows the latest native validation result and run URL.
- A failed native validation creates a project-local blocker instead of silently letting the product loop continue.
- Telegram links the validation run on failure or first successful proof.
- The docs record that Linux containers are not the macOS validation solution.

## Exact next implementation slice

1. Decide where to run persistent GUI/TCC smoke validation: hosted Mac service,
   owned Mac mini, or another Mac host.
2. Register a self-hosted runner with stable labels such as `self-hosted`,
   `macOS`, a project-specific label, and `macos-gui`.
3. Add a small GUI/TCC smoke workflow separate from routine hosted validation.
4. Surface the persistent-runner result through the same native-validation,
   blocker, GitHub, Telegram, and check-in paths.
5. Keep fixture-based tests in hosted validation so routine proof does not
   depend on a fragile logged-in GUI session.

## References

- GitHub-hosted runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- GitHub Actions runner images and macOS labels: https://github.com/actions/runner-images
- GitHub workflow dispatch API: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- Apple Virtualization framework: https://developer.apple.com/documentation/virtualization
- Apple Screen and System Audio Recording user control: https://support.apple.com/guide/mac-help/allow-apps-to-record-the-screen-mchl592e5686/mac
- Apple PPPC ScreenCapture service: https://developer.apple.com/documentation/devicemanagement/privacypreferencespolicycontrol/services-data.dictionary

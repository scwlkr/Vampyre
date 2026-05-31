# Configuration Model

Vampyre configuration is split between repo defaults and runtime host files.

## Repo Defaults

`src/registry/projectRegistry.ts` defines the default Project Registry used when
`~/vampyre/config/project-registry.json` is missing.

Default projects:

- `palette-wow`, Safe/Watcher, `scwlkr/paletteWOW`, Rails validation commands.
- `screenshot-tool`, paused Builder, `scwlkr/pinmark`, direct-main product-loop
  policy, `git diff --check`, GitHub Actions native validation, and required
  Pinmark Visual Proof.
- `minimark`, active Builder, `scwlkr/minimark`, direct-main product-loop
  policy, `git diff --check`, GitHub Actions native validation, and optional
  MiniMark Visual Proof.
- `keepingus`, active Builder, `scwlkr/keepingus`, direct-main product-loop
  policy, `pnpm test`, `pnpm build`, and GitHub Actions web validation.

## Runtime Registry

The runtime registry path is:

```txt
~/vampyre/config/project-registry.json
```

It is created by Operational State initialization when missing. The registry is
synced into SQLite project rows so status and scheduling can read a stable
snapshot.

## Runtime Policy

Daemon mechanics live in:

```txt
~/vampyre/config/runtime-policy.json
```

It is created by Operational State initialization when missing. The policy is
loaded on every daemon tick, so scheduler, budget, and Telegram behavior can be
tuned from the runtime host without a source-code change. The daemon heartbeat
interval is read when the daemon starts, so changing that specific field still
requires a daemon restart.

The runtime policy currently controls:

- Codex budget usage scan settings and fallback Budget Mode when rate-limit
  percentages are unavailable.
- Budget thresholds for `normal`, `conservative`, `critical`, and `exhausted`.
- Whether each Budget Mode allows or defers project-changing work.
- Cadence intervals by cadence name.
- Direct-main Builder/Product Loop minimum interval by Budget Mode.
- Whether selected projects automatically launch the Build Agent.
- Default Codex worker model and reasoning effort.
- Telegram command names, including the no-space `/policy` command.
- Telegram pause durations, Daily Brief hour, and unauthorized-alert thresholds.
- Whether check-ins render the Runtime Policy summary.

Hard safety rules remain code-level guardrails, not policy toggles: secret
redaction, GitHub approval gates, private Builder-created repos by default, one
Active Build Agent lock, and the rule that Vampyre does not merge its own
daemon-created PRs.

## Secrets

Host setup creates:

```txt
~/vampyre/config/vampyre.env
```

Required keys checked by the current doctor path:

- `GITHUB_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional key:

- `OPENROUTER_API_KEY`

Docs and reports may mention key names and presence metadata only. They must not
include secret values.

## Native Validation

Project Profiles can include:

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

The implemented native-validation CLI dispatches and optionally waits for the
configured GitHub Actions workflow.

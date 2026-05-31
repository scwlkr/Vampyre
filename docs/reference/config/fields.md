# Configuration Fields

## Project Registry

Path:

```txt
~/vampyre/config/project-registry.json
```

Top-level shape:

- `version`: currently `1`.
- `projects`: non-empty array of Project Profiles.

## Project Profile

- `id`: unique project id.
- `displayName`: human-readable project name.
- `mode`: `safe-watcher` or `builder`.
- `cadence`: scheduler cadence string.
- `autonomyPolicy`: project-changing output policy.
- `paused`: boolean.
- `githubRepo`: `owner/name`; required for Safe/Watcher profiles and used by
  Builder profiles after repo creation.
- `rawIdea`: required for Builder profiles.
- `validationCommands`: optional array of shell commands.
- `autoSafeTasks`: optional array of fallback tasks.
- `nativeValidation`: optional native-validation config.
- `visualProof`: optional visual-product screenshot proof config.

## Runtime Policy

Path:

```txt
~/vampyre/config/runtime-policy.json
```

Top-level shape:

- `version`: currently `1`.
- `runtime`: daemon runtime mechanics.
- `budget`: Budget Mode provider, thresholds, and Codex scan behavior.
- `scheduler`: cadence and product-loop scheduling behavior.
- `buildAgent`: automatic Build Agent launch and worker defaults.
- `telegram`: Telegram command, brief, pause, and unauthorized-alert behavior.
- `status`: check-in rendering preferences.

Duration strings use compact no-space values such as `30s`, `15m`, `3h`, or
`1d`.

## Runtime Policy Fields

`runtime`:

- `heartbeatInterval`: daemon tick interval. Changing this field requires a
  daemon restart because the process interval is set at startup.

`budget`:

- `provider`: currently `codex`.
- `unknownRateLimitMode`: Budget Mode to use when Codex usage exists but no
  rate-limit percentage is available. Default: `normal`.
- `unavailableMode`: Budget Mode to use when no Codex usage can be read.
  Default: `conservative`.
- `thresholds.exhaustedAtOrBelowRemainingPercent`: remaining percentage for
  `exhausted`.
- `thresholds.criticalAtOrBelowRemainingPercent`: remaining percentage for
  `critical`.
- `thresholds.conservativeAtOrBelowRemainingPercent`: remaining percentage for
  `conservative`.
- `codex.codexHome`: optional Codex home override, or `null` for the runtime
  user's default `~/.codex`.
- `codex.lookbackDays`: number of days of Codex JSONL logs to scan.
- `codex.maxFiles`: newest JSONL file count to scan.

`scheduler`:

- `selectionStrategy`: currently `registry-order`.
- `budgetModeBehavior`: whether each Budget Mode allows or defers
  project-changing work. Defaults: `normal` and `conservative` allow,
  `critical` and `exhausted` defer.
- `cadenceIntervals`: map of cadence names to duration strings.
- `directMainProductLoop.minimumIntervalByBudgetMode`: minimum interval between
  direct-main product-loop runs for each Budget Mode.
- `directMainProductLoop.allowImmediateRunWithoutRunJournal`: whether a
  direct-main product loop with no prior Run Journal can run immediately.

`buildAgent`:

- `autoRunSelectedProjects`: if `false`, the scheduler can select a project but
  the daemon will not launch the Build Agent.
- `worker.model`: default Codex model for daemon-launched direct-main Builder
  loops, unless `VAMPYRE_CODEX_MODEL` overrides it.
- `worker.reasoningEffort`: default Codex reasoning effort, unless
  `VAMPYRE_CODEX_REASONING_EFFORT` overrides it.

`telegram`:

- `commands.status`: no-space Telegram status command.
- `commands.policy`: no-space Telegram policy-summary command.
- `commands.pause1min`, `commands.pause1hour`, `commands.pause1day`:
  no-space pause commands.
- `commands.resume`: no-space resume command.
- `pauseDurations`: duration mapping for the pause commands.
- `dailyBrief.enabled`: whether the daemon sends scheduled Daily Briefs.
- `dailyBrief.hourUtc`: UTC hour after which the Daily Brief is due.
- `unauthorizedAlerts.threshold`: attempts before alerting the authorized chat.
- `unauthorizedAlerts.window`: rolling attempt window.
- `unauthorizedAlerts.suppression`: suppression period after an alert.
- `unauthorizedAlerts.materialChangeCount`: extra attempts needed to alert
  during suppression.

`status`:

- `includeRuntimePolicySummary`: whether CLI and Telegram check-ins include
  policy summary lines.
- `includeTelegramCommands`: whether policy summaries include configured
  Telegram commands.

## Native Validation

- `provider`: currently `github-actions`.
- `workflowId`: workflow file or id, such as `macos-validation.yml`.
- `runnerLabel`: expected runner label, such as `macos-15`.
- `requiredConclusion`: expected terminal conclusion, usually `success`.
- `timeoutSeconds`: wait timeout for `validation request --wait`.

## Visual Proof

- `provider`: currently `github-actions-artifact`.
- `required`: whether missing screenshot proof blocks a Build Agent run.
- `artifactName`: GitHub Actions artifact name containing the screenshot.
- `imageFilePattern`: optional screenshot file name or path fragment to select
  from the artifact ZIP.

## Env File

Path:

```txt
~/vampyre/config/vampyre.env
```

Required keys:

- `GITHUB_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional key:

- `OPENROUTER_API_KEY`

Secret values must not be committed, printed, or copied into docs.

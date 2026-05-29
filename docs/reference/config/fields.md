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

## Native Validation

- `provider`: currently `github-actions`.
- `workflowId`: workflow file or id, such as `macos-validation.yml`.
- `runnerLabel`: expected runner label, such as `macos-15`.
- `requiredConclusion`: expected terminal conclusion, usually `success`.
- `timeoutSeconds`: wait timeout for `validation request --wait`.

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

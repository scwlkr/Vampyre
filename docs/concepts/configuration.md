# Configuration Model

Vampyre configuration is split between repo defaults and runtime host files.

## Repo Defaults

`src/registry/projectRegistry.ts` defines the default Project Registry used when
`~/vampyre/config/project-registry.json` is missing.

Default projects:

- `palette-wow`, Safe/Watcher, `scwlkr/paletteWOW`, Rails validation commands.
- `screenshot-tool`, Builder, `scwlkr/pinmark`, direct-main product-loop policy,
  `git diff --check`, and GitHub Actions native validation.

## Runtime Registry

The runtime registry path is:

```txt
~/vampyre/config/project-registry.json
```

It is created by Operational State initialization when missing. The registry is
synced into SQLite project rows so status and scheduling can read a stable
snapshot.

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

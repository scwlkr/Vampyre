# `validation request`

Dispatches and optionally waits for a configured native-validation workflow.

## Usage

```sh
node dist/cli.js validation request --host wlkrlab --project minimark --ref main [--wait] [--timeout-seconds 1800]
```

## Implemented Provider

The implemented provider is GitHub Actions. The target project must define
`nativeValidation` in its Project Profile.

## Behavior

- Loads runtime Project Registry and Operational State.
- Reads `GITHUB_TOKEN` only from the host secret source.
- Dispatches the configured workflow.
- Optionally polls to terminal status.
- Persists latest result in SQLite.
- Writes native-validation Markdown and JSON reports.
- Records failure or timeout blockers.

## Source

- `src/validation/nativeValidation.ts`
- `src/github/client.ts`

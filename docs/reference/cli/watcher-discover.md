# `watcher discover`

Inspects a managed Safe/Watcher repository and writes discovery reports.

## Usage

```sh
node dist/cli.js watcher discover --host wlkrlab [--workspace-root ~/vampyre] [--project palette-wow]
```

## Behavior

- Clones or fetches the managed runtime repo.
- Fast-forwards a clean managed clone before inspection.
- Blocks rather than overwriting dirty runtime clone state.
- Reads README/config/app structure.
- Checks repo-local project-truth docs.
- Lists open GitHub issues and PRs.
- Infers validation commands.
- Writes Markdown and JSON reports under `reports/watcher-discovery/<project-id>/`.

## Source

- `src/watcher/discovery.ts`

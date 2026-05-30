# Common Workflows

## Check Runtime Status

```sh
node dist/cli.js status --host wlkrlab
```

## Pause Or Resume Project-changing Work

```sh
node dist/cli.js pause 1h --host wlkrlab --reason "operator maintenance"
node dist/cli.js pause status --host wlkrlab
node dist/cli.js resume --host wlkrlab
```

Work Pause stops new scheduler-selected Build Agent launches. It does not kill
an already-running agent.

## Run Watcher Discovery

```sh
node dist/cli.js watcher discover --host wlkrlab --project palette-wow
```

Discovery inspects the managed runtime clone, GitHub issues/PRs, docs presence,
and inferred validation commands, then writes reports.

## Request Native Validation

```sh
node dist/cli.js validation request --host wlkrlab --project minimark --ref main --wait
```

The implemented provider dispatches GitHub Actions for the project's configured
workflow and records the result.

## Run Build Agent

```sh
node dist/cli.js agent run --host wlkrlab --project minimark
```

The daemon also invokes Build Agent runs automatically when scheduler conditions
allow it.

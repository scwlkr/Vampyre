# Workspace Model

`wlkrlab` is the runtime host. This MacBook is only the operator workstation.

## Runtime Workspace

The runtime workspace defaults to `~/vampyre` on `wlkrlab`.

```txt
~/vampyre/
  app/
  artifacts/
  config/
    project-registry.json
    vampyre.env
  data/
    vampyre.sqlite
  logs/
  repos/
  reports/
  worktrees/
```

## Directory Responsibilities

- `app/`: built Vampyre app copied by `daemon install`.
- `config/`: Project Registry and strict-permission env file.
- `data/`: SQLite Operational State.
- `logs/`: runtime logs.
- `repos/`: managed project clones.
- `worktrees/`: disposable project-changing worktrees.
- `reports/`: Watcher discovery, Build Agent, and native-validation reports.
- `artifacts/`: caches and build artifacts, such as per-project bundle paths.

## Rules

- Daemon-managed work uses the configured workspace root.
- Do not use random existing project checkouts for daemon work.
- Worktrees are disposable; successful ones should be removed after proof.
- Failed worktrees may be preserved as blocker evidence.
- Secrets stay in host-local config and are never printed.

## Operator Pattern

The operator runs commands locally, but runtime commands delegate to the
installed app on `wlkrlab` when they use `--host wlkrlab`.

Local development proof can happen on the MacBook. Runtime proof for daemon
behavior should happen against `wlkrlab`.

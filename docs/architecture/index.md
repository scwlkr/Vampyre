# Architecture

Architecture docs describe the implementation present in this repo.

## Docs

- [System overview](./system-overview.md)
- [File layout](./file-layout.md)
- [Data flow](./data-flow.md)
- [Lifecycle](./lifecycle.md)
- [Dependencies](./dependencies.md)

## Summary

Vampyre is a daemon-first TypeScript CLI and runtime service. It runs on
`wlkrlab` under `systemd --user`, uses SQLite for Operational State, reads a
Project Registry, schedules eligible projects, runs at most one Build Agent, and
surfaces results through GitHub, Telegram, reports, and repo-local docs.

# Concepts

Concept docs explain the project model without listing every command.

## Docs

- [Project model](./project.md)
- [Workspace model](./workspace.md)
- [Configuration model](./configuration.md)
- [Core workflow](./core-workflow.md)

## Quick Model

Vampyre is one supervised daemon on `wlkrlab`. It reads a Project Registry,
keeps Operational State in SQLite, schedules eligible projects, runs at most one
Active Build Agent at a time, and surfaces results through GitHub, Telegram, and
repo-local status docs.

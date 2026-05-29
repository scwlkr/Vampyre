# `init`

No `vampyre init` command is implemented.

Current initialization happens through:

- [`host setup`](./host-setup.md) for runtime workspace and env stub setup.
- Operational State initialization, which creates the default Project Registry
  when missing.
- [`builder repo create`](./builder-repo-create.md) for approved Builder project
  repository creation.

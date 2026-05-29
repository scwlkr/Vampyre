# Create Project

The implemented Builder repo creation path is specific to the approved Pinmark
template.

## Prerequisites

- A GitHub approval issue labeled `vampyre:approval`.
- Matching approval fields for project id, approval kind, and approval key.
- A `VAMPYRE_APPROVED` marker in the issue body or an issue comment.
- Runtime `GITHUB_TOKEN` with permission to create or update the target repo.

## Command

```sh
node dist/cli.js builder repo create \
  --host wlkrlab \
  --control-repo scwlkr/Vampyre \
  --project screenshot-tool \
  --approval-kind builder-repo-plan \
  --approval-key pinmark-repo-plan \
  --repo scwlkr/pinmark \
  --description "Local-first macOS screenshot markup tool" \
  --template pinmark
```

## Behavior

The command checks approval, creates or confirms the private GitHub repository,
writes initial project files in the runtime workspace, commits, pushes `main`,
and leaves proof in command output.

Only `--template pinmark` is implemented.

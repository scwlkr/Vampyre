# Create Project

The implemented Builder repo creation path supports the approved Pinmark and
MiniMark templates.

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
  --project minimark \
  --approval-kind builder-repo-plan \
  --approval-key minimark-repo-plan \
  --repo scwlkr/minimark \
  --description "No-permission macOS markdown scratchpad" \
  --template minimark
```

## Behavior

The command checks approval, creates or confirms the private GitHub repository,
writes initial project files in the runtime workspace, commits, pushes `main`,
and leaves proof in command output.

Implemented templates:

- `pinmark`
- `minimark`

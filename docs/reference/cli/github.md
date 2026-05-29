# GitHub, Approval, PR, And Review Commands

These commands use GitHub as the durable review and approval surface.

## GitHub Check

```sh
node dist/cli.js github check --host wlkrlab [--workspace-root ~/vampyre] [--repo owner/name]
```

Checks token auth and optional repository access.

## Approval Check

```sh
node dist/cli.js approval check --host wlkrlab --repo owner/name --project project-id --kind builder-vision|builder-repo-plan|major-feature --key approval-key
```

Looks for a labeled GitHub issue with matching fields and a
`VAMPYRE_APPROVED` marker in the body or comments.

## PR Upsert

```sh
node dist/cli.js pr upsert --host wlkrlab --repo owner/name --head branch --base branch --title title [--body body] [--draft]
```

Creates or updates an open pull request for the target head/base branch and
sends a Telegram link when configured.

## Review Request

```sh
node dist/cli.js review request --host wlkrlab [--workspace-root ~/vampyre]
```

Creates or reuses a GitHub review issue for the scheduler-selected project and
sends a Telegram link.

## Source

- `src/github/client.ts`
- `src/github/githubCheck.ts`
- `src/github/approvalLookup.ts`
- `src/github/prWorkflow.ts`
- `src/github/reviewWorkflow.ts`

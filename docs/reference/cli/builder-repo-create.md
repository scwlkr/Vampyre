# `builder repo create`

Creates or confirms an approved private Builder repository and initial Project
Contract.

## Usage

```sh
node dist/cli.js builder repo create \
  --host wlkrlab \
  --control-repo owner/name \
  --project project-id \
  --approval-kind builder-repo-plan \
  --approval-key key \
  --repo owner/name \
  --description text \
  --template pinmark
```

## Implemented Template

Only `pinmark` is implemented.

## Source

- `src/builder/repoCreation.ts`

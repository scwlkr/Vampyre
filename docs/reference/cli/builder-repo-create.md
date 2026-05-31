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
  --template pinmark|minimark|keepingus
```

## Implemented Templates

- `pinmark`
- `minimark`
- `keepingus`

Generated Builder app docs follow the shared initial app-docs structure:
`AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/index.md`,
`docs/map.md`, lowercase `docs/status.md`, concepts, guides, reference,
architecture, decisions, and todo docs.

## Source

- `src/builder/repoCreation.ts`

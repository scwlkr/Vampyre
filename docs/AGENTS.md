# Docs Agent Instructions

Docs are part of the product contract for Vampyre. Keep them factual, compact,
and linked.

## Source Paths

- Current handoff: `docs/STATUS.md`
- Roadmap: `docs/to-do/ROADMAP.md`
- Docs routing: `docs/map.md`
- Historical ADRs: `docs/adr/`
- Current architecture docs: `docs/architecture/`

Do not create a competing lowercase `docs/status.md`; this repo already uses
`docs/STATUS.md` as the canonical status handoff.

## Editing Rules

- Verify docs claims against source, tests, CLI help, or live proof.
- Put uncertain, planned, or unverified behavior in `docs/todo/` or
  `docs/to-do/`.
- Keep source-of-truth docs short enough for agents to load quickly.
- Prefer links over duplicating long explanations.
- Do not print secret values in docs, examples, status, or proof logs.
- Update `docs/STATUS.md` after meaningful implementation work.

## Validation

For docs-only changes, run at least:

```sh
git diff --check
```

For broader changes, run the repo proof loop from `README.md`.

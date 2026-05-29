# Docs Audit Skill

Use this skill when updating Vampyre docs.

## Inputs

Read these before editing docs:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/STATUS.md`
- `docs/map.md`
- The docs related to the task
- The source or tests that verify the claim being edited

## Workflow

1. Identify whether the edit changes source-of-truth docs, reference docs, or
   todo/unverified docs.
2. Verify factual claims against code, tests, CLI help, GitHub/runtime proof, or
   current status.
3. Keep source-of-truth docs compact and route deeper detail through links.
4. Move stale, planned, or uncertain claims to `docs/todo/` or `docs/to-do/`.
5. Update `docs/STATUS.md` after meaningful work.
6. Run validation appropriate to the change.

## Standards

Use [references/docs-standard.md](./references/docs-standard.md).

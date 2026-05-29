# 0001 Docs Structure

## Decision

Use a modular documentation structure with small linked docs for concepts,
guides, reference, architecture, decisions, and todo items.

Keep the existing repo-contract paths:

- `CONTEXT.md`
- `docs/STATUS.md`
- `docs/to-do/ROADMAP.md`

Do not create a competing lowercase `docs/status.md` because the project already
uses `docs/STATUS.md` as the handoff source and the operator filesystem may be
case-insensitive.

## Reason

The previous docs held too much source-of-truth material in a few large files.
That made agent loading expensive and mixed current facts with old proof detail.

The new structure preserves the known contract paths while routing deeper detail
through `docs/map.md`.

## Consequences

- Agents can load only the docs needed for a task.
- Unverified or planned behavior has a dedicated todo area.
- Some template filenames are adapted to the existing repo contract rather than
  duplicated.

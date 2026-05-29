# Docs Standard

## Source Of Truth

- `docs/STATUS.md` is the current handoff.
- `docs/to-do/ROADMAP.md` is the roadmap.
- `CONTEXT.md` is compact project context.
- `docs/map.md` tells agents what to load.
- `docs/adr/` and `docs/decisions/` record durable decisions.

## Verification

Docs claims should be traceable to at least one of:

- Source code in `src/`
- Tests in `tests/`
- CLI help output from `node dist/cli.js --help`
- Current runtime proof recorded in `docs/STATUS.md`
- ADRs or decision records

Unverified or planned behavior belongs in todo docs.

## Size

Aim for short docs that agents can load quickly:

- Prefer 80 to 200 lines.
- Avoid docs over 300 lines unless the Owner explicitly needs a long artifact.
- Link related docs instead of copying long sections.

## Secret Safety

- Mention secret key names only.
- Do not include secret values, tokens, chat ids, auth headers, or raw env file
  output.
- Use secret presence metadata wording when discussing runtime config.

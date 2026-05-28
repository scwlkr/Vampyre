# Vampyre

Vampyre is an always-on system for creating and sustaining software projects.

The MVP is a central daemon that runs on `wlkrlab`, manages multiple Project Profiles, keeps existing projects moving, and turns approved new ideas into real running projects with explicit guardrails.

## MVP Proof

- Safe/Watcher project: [`scwlkr/paletteWOW`](https://github.com/scwlkr/paletteWOW)
- Builder project: a real macOS screenshot tool with quick markup features similar in spirit to ShareX
- Runtime host: `wlkrlab`
- Supervision: `systemd --user`
- Stack: TypeScript on Node.js with `pnpm`

## Project Docs

- [Context](./CONTEXT.md)
- [Roadmap](./docs/to-do/ROADMAP.md)
- [Status](./docs/STATUS.md)
- [ADRs](./docs/adr/)

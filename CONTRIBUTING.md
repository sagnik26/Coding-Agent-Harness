# Contributing to Craftly

Thanks for helping improve Craftly. This guide covers how to set up the repo, make changes, and open a pull request.

## Development setup

```bash
git clone https://github.com/sagnik26/Coding-Agent-Harness.git
cd Coding-Agent-Harness
pnpm install
cp .env.example .env   # set OPENAI_API_KEY
```

Useful commands:

| Command | Purpose |
|---|---|
| `pnpm start . "<prompt>"` | Run the CLI agent (prefer `--sandbox=local`) |
| `pnpm web` | Craftly web UI |
| `pnpm typecheck` | Typecheck all `@coding-agent-harness/*` packages |
| `pnpm eval:dry` | List eval cases |
| `pnpm eval` | Run the behavioral eval suite |

See [AGENTS.md](./AGENTS.md) for agent-oriented project conventions and [README.md](./README.md) for architecture and env vars.

## How to contribute

1. **Open an issue** for bugs or larger features when the change is non-trivial.
2. **Fork** the repo and create a branch from `main` (`feat/…`, `fix/…`, or `docs/…`).
3. **Keep diffs focused** — match existing patterns; avoid drive-by refactors.
4. **Do not commit secrets** — never add `.env`, API keys, or OIDC tokens.
5. **Verify** before opening a PR:
   - `pnpm typecheck`
   - For agent/behavior changes: `pnpm eval:dry` and a relevant `pnpm eval` slice when practical
6. **Open a pull request** with a short summary of *why*, what you changed, and how you tested.

## Package layout

| Path | Role |
|---|---|
| `packages/core` | Sandbox interface, approval, verification, system prompt, cache |
| `packages/sandbox` | Local / cloud backends, chaos |
| `packages/tools` | Tool factories |
| `packages/cli` | CLI wiring |
| `web/` | Craftly Next.js surface |
| `eval/` | Behavioral eval suite |

Prefer dependency injection through the `Sandbox` interface. Do not import concrete sandbox backends from `packages/tools`.

## Style

- ESM (`"type": "module"`), named exports
- AI SDK v6 naming: `instructions`, `stopWhen: stepCountIs(n)`
- No new dependencies without discussion in the PR

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).

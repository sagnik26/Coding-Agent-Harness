# Project Instructions

## Commands
- `pnpm start . "<prompt>"` runs the coding agent
- `pnpm typecheck` runs TypeScript (`tsc --noEmit`)

## Architecture
- Single-package TypeScript agent harness (not a monorepo)
- Entry point: `index.ts`
- Tools and sandbox: `src/tools.ts`, `src/sandbox-local.ts`
- System prompt builder: `src/system.ts`

## Style
- ESM (`"type": "module"`)
- Named exports, not default
- Tool factories take a `Sandbox` interface

## Lessons learned
- Run as `pnpm start . "prompt"` (not `pnpm start -- .`)
- Use `grep` with `path: "."` to search the whole project

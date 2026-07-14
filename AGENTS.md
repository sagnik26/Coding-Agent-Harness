# Project Instructions

Instructions for the coding agent when working in **Coding-Agent-Harness** (TeensyCode).

This file is read from the working directory at startup and injected into the system prompt under `# Project Instructions (from AGENTS.md)`. Keep it accurate — the agent treats this as ground truth for this repo.

For deeper design detail, see [Architecture.md](./Architecture.md).

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm start . "<prompt>"` | Run the agent against this project (local sandbox) |
| `SANDBOX=just-bash pnpm start . "<prompt>"` | Run agent with in-memory sandbox (writes don't touch disk) |
| `SANDBOX=cloud pnpm start . "<prompt>"` | Run agent on a remote Vercel Sandbox VM |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |

**Examples:**

```bash
pnpm start . "Read the tsconfig.json"
pnpm start . "Find all TODO comments in this project"
pnpm start . "List all files in this directory"
```

**Note:** Use `pnpm start . "prompt"` — not `pnpm start -- . "prompt"` (pnpm passes `--` into argv).

---

## Environment

Create `.env` in the project root (do not commit):

```
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini   # optional
SANDBOX=local              # local | just-bash | cloud
VERCEL_SNAPSHOT_ID=       # optional: restore cloud sandbox from snapshot

# Cloud sandbox auth (one of):
# - Run `vercel link` + `vercel env pull` for OIDC token
# - Or set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN
```

---

## Architecture

Single-package TypeScript agent harness (not a monorepo).

```
Coding-Agent-Harness/
├── index.ts              # CLI entry — wires sandbox, tools, agent
├── Architecture.md       # Living architecture doc
├── IMPLEMENTATION_GUIDE.md # Step-by-step build guide
├── AGENTS.md             # This file
└── src/
    ├── sandbox.ts        # Sandbox interface
    ├── sandbox-local.ts  # Local disk + spawn-based exec
    ├── sandbox-just-bash.ts # In-memory overlay (just-bash)
    ├── sandbox-cloud.ts  # Remote VM (@vercel/sandbox)
    ├── cache.ts          # addCacheControl() for cacheable message prefixes
    ├── tools.ts          # read, grep, bash tool factories
    └── system.ts         # buildSystemPrompt()
```

### Request flow (short)

1. `main()` parses `cwd` + prompt from argv
2. `createSandbox()` picks backend (`local` / `just-bash` / `cloud`)
3. Tools are built with the sandbox injected (`createReadTool(sandbox)`, etc.)
4. `ToolLoopAgent` sends prompt + tool definitions to the model
5. Model calls tools (`read`, `grep`, `bash`) as needed
6. `runAgent()` → `printAgentResult()` logs tool trace + answer
7. `shutdownSandbox()` in `finally` — always stops sandbox (critical for cloud billing)

### CLI functions (`index.ts`)

| Function | Role |
|----------|------|
| `main()` | Wire everything; `try/finally` for cleanup |
| `createSandbox()` | Factory — `SANDBOX` env → backend |
| `createApproval()` | Bash command gating (safe-prefix allowlist) |
| `runAgent()` | `agent.generate({ prompt })` |
| `printAgentResult()` | Tool trace + answer + step count |
| `shutdownSandbox()` | `beforeStop` hook + `sandbox.stop()` |

### Design patterns

See [Architecture.md](./Architecture.md#design-patterns) for full detail. Short version:

- **Strategy** — `Sandbox` interface; swap local / just-bash / cloud
- **Factory** — `createSandbox`, `createReadTool`, `createApproval`
- **Adapter** — `sandbox-cloud.ts` wraps `@vercel/sandbox`
- **Dependency injection** — tools receive `sandbox`, not concrete backends

### Available tools

| Tool | Use for |
|------|---------|
| `read` | Read a known file (numbered lines, 500-line cap) |
| `grep` | Search across files with regex (50-match cap) |
| `bash` | Shell commands (approval-gated) |
| `task` | Delegate research to read-only explorer(s); pass multiple descriptions for parallel research |

**Routing:** Read a specific file → `read`. Search patterns → `grep`. Run commands → `bash`. Multi-file investigation → `task`. Independent multi-area questions → one `task` with several descriptions; parent synthesizes.

### Sandbox

| Backend | Env | Behavior |
|---------|-----|----------|
| **local** | default | Real filesystem + `spawn` |
| **just-bash** | `SANDBOX=just-bash` | Copy-on-write overlay — reads from disk, writes in memory |
| **cloud** | `SANDBOX=cloud` | Remote Vercel Sandbox VM — isolated, per-minute cost, hard timeout |

Lifecycle hooks (`afterStart`, `beforeStop`, `onTimeout`) apply to cloud:

| Hook | Where | Purpose |
|------|-------|---------|
| `afterStart` | `createCloudSandbox` | Git clone, `npm install`, seed files |
| `beforeStop` | `shutdownSandbox()` in `finally` | Cleanup before VM stops |
| `onTimeout` | Planned (Module 7) | Snapshot before timeout |

- `readFile` — path translation per backend (`cwd`, `/home/user/project`, `/vercel/sandbox`)
- `exec` — local: `spawn`; just-bash: virtual shell; cloud: `vm.runCommand`

---

## Style & conventions

- **ESM** — `"type": "module"` in `package.json`
- **Named exports** — no default exports
- **Tool factories** — take a `Sandbox` interface, not concrete implementations (dependency injection)
- **Sandbox factory** — `createSandbox()` in `index.ts`; never import backends in `tools.ts`
- **AI SDK v6 naming** — `instructions` (not `system`), `stopWhen: stepCountIs(n)`, `agent.generate({ prompt })`
- **Minimal diffs** — only change what the task requires; match existing patterns
- **No new dependencies** without asking

---

## Verification

After making code changes:

1. Run `pnpm typecheck` — must pass with zero errors
2. Run tests/lint/build only if scripts exist in `package.json` and `bash` approval allows them
3. Report honestly what was run, blocked, or unavailable
4. Do not claim tests pass unless they were actually executed

---

## Approval (bash)

`bash` runs in **interactive** approval mode:

- **Allowed** (safe prefixes): `ls`, `cat`, `echo`, `pwd`, `which`, `find`, `head`, `tail`, `wc`, `git log`, `git status`, `git diff`
- **Blocked** — returns a string message; report blocks honestly, do not fabricate success

---

## Lessons learned

- `grep` tool: use `path: "."` to search the whole project; `glob: "*.*"` or `glob: "*.ts"` for file filtering
- `read` tool: path is relative to working directory; output is numbered and capped at 500 lines
- Live command output streams to **stderr** via `onStdout` — not an error channel, just a side channel for progress
- `process.stderr.write(chunk)` in bash tool shows output while the command runs; full output is still returned to the model
- `spawn` + Promise (local backend) instead of `execSync` — non-blocking exec and streaming
- `interactive` approval does **not** prompt the user — it auto-allows safe-prefix commands and **blocks** the rest with a string message
- `echo > file` is allowed (starts with `echo`) — use `SANDBOX=just-bash` for safe write exploration
- Cloud VM starts **empty** — seed files in `afterStart`, not in `createCloudSandbox`

---

## Implementation status

| Module | Status |
|--------|--------|
| Agent loop (`ToolLoopAgent`) | Done |
| Tools: `read`, `grep`, `bash` | Done |
| Sandbox: local | Done |
| System prompt + AGENTS.md injection | Done |
| Sandbox: just-bash | Done |
| Sandbox: cloud | Done |
| CLI refactor (`main`, `runAgent`, `shutdownSandbox`) | Done |
| Lifecycle hooks (cloud `afterStart` / `beforeStop`) | Done |
| Context: token telemetry (`onStepFinish`) | Done (5.1) |
| Context: pruneMessages in `prepareCall` | Done (5.2) |
| Context: bounded tool output (incl. bash 5k) | Done (5.3) |
| Context: cache control (`addCacheControl`) | Done (5.4) |
| Subagents: explorer via `task` tool | Done (6.2) |
| Write / edit tools | Planned |
| Subagents (`task` tool) | Planned |
| Streaming CLI | Planned |
| Skills system | Planned |

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for the full roadmap.

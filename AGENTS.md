# Project Instructions

Instructions for the coding agent when working in **Coding-Agent-Harness** (TeensyCode).

This file is read from the working directory at startup and injected into the system prompt under `# Project Instructions (from AGENTS.md)`. Keep it accurate — the agent treats this as ground truth for this repo.

For deeper design detail, see [Architecture.md](./Architecture.md).

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm start . "<prompt>"` | Run the agent against this project (local sandbox) |
| `pnpm start --sandbox=cloud . "<prompt>"` | Run agent on a remote Vercel Sandbox VM |
| `pnpm start --model=gpt-4o-mini . "<prompt>"` | Override the OpenAI model (default: `gpt-4o-mini`) |
| `SANDBOX=cloud pnpm start . "<prompt>"` | Same as `--sandbox=cloud` (env fallback) |
| `CHAOS=1 pnpm start . "<prompt>"` | Inject one random sandbox failure this session |
| `pnpm typecheck` | TypeScript check (all `@coding-agent-harness/*` packages) |
| `pnpm eval` | Run behavioral eval suite (all cases) |
| `pnpm eval:dry` | List eval cases without calling the model |

**Examples:**

```bash
pnpm start . "Read the tsconfig.json"
pnpm start --sandbox=local --model=gpt-4o-mini . "Find all TODO comments in this project"
pnpm start . "List all files in this directory"
CHAOS=1 pnpm start . "List files with ls"
CHAOS_MODE=kill-mid-command pnpm start . "List files with ls"
```

**Note:** Use `pnpm start . "prompt"` or `pnpm start --sandbox=local . "prompt"` — not `pnpm start -- . "prompt"` (pnpm passes `--` into argv).

**Testing:** Prefer `--sandbox=local` (or `SANDBOX=local`) for agent tests. The parent agent step limit is **15** (`stopWhen: stepCountIs(15)`).

Module 9 wiring smoke test (expect citations from both `packages/cli/src/index.ts` and `packages/core/src/system.ts`, including `buildSystemPrompt({ verificationCommands })`):

```bash
SANDBOX=local pnpm start . "How is Module 9 wired end-to-end? Grep createTodoTool, discoverGates, buildSystemPrompt. Read packages/cli/src/index.ts and packages/core/src/system.ts at grep hit line ranges. Cite at least one specific line from each file, including buildSystemPrompt and # Planning (todo) or # Verification. No askUser."
```

---

## Environment

Create `.env` in the project root (do not commit):

```
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini   # optional
SANDBOX=local              # local | cloud
VERCEL_SNAPSHOT_ID=       # optional: restore cloud sandbox from snapshot

# Cloud sandbox auth (one of):
# - Run `vercel link` + `vercel env pull` for OIDC token
# - Or set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN
```

---

## Architecture

pnpm workspace: packages `@coding-agent-harness/{core,sandbox,tools,cli}`, thin entry `apps/index.ts`, eval `@coding-agent-harness/eval`.

```
Coding-Agent-Harness/
├── Architecture.md       # Living architecture doc
├── IMPLEMENTATION_GUIDE.md # Step-by-step build guide
├── AGENTS.md             # This file
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   └── index.ts          # Thin entry — imports main from @coding-agent-harness/cli
├── packages/
│   ├── core/             # sandbox interface, approval, verification, system, cache
│   │                     # (+ constants/, helpers/)
│   ├── sandbox/          # local / cloud backends, chaos, lifecycle
│   │                     # (+ constants/, helpers/)
│   ├── tools/            # read, grep, write, edit, bash, task, askUser, todo
│   │                     # (+ constants/, helpers/)
│   └── cli/              # @coding-agent-harness/cli — main(), sandbox factory, agent wiring
│                         # (+ constants/, helpers/)
└── eval/                 # @coding-agent-harness/eval — behavioral eval suite
```

CLI entry is **`apps/index.ts`** (calls `main` from `packages/cli`). Eval runs via `pnpm eval` (workspace filter). Libraries are imported as `@coding-agent-harness/core/*`, `@coding-agent-harness/sandbox/*`, `@coding-agent-harness/tools/tools`.

### Request flow (short)

1. `main()` parses `--sandbox`, `--model`, `cwd`, and prompt via `parseArgs`
2. `createSandbox()` picks backend (`local` / `cloud`) from flag or `SANDBOX` env
3. Tools are built with the sandbox injected (`createReadTool(sandbox)`, etc.)
4. `ToolLoopAgent` sends prompt + tool definitions to the model
5. Model calls tools (`read`, `grep`, `bash`) as needed
6. `runAgent()` → `printAgentResult()` logs tool trace + answer
7. `shutdownSandbox()` in `finally` — always stops sandbox (critical for cloud billing)

### CLI functions (`packages/cli/src/index.ts`)

| Function | Role |
|----------|------|
| `main()` | Wire everything; `try/finally` for cleanup |
| `createSandbox()` | Factory — `--sandbox` flag / `SANDBOX` env → backend |
| `createApproval()` | Bash command gating (`packages/core/src/approval.ts` — interactive / delegated) |
| `runAgent()` | `agent.generate({ prompt })` |
| `printAgentResult()` | Tool trace + answer + step count |
| `shutdownSandbox()` | `beforeStop` hook + `sandbox.stop()` |

### Design patterns

See [Architecture.md](./Architecture.md#design-patterns) for full detail. Short version:

- **Strategy** — `Sandbox` interface; swap local / cloud
- **Factory** — `createSandbox`, `createReadTool`, `createApproval`
- **Adapter** — `sandbox-cloud.ts` wraps `@vercel/sandbox`
- **Dependency injection** — tools receive `sandbox`, not concrete backends

### Available tools

| Tool | Use for |
|------|---------|
| `read` | Read a known file (numbered lines, 500-line cap) |
| `grep` | Search across files with regex (50-match cap) |
| `write` | Create or overwrite a file (full contents) |
| `edit` | Targeted search/replace edit (preferred for partial changes) |
| `bash` | Shell commands (approval-gated) |
| `task` | Delegate to explorer (read-only, parallel descriptions) or executor (delegated bash) |
| `askUser` | Multiple-choice question when the task is ambiguous (2–4 options) |
| `todo` | Track multi-step work (add/start/complete/list; one in_progress at a time) |

**Routing:** Read a specific file → `read`. Search patterns → `grep`. Partial file changes → `edit`. New files or full overwrite → `write`. Run commands → `bash`. Multi-step tasks (3+ steps, multiple files) → `todo` to plan and track. Multi-file investigation → `task` (explorer). Independent multi-area research → one explorer `task` with several descriptions. Trusted implementation/verification → `task` with `subagentType: "executor"` and one description; parent synthesizes / decides. Ambiguous requirements → search first, then `askUser` (do not guess).

### Sandbox

| Backend | Env | Behavior |
|---------|-----|----------|
| **local** | default / `--sandbox=local` | Real filesystem + `spawn` |
| **cloud** | `--sandbox=cloud` or `SANDBOX=cloud` | Remote Vercel Sandbox VM — isolated, per-minute cost, hard timeout |

Lifecycle hooks (`afterStart`, `beforeStop`, `onTimeout`) apply to cloud:

| Hook | Where | Purpose |
|------|-------|---------|
| `afterStart` | `createCloudSandbox` | Git clone, `npm install`, seed files |
| `beforeStop` | `shutdownSandbox()` in `finally` | Cleanup before VM stops |
| `onTimeout` | Planned (Module 7) | Snapshot before timeout |

- `readFile` — path translation per backend (`cwd`, `/vercel/sandbox`)
- `exec` — local: `spawn`; cloud: `vm.runCommand`
- Chaos: `CHAOS=1 pnpm start . "<prompt>"` — one random failure (`packages/sandbox/src/chaos.ts`)

---

## Style & conventions

- **ESM** — `"type": "module"` in `package.json`
- **Named exports** — no default exports
- **Tool factories** — take a `Sandbox` interface, not concrete implementations (dependency injection)
- **Sandbox factory** — `createSandbox()` in `packages/cli/src/index.ts`; never import backends in `tools.ts`
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
- **Allowed** (verification): `pnpm typecheck`, `pnpm run typecheck`, `pnpm test`, `pnpm run test`, `pnpm run lint`, `pnpm run build`, `npx tsc`, and npm equivalents
- **Blocked** — returns a string message; report blocks honestly, do not fabricate success

---

## Lessons learned

- `grep` tool: use `path: "."` to search the whole project; `glob: "*.*"` or `glob: "*.ts"` for file filtering
- `read` tool: path is relative to working directory; output is numbered and capped at 500 lines
- Live command output streams to **stderr** via `onStdout` — not an error channel, just a side channel for progress
- `process.stderr.write(chunk)` in bash tool shows output while the command runs; full output is still returned to the model
- `spawn` + Promise (local backend) instead of `execSync` — non-blocking exec and streaming
- `interactive` approval does **not** prompt the user — it auto-allows safe-prefix commands and **blocks** the rest with a string message
- `echo > file` is allowed (starts with `echo`) — prefer careful use on local; cloud is isolated
- Cloud VM starts **empty** — seed files in `afterStart`, not in `createCloudSandbox`

---

## Implementation status

| Module | Status |
|--------|--------|
| Agent loop (`ToolLoopAgent`) | Done |
| Tools: `read`, `grep`, `write`, `edit`, `bash` | Done |
| Sandbox: local | Done |
| System prompt + AGENTS.md injection | Done |
| Sandbox: cloud | Done |
| CLI refactor (`main`, `runAgent`, `shutdownSandbox`) | Done |
| Lifecycle hooks (cloud `afterStart` / `beforeStop`) | Done |
| Lifecycle: chaos mode (`--chaos`) | Done (7) |
| Context: token telemetry (`onStepFinish`) | Done (5.1) |
| Context: pruneMessages in `prepareCall` | Done (5.2) |
| Context: bounded tool output (incl. bash 5k) | Done (5.3) |
| Context: cache control (`addCacheControl`) | Done (5.4) |
| Subagents: explorer via `task` tool | Done (6.2) |
| Subagents: executor via `task` tool | Done (6.3) |
| Subagents: task tool as router | Done (6.4) |
| HITL: `askUser` + ambiguity protocol | Done (8.1) |
| HITL: approval config vs events (concept) | Done (8.2) — events deferred to Module 11 |
| Planning: `todo` tool + verification gates | Done (9) |
| Write / edit tools | Done |
| Streaming CLI | Planned |
| Skills system | Planned |

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for the full roadmap.

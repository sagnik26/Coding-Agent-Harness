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
SANDBOX=local              # or just-bash for in-memory overlay
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
    ├── tools.ts          # read, grep, bash tool factories
    └── system.ts         # buildSystemPrompt()
```

### Request flow (short)

1. `index.ts` parses `cwd` + prompt from argv
2. `ToolLoopAgent` sends prompt + tool definitions to the model
3. Model calls tools (`read`, `grep`, `bash`) as needed
4. Tools use `Sandbox` — never `fs` or `child_process` directly
5. Model writes final answer; CLI prints tool trace + response

### Available tools

| Tool | Use for |
|------|---------|
| `read` | Read a known file (numbered lines, 500-line cap) |
| `grep` | Search across files with regex (50-match cap) |
| `bash` | Shell commands (approval-gated) |

**Routing:** Read a specific file → `read`. Search patterns → `grep`. Run commands → `bash`.

### Sandbox

| Backend | Env | Behavior |
|---------|-----|----------|
| **local** | default | Real filesystem + `spawn` |
| **just-bash** | `SANDBOX=just-bash` | Copy-on-write overlay — reads from disk, writes in memory |

- `readFile` — reads through sandbox path translation
- `exec` — local uses `spawn`; just-bash uses virtual shell at `/home/user/project`

---

## Style & conventions

- **ESM** — `"type": "module"` in `package.json`
- **Named exports** — no default exports
- **Tool factories** — take a `Sandbox` interface, not concrete implementations
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
- `spawn` + Promise is used instead of `execSync` for non-blocking exec and streaming

---

## Implementation status

| Module | Status |
|--------|--------|
| Agent loop (`ToolLoopAgent`) | Done |
| Tools: `read`, `grep`, `bash` | Done |
| Sandbox: local | Done |
| System prompt + AGENTS.md injection | Done |
| Sandbox: just-bash | Done |
| Write / edit tools | Planned |
| Subagents (`task` tool) | Planned |
| Streaming CLI | Planned |
| Skills system | Planned |

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for the full roadmap.

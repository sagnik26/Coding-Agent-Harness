# Architecture

Living document for **Coding-Agent-Harness** (TeensyCode). Update this as modules are added.

---

## Overview

A TypeScript coding agent harness built on the [Vercel AI SDK](https://sdk.vercel.ai) `ToolLoopAgent`. The agent receives a natural-language prompt, decides which tools to call, executes them against a **sandbox** (filesystem + shell), and returns a final answer.

| Layer | Role |
|-------|------|
| **CLI** (`index.ts`) | `main()` — factory wiring, agent run, guaranteed sandbox shutdown |
| **Agent loop** | `ToolLoopAgent` — model thinks, calls tools, repeats until done |
| **Tools** (`src/tools.ts`) | `read`, `grep`, `bash` — what the model can do |
| **Sandbox** (`src/sandbox*.ts`) | Abstraction over filesystem + command execution |
| **System prompt** (`src/system.ts`) | Instructions, guardrails, optional `AGENTS.md` injection |

---

## Project structure

```
Coding-Agent-Harness/
├── index.ts              # CLI entry point
├── Architecture.md       # This file
├── IMPLEMENTATION_GUIDE.md
├── AGENTS.md             # Optional per-project instructions (if present)
└── src/
    ├── sandbox.ts        # Sandbox interface
    ├── sandbox-local.ts  # Local disk + spawn-based exec
    ├── sandbox-just-bash.ts # In-memory overlay
    ├── sandbox-cloud.ts  # Remote VM (@vercel/sandbox)
    ├── tools.ts          # Tool factories (read, grep, bash)
    └── system.ts         # buildSystemPrompt()
```

**Planned** (see `IMPLEMENTATION_GUIDE.md`): `approval.ts` extract, `skills.ts`, subagents, context pruning, streaming CLI.

---

## Design patterns

| Pattern | Where | What it does |
|---------|-------|--------------|
| **Strategy** | `Sandbox` interface + three backends | Same `readFile` / `exec` API; swap local, just-bash, or cloud via `SANDBOX` |
| **Factory** | `createSandbox`, `createReadTool`, `createApproval`, etc. | Centralized construction; callers don't build concrete implementations |
| **Adapter** | `sandbox-cloud.ts` | Wraps `@vercel/sandbox` VM API behind your `Sandbox` interface |
| **Dependency injection** | `createReadTool(sandbox)`, `createBashTool(sandbox, needsApproval)` | Tools receive dependencies; they don't pick a backend |
| **Lifecycle hooks** | `SandboxLifecycleHooks` | `afterStart` / `beforeStop` / `onTimeout` — cloud setup and teardown |
| **Discriminated union** | `ApprovalConfig` | Type-safe approval modes: `interactive` \| `background` \| `delegated` |

```
Factory (createSandbox)
    → Strategy (local | just-bash | cloud)
        → Adapter (cloud only: VercelSandbox → Sandbox)
            → Tools (read, grep, bash) via DI
                → ToolLoopAgent
```

---

## CLI structure (`index.ts`)

| Function | Role |
|----------|------|
| `main()` | Entry point — wire sandbox, tools, agent; `try/finally` cleanup |
| `createSandbox()` | Factory — pick backend from `SANDBOX` env |
| `createApproval()` | Policy factory — bash command gating |
| `runAgent()` | Call `agent.generate({ prompt })` |
| `printAgentResult()` | Log tool trace + model answer + step count |
| `shutdownSandbox()` | `beforeStop` hook + `sandbox.stop()` |

```ts
async function main() {
  const { sandbox, hooks } = await createSandbox(sandboxType, cwd);
  // ... build tools + agent ...
  try {
    await runAgent(agent, prompt);
  } finally {
    await shutdownSandbox(sandbox, hooks);  // always runs
  }
}
await main();
```

---

## High-level diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   User      │────▶│   index.ts       │────▶│ ToolLoopAgent│
│  (terminal) │     │  cwd, prompt     │     │  + model     │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     │                              │                              │
                     ▼                              ▼                              ▼
              ┌────────────┐                ┌────────────┐                ┌────────────┐
              │    read    │                │    grep    │                │    bash    │
              │  (tools.ts)│                │  (tools.ts)│                │  (tools.ts)│
              └─────┬──────┘                └─────┬──────┘                └─────┬──────┘
                    │                              │                              │
                    └──────────────────────────────┼──────────────────────────────┘
                                                   ▼
                              ┌────────────────────────────────────┐
                              │         Sandbox (interface)        │
                              │         readFile / exec / stop     │
                              └──────────────┬─────────────────────┘
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
             ┌────────────┐          ┌────────────┐          ┌────────────┐
             │   local    │          │ just-bash  │          │   cloud    │
             │ spawn + fs │          │ virtual FS │          │ remote VM  │
             └────────────┘          └────────────┘          └────────────┘
```

---

## Request / response flow

Example:

```bash
pnpm start . "Read the tsconfig.json"
```

Equivalent to:

```bash
tsx index.ts . "Read the tsconfig.json"
```

### Phase 1 — Boot (`main()` in `index.ts`)

| Step | Code | Effect |
|------|------|--------|
| Load env | `import "dotenv/config"` | `OPENAI_API_KEY`, `SANDBOX`, optional `OPENAI_MODEL` |
| Resolve cwd | `process.argv[2] \|\| process.cwd()` | Working directory = `.` |
| Create sandbox | `createSandbox(SANDBOX, cwd)` | Factory picks local / just-bash / cloud |
| Create tools | `createReadTool`, `createGrepTool`, `createBashTool` | Inject `sandbox` + approval policy |
| Build prompt | `buildSystemPrompt(...)` | Agency, guardrails, tool list, `AGENTS.md` |
| Create agent | `new ToolLoopAgent({ model, instructions, tools, stopWhen })` | Agent loop, max 10 steps |
| Run | `runAgent(agent, prompt)` inside `try` | Start the loop |
| Shutdown | `shutdownSandbox(sandbox, hooks)` in `finally` | Lifecycle hook + `sandbox.stop()` |

Terminal:

```
Sandbox: local
```

(from `console.error` in `index.ts`)

### Phase 2 — Step 1: model calls a tool

The model receives:

- **System prompt** — role, working directory, available tools, guardrails
- **User message** — `"Read the tsconfig.json"`

It reads each tool's `description` (WHEN TO USE / WHEN NOT TO USE) and picks `read`:

```json
read({ "path": "tsconfig.json", "offset": 0, "limit": 20 })
```

### Phase 3 — Tool execution

```
ToolLoopAgent
    → read.execute({ path, offset, limit })
        → sandbox.readFile("tsconfig.json")
            → readFileSync(resolve(cwd, path))   // sandbox-local.ts
        → split lines, apply offset/limit, number lines (cap 500)
    → tool result string returned to agent loop
```

`grep` and `bash` follow the same pattern via `sandbox.exec()` instead of `readFile`.

### Phase 4 — Step 2: model writes final answer

The model now has **real file content** from the tool result. It formats a response (JSON block + summary). No further tool calls → loop ends.

### Phase 5 — CLI output (`index.ts`)

| Output | Source |
|--------|--------|
| `--- tools used ---` | `index.ts` — logs `steps[].toolCalls` |
| `[step 1] read({...})` | `index.ts` — debug trace |
| JSON + explanation | Model — `text` from `agent.generate` |
| `(2 steps, tools: read)` | `index.ts` — step count summary |

### Agent loop timeline

```
YOU:  "Read the tsconfig.json"
        │
        ▼
┌─────────────────────────────────────┐
│  STEP 1 — Model thinks + acts       │
│  • Sees prompt + tool descriptions  │
│  • Calls: read("tsconfig.json")     │
│  • Tool reads file from disk        │
│  • Tool result → back to model      │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  STEP 2 — Model responds            │
│  • Has real file content            │
│  • Writes summary for user          │
│  • Loop ends (no more tools)        │
└─────────────────────────────────────┘
        │
        ▼
index.ts prints: tools log → answer → step count
```

**Chatbot vs agent:** 1 step = model talks only (no tools). 2+ steps = model used tools and acted on real data.

---

## Agent loop (`ToolLoopAgent`)

| Setting | Value | Notes |
|---------|-------|-------|
| `model` | `gpt-4o-mini` (default) | Via `@ai-sdk/openai`, overridable with `OPENAI_MODEL` |
| `instructions` | `buildSystemPrompt(...)` | Not `system` — AI SDK v6 naming |
| `tools` | `{ read, grep, bash }` | Zod `inputSchema` per tool |
| `stopWhen` | `stepCountIs(10)` | Safety cap on loop iterations |
| Invoke | `agent.generate({ prompt })` | Not `agent.generate(prompt)` |

Each **step** is one model turn. A step may include zero or more tool calls, then the model sees tool results on the next step.

---

## Sandbox abstraction

```ts
interface SandboxLifecycleHooks {
  afterStart?: (sandbox: Sandbox) => Promise<void>;
  beforeStop?: (sandbox: Sandbox) => Promise<void>;
  onTimeout?: (sandbox: Sandbox) => Promise<void>;
}

interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
  expiresAt?: number;   // cloud only
  snapshot?(): Promise<{ snapshotId: string }>;  // cloud only
}
```

Tools depend on `Sandbox`, not `fs` or `child_process` directly. Swapping backends does not require rewriting tools.

### Backend comparison

| | local | just-bash | cloud |
|--|-------|-----------|-------|
| **Cost** | Free | Free | Per-minute |
| **Latency** | Microseconds | Microseconds | Network round-trip per call |
| **Isolation** | None | Partial (CoW overlay) | Full remote VM |
| **Persistence** | Permanent | In-memory until stop | Until timeout / snapshot |
| **`expiresAt`** | — | — | Yes |
| **`snapshot`** | — | — | Yes |
| **Env** | `SANDBOX=local` (default) | `SANDBOX=just-bash` | `SANDBOX=cloud` |

### Local backend (`sandbox-local.ts`)

| Method | Implementation |
|--------|----------------|
| `readFile` | `readFileSync(resolve(dir, path))` |
| `exec` | `spawn` + `Promise` (non-blocking, streaming) |

**`execSpawn` highlights:**

- `stdio: ["ignore", "pipe", "pipe"]` — no stdin; capture stdout/stderr as streams
- 30s timeout → `child.kill()`, exit code `124`
- `onStdout` callback — stream chunks live to terminal via `process.stderr.write`
- Resolves with `{ stdout, exitCode }` — never throws on command failure

**Why `spawn` over `execSync`?**

| `execSync` | `spawn` + Promise |
|------------|-------------------|
| Blocks entire Node process | Non-blocking |
| All output at end | Chunked streaming via `onStdout` |
| Throws on failure | Returns `{ stdout, exitCode }` |
| Tied to real shell | Fits sandbox interface |

### just-bash backend (`sandbox-just-bash.ts`)

| Method | Implementation |
|--------|----------------|
| `readFile` | `jb.readFile(\`/home/user/project/${path}\`)` |
| `exec` | `jb.runCommand({ cmd, cwd: MOUNT, detached: true })` |
| `stop` | `jb.stop()` |

**Mount point:** `overlayRoot` mounts at `/home/user/project`, not at the real path.

**Copy-on-write:** Reads from real disk; writes stay in memory and disappear when sandbox stops.

### Cloud backend (`sandbox-cloud.ts`)

Thin **adapter** over `@vercel/sandbox`. Same `Sandbox` shape; methods make network calls.

| Method | Implementation |
|--------|----------------|
| `readFile` | `vm.fs.readFile(workspacePath(p), "utf8")` |
| `exec` | `vm.runCommand({ cmd: "bash", args: ["-c", command], cwd })` |
| `stop` | `vm.stop()` |
| `snapshot` | `vm.snapshot()` → `{ snapshotId }` |
| `expiresAt` | From VM session deadline |

**Workspace:** `/vercel/sandbox` (Vercel Sandbox default cwd).

**On create:** VM starts empty. Seed via `afterStart` hook (git clone, `writeFiles`, `npm install`) — not inside the factory. See [Lesson 4.5 lifecycle hooks](https://vercel.com/academy/build-ai-agent-harness/lifecycle-hooks).

**Restore:** `VERCEL_SNAPSHOT_ID` → `source: { type: "snapshot", snapshotId }`.

**Auth:** `vercel link` + `vercel env pull`, or `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` / `VERCEL_TOKEN`.

### Lifecycle hooks

| Hook | When | Typical use |
|------|------|-------------|
| `afterStart` | After VM/sandbox created (`sandbox-cloud.ts`) | Git clone, install deps, seed files |
| `beforeStop` | `shutdownSandbox()` in `finally` | Upload artifacts, log cleanup |
| `onTimeout` | Not wired yet | Snapshot before VM dies (Module 7) |

---

## Tools (`src/tools.ts`)

| Tool | Sandbox API | Purpose |
|------|-------------|---------|
| `read` | `readFile` | Read a known file; numbered lines; 500-line cap |
| `grep` | `exec` | Regex search via `grep -rn`; 50-match cap |
| `bash` | `exec` | Run shell commands; approval gate |

Tool **descriptions** are prompts for the model — they route behavior (e.g. read vs grep vs bash).

### Bash streaming

```ts
await sandbox.exec(command, {
  onStdout: (chunk) => process.stderr.write(chunk),
});
```

- `onStdout` — live preview of command output (not errors; normal stdout)
- `process.stderr` — side channel so live output does not mix with the agent's final answer on stdout
- Full output still collected and returned as the tool result

### Approval (`index.ts`)

`bash` is gated by `createApproval({ mode: "interactive" })`:

- Safe prefixes (`ls`, `git status`, etc.) → allowed
- Other commands → blocked with a string message (model must report honestly)

Modes: `interactive` | `background` | `delegated`

---

## System prompt (`src/system.ts`)

Sections:

1. **Role** — working directory, sandbox type
2. **Agency** — use tools, don't just explain
3. **Guardrails** — minimal changes, search before creating
4. **Verification** — run typecheck/tests when applicable; honest reporting
5. **AGENTS.md** — optional project-specific instructions

---

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API authentication |
| `OPENAI_MODEL` | Optional model override (default: `gpt-4o-mini`) |
| `SANDBOX` | `local` (default), `just-bash`, or `cloud` |
| `VERCEL_SNAPSHOT_ID` | Optional cloud snapshot restore |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-08 | Synced `AGENTS.md` and `IMPLEMENTATION_GUIDE.md` with cloud sandbox, CLI refactor, lifecycle hooks |
| 2026-07-13 | Refactored `index.ts`: `main()`, `runAgent`, `shutdownSandbox`; design patterns docs |
| 2026-07-13 | Simplified cloud sandbox adapter; lifecycle hooks for cloud |
| 2026-07-13 | Added cloud sandbox backend (@vercel/sandbox) |
| 2026-07-13 | Added just-bash in-memory sandbox backend |
| 2026-07-12 | Initial doc: CLI flow, agent loop, sandbox, tools, example trace |

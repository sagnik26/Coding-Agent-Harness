# Architecture

Living document for **Coding-Agent-Harness** (TeensyCode). Update this as modules are added.

---

## Overview

A TypeScript coding agent harness built on the [Vercel AI SDK](https://sdk.vercel.ai) `ToolLoopAgent`. The agent receives a natural-language prompt, decides which tools to call, executes them against a **sandbox** (filesystem + shell), and returns a final answer.

| Layer | Role |
|-------|------|
| **CLI** (`index.ts`) | Parse args, wire sandbox + tools + agent, print output |
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
    ├── sandbox-just-bash.ts # In-memory overlay (just-bash)
    ├── tools.ts          # Tool factories (read, grep, bash)
    └── system.ts         # buildSystemPrompt()
```

**Planned** (see `IMPLEMENTATION_GUIDE.md`): `approval.ts`, `skills.ts`, subagents, context pruning, streaming CLI.

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
                                          ┌─────────────────┐
                                          │ Sandbox (local) │
                                          │ readFile / exec │
                                          └────────┬────────┘
                                                   ▼
                                          ┌─────────────────┐
                                          │ Real filesystem │
                                          │ + child_process │
                                          └─────────────────┘
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

### Phase 1 — Boot (`index.ts`)

| Step | Code | Effect |
|------|------|--------|
| Load env | `import "dotenv/config"` | `OPENAI_API_KEY`, optional `OPENAI_MODEL` |
| Resolve cwd | `process.argv[2] \|\| process.cwd()` | Working directory = `.` |
| Create sandbox | `createLocalSandbox(cwd)` | Local disk backend |
| Create tools | `createReadTool`, `createGrepTool`, `createBashTool` | Register tool definitions + executors |
| Build prompt | `buildSystemPrompt(...)` | Agency, guardrails, tool list, `AGENTS.md` |
| Create agent | `new ToolLoopAgent({ model, instructions, tools, stopWhen })` | Agent loop, max 10 steps |
| Run | `agent.generate({ prompt })` | Start the loop |

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
interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
}
```

Tools depend on `Sandbox`, not `fs` or `child_process` directly. Swapping `createLocalSandbox` for `createJustBashSandbox` does not require rewriting tools.

### just-bash backend (`sandbox-just-bash.ts`)

| Method | Implementation |
|--------|----------------|
| `readFile` | `jb.readFile(\`/home/user/project/${path}\`)` |
| `exec` | `jb.runCommand({ cmd, cwd: MOUNT, detached: true })` |
| `stop` | `jb.stop()` |

**Mount point:** `overlayRoot` mounts at `/home/user/project`, not at the real path. All virtual paths go through `MOUNT`.

**Copy-on-write:** Reads from real disk; writes stay in memory and disappear when sandbox stops.

**Switch:** `SANDBOX=just-bash pnpm start . "prompt"`

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
| `SANDBOX` | `local` (default) or `just-bash` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-13 | Added just-bash in-memory sandbox backend |
| 2026-07-12 | Initial doc: CLI flow, agent loop, sandbox, tools, example trace |

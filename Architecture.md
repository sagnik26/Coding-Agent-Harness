# Architecture

Living document for **Coding-Agent-Harness** (TeensyCode). Update this as modules are added.

---

## Overview

A TypeScript coding agent harness built on the [Vercel AI SDK](https://sdk.vercel.ai) `ToolLoopAgent`. The agent receives a natural-language prompt, decides which tools to call, executes them against a **sandbox** (filesystem + shell), and returns a final answer.

| Layer | Role |
|-------|------|
| **CLI** (`apps/index.ts` → `packages/cli`) | Thin entry calls `main()` — factory wiring, agent run, guaranteed sandbox shutdown |
| **Agent loop** | `ToolLoopAgent` — model thinks, calls tools, repeats until done |
| **Tools** (`packages/tools`) | `read`, `grep`, `bash`, `task`, `askUser`, `todo` — what the model can do |
| **Sandbox** (`packages/sandbox`) | Abstraction over filesystem + command execution |
| **Core** (`packages/core`) | Sandbox interface, approval, verification, system prompt, cache |

---

## Project structure

pnpm workspace (`pnpm-workspace.yaml`): `@coding-agent-harness/{core,sandbox,tools,cli}`, thin entry `apps/index.ts`, eval `@coding-agent-harness/eval`.

```
Coding-Agent-Harness/
├── Architecture.md       # This file
├── IMPLEMENTATION_GUIDE.md
├── AGENTS.md             # Optional per-project instructions (if present)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   └── index.ts          # Thin entry — import { main } from @coding-agent-harness/cli
├── packages/
│   ├── core/             # sandbox interface, approval, verification, system, cache
│   ├── sandbox/          # local / cloud, chaos, lifecycle
│   ├── tools/            # tool factories
│   └── cli/              # main(), createSandbox, agent wiring
└── eval/                 # @coding-agent-harness/eval — behavioral eval suite
```

Packages export source via `package.json` `exports` (e.g. `@coding-agent-harness/cli`, `@coding-agent-harness/tools/tools`, `@coding-agent-harness/core/cache`).

**Planned** (see `IMPLEMENTATION_GUIDE.md`): write/edit tools, skills, streaming CLI, Module 11 event-based approval.

---

## Design patterns

| Pattern | Where | What it does |
|---------|-------|--------------|
| **Strategy** | `Sandbox` interface + local/cloud backends | Same `readFile` / `exec` API; swap local or cloud via `SANDBOX` |
| **Factory** | `createSandbox`, `createReadTool`, `createApproval`, etc. | Centralized construction; callers don't build concrete implementations |
| **Adapter** | `sandbox-cloud.ts` | Wraps `@vercel/sandbox` VM API behind your `Sandbox` interface |
| **Dependency injection** | `createReadTool(sandbox)`, `createBashTool(sandbox, needsApproval)` | Tools receive dependencies; they don't pick a backend |
| **Lifecycle hooks** | `SandboxLifecycleHooks` | `afterStart` / `beforeStop` / `onTimeout` — cloud setup and teardown |
| **Discriminated union** | `ApprovalConfig` | Type-safe approval modes: `interactive` \| `background` \| `delegated` |

**Approval layers (Module 8.2):** The **config** layer (`packages/core/src/approval.ts`) answers *who decides* for a session. A future **event** layer (Module 11) answers *what policies apply* — e.g. block writes to `.env` regardless of mode. They combine for defense in depth; events are not implemented yet.

```
Factory (createSandbox)
    → Strategy (local | cloud)
        → Adapter (cloud only: VercelSandbox → Sandbox)
            → Tools (read, grep, bash, task, askUser) via DI
                → ToolLoopAgent
```

---

## CLI structure (`packages/cli/src/index.ts`)

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
                    ▼                                                 ▼
             ┌────────────┐                                  ┌────────────┐
             │   local    │                                  │   cloud    │
             │ spawn + fs │                                  │ remote VM  │
             └────────────┘                                  └────────────┘
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
| Create sandbox | `createSandbox(SANDBOX, cwd)` | Factory picks local / cloud |
| Create tools | `createReadTool`, `createGrepTool`, `createBashTool`, `createAskUserTool`, `createTaskTool` | Inject `sandbox` + approval policy |
| Build prompt | `buildSystemPrompt(...)` | Agency, guardrails, ambiguity protocol, tool list, `AGENTS.md` |
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
| `onStepFinish` | token usage log | Lesson 5.1 — measure context growth |
| `prepareCall` | `pruneMessages(...)` | Lesson 5.2 — drop old tool results |
| Invoke | `agent.generate({ prompt })` | Not `agent.generate(prompt)` |

Each **step** is one model turn. A step may include zero or more tool calls, then the model sees tool results on the next step.

---

## Context management

Every step re-sends the full message history (system prompt + all prior tool calls/results). Input tokens grow linearly; output stays roughly flat. On long tasks this pollutes attention and can overflow the context window.

### Lesson 5.1 — Measure (`onStepFinish`)

```ts
onStepFinish: ({ usage, stepNumber }) => {
  console.error(
    `Step ${stepNumber}: ${usage.inputTokens} input, ${usage.outputTokens} output`,
  );
},
```

- Logs to **stderr** so telemetry does not mix with the agent answer on stdout
- Telemetry first — fix (prune / caps / cache) comes in Lessons 5.2–5.4

**Observe the curve:**

```bash
pnpm start . "Read package.json, then tsconfig.json, then index.ts, then summarize everything"
```

Expect input tokens to climb each step; output stays relatively small.

| Component | Behavior |
|-----------|----------|
| System prompt | Fixed cost every step |
| Each tool result | Stays in history forever until pruned |
| After many tool calls | Linear accumulation |

### Lesson 5.2 — Prune old tool results

```ts
prepareCall: async (options) => ({
  ...options, // CRITICAL: spread first
  messages: options.messages
    ? pruneMessages({
        messages: options.messages,
        toolCalls: "before-last-3-messages",
      })
    : undefined,
}),
```

- Runs **before every model call**; strips tool call/result pairs older than the last 3 messages
- Original user prompt and recent tool turns are kept
- Guard `messages` — first call may only have `prompt` (`messages` is `undefined`)
- With pruning, input tokens **plateau** instead of climbing forever

### Lesson 5.3 — Bounded tool output

| Tool | Cap | Notes |
|------|-----|-------|
| `read` | 500 lines | `offset` / `limit` for pagination |
| `grep` | 50 matches | Total count in truncation suffix |
| `bash` | 5,000 chars | Tail kept (errors/build failures usually at end) |

### Lesson 5.4 — Cache control (`src/cache.ts`)

```ts
prepareCall: async (options) => {
  const pruned = options.messages
    ? pruneMessages({ messages: options.messages, toolCalls: "before-last-3-messages" })
    : undefined;
  return {
    ...options,
    messages: pruned ? addCacheControl(pruned) : undefined, // Anthropic message markers
    providerOptions: { ...options.providerOptions, ...openaiCacheProviderOptions() },
  };
},
```

| Provider | Mechanism |
|----------|-----------|
| **Anthropic** | `addCacheControl` — `providerOptions.anthropic.cacheControl` on stable messages |
| **OpenAI** | `openaiCacheProviderOptions()` — request `promptCacheKey` + `promptCacheRetention` |

OpenAI notes:
- Caching is mostly automatic for `gpt-4o`+ once the prompt prefix is **≥ ~1024 tokens**
- `promptCacheKey` improves cache hit routing; it does not reduce the logged `input` count
- Watch `cached` (`inputTokenDetails.cacheReadTokens`) — savings show there (cheaper billed tokens), not as lower `input`
- Short prompts remain at `0 cached` by design

`onStepFinish` logs `inputTokenDetails.cacheReadTokens` when the provider reports them.

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

### Chaos mode (Module 7)

`wrapWithChaos` (`packages/sandbox/src/chaos.ts`) injects one random failure per session when `CHAOS=1` (or `--chaos`) is set:

| Mode | Failure |
|------|---------|
| `kill-mid-command` | First `exec` → exit 137 |
| `stale-handle` | First `exec` returns garbage |
| `state-divergence` | `getStatus` reports `hibernated` |
| `skip-status` | `getStatus` returns a stale `active` |

### Backend comparison

| | local | cloud |
|--|-------|-------|
| **Cost** | Free | Per-minute |
| **Latency** | Microseconds | Network round-trip per call |
| **Isolation** | None | Full remote VM |
| **Persistence** | Permanent | Until timeout / snapshot |
| **`expiresAt`** | — | Yes |
| **`snapshot`** | — | Yes |
| **Env** | `SANDBOX=local` (default) | `SANDBOX=cloud` |

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

## Tools (`packages/tools/src/tools.ts`)

| Tool | Sandbox API | Purpose |
|------|-------------|---------|
| `read` | `readFile` | Read a known file; numbered lines; 500-line cap |
| `grep` | `exec` | Regex search via `grep -rn`; 50-match cap |
| `bash` | `exec` | Run shell commands; approval gate; 5,000-char stdout cap (tail kept) |
| `todo` | (in-memory) | Multi-step task list; single `in_progress` constraint |

Tool **descriptions** are prompts for the model — they route behavior (e.g. read vs grep vs bash).

### Output caps (Lesson 5.3 — Tool Output Design)

| Tool | Cap | Truncation signal |
|------|-----|-------------------|
| `read` | 500 lines | `... (truncated at 500 lines)` + `offset`/`limit` pagination |
| `grep` | 50 matches | `... (N total, showing first 50)` |
| `bash` | 5,000 chars | Keep **tail**; `... (truncated, showing last 5000 chars)` |

Prevention beats cleanup: prune (5.2) removes old results; caps stop a single result from flooding context.

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

## System prompt (`packages/core/src/system.ts`)

Sections:

1. **Role** — working directory, sandbox type
2. **Agency** — use tools, grep-first exploration, don't just explain
3. **Guardrails** — minimal changes, search before creating
4. **Verification** — discovered gates from `package.json`; scoped honest reporting
5. **AGENTS.md** — optional project-specific instructions

---

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API authentication |
| `OPENAI_MODEL` | Optional model override (default: `gpt-4o-mini`) |
| `SANDBOX` | `local` (default) or `cloud` |
| `VERCEL_SNAPSHOT_ID` | Optional cloud snapshot restore |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-18 | Module 7: simple `--chaos` wrapper (`src/chaos.ts`) |
| 2026-07-14 | Lesson 5.4: `addCacheControl` after prune in `prepareCall` |
| 2026-07-14 | Lesson 5.3: bash stdout capped at 5k chars (tail-keep) |
| 2026-07-14 | Lesson 5.2: `pruneMessages` in `prepareCall` |
| 2026-07-14 | Lesson 5.1: `onStepFinish` token telemetry; context management section |
| 2026-07-08 | Synced `AGENTS.md` and `IMPLEMENTATION_GUIDE.md` with cloud sandbox, CLI refactor, lifecycle hooks |
| 2026-07-13 | Refactored `index.ts`: `main()`, `runAgent`, `shutdownSandbox`; design patterns docs |
| 2026-07-13 | Simplified cloud sandbox adapter; lifecycle hooks for cloud |
| 2026-07-21 | Removed just-bash sandbox backend |
| 2026-07-13 | Added cloud sandbox backend (@vercel/sandbox) |
| 2026-07-12 | Initial doc: CLI flow, agent loop, sandbox, tools, example trace |

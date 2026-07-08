# TeensyCode: Step-by-Step Implementation Guide

A practical build guide for [Vercel Academy's Build Your Own AI Coding Agent Harness](https://vercel.com/academy/build-ai-agent-harness) course. You will build **TeensyCode** — a TypeScript coding agent harness with tools, safety gates, sandbox backends, context management, and subagent delegation.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Project Setup](#project-setup)
4. [Target Architecture](#target-architecture)
5. [Module 1: The Agent Loop](#module-1-the-agent-loop)
6. [Module 2: Tool Design](#module-2-tool-design)
7. [Module 3: The System Prompt](#module-3-the-system-prompt)
8. [Module 4: Sandbox Abstraction](#module-4-sandbox-abstraction)
9. [Module 5: Context Management](#module-5-context-management)
10. [Module 6: Subagent Delegation](#module-6-subagent-delegation)
11. [Module 7: Sandbox Lifecycle (Concept)](#module-7-sandbox-lifecycle-concept)
12. [Module 8: Human-in-the-Loop](#module-8-human-in-the-loop)
13. [Module 9: Planning and Verification](#module-9-planning-and-verification)
14. [Module 10: Surfaces](#module-10-surfaces)
15. [Module 11: Extensibility](#module-11-extensibility)
16. [Capstone](#capstone)
17. [Verification Checklist](#verification-checklist)
18. [Course Links](#course-links)

---



## Overview



### What you are building


| Component         | Description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| **Agent loop**    | `ToolLoopAgent` with `read`, `grep`, `write`, `edit`, `bash`, `task`, `askUser`, `todo` |
| **Safety**        | Execute-level gates → configurable approval (`interactive`, `background`, `delegated`)  |
| **Prompts**       | Structured system prompt + `AGENTS.md` injection                                        |
| **Sandbox**       | One `Sandbox` interface; `local`, `just-bash`, and (conceptually) cloud backends        |
| **Context**       | `pruneMessages`, bounded tool output, cache control                                     |
| **Subagents**     | Explorer (read-only, Haiku) and Executor (full tools, Sonnet) via `task` tool           |
| **Extensibility** | Skills, custom tools, lifecycle events                                                  |




### Tech stack


| Package                                              | Purpose                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| [AI SDK v6](https://sdk.vercel.ai)                   | `ToolLoopAgent`, `tool()`, `stepCountIs`, `pruneMessages`          |
| [AI Gateway](https://vercel.com/ai-gateway)          | Model routing via string IDs (e.g. `"anthropic/claude-haiku-4-5"`) |
| [just-bash](https://www.npmjs.com/package/just-bash) | In-memory copy-on-write filesystem                                 |
| [Zod v3](https://zod.dev)                            | Tool input schemas (v4 breaks AI SDK v6 types)                     |
| Node.js 20+ with pnpm                                | Runtime and package manager                                        |




### How to use this guide

- **Modules 1–6**: Build along — write code, run, verify after each step.
- **Module 7**: Read and design — no local demo for durable workflows.
- **Modules 8–11**: Mix of building and architecture.

Each step lists **outcome**, **files to create/edit**, **verify commands**, and **done-when** criteria.

---



## Prerequisites

```bash
# Required
export AI_GATEWAY_API_KEY="your-key-here"   # from Vercel AI Gateway

# Recommended
node --version   # 20+
pnpm --version   # 9+
```

- TypeScript, async/await, basic terminal experience
- Optional precursor: [Building Filesystem Agents](https://vercel.com/academy/filesystem-agents)

---



## Project Setup



### Step 0.1 — Initialize the project

```bash
mkdir teensycode && cd teensycode
pnpm init
pnpm add ai zod                # AI SDK + Zod v3
pnpm add -D typescript @types/node tsx
```

Add scripts to `package.json` (Node needs `tsx` to run `.ts` files directly):

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

> **Note:** The Vercel course uses `bun run index.ts` because Bun runs TypeScript natively. With pnpm, use `pnpm start` followed by your args (see verify commands below).



### Step 0.2 — TypeScript config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["index.ts", "src/**/*"]
}
```



### Step 0.3 — Environment

Create `.env` (do not commit):

```
AI_GATEWAY_API_KEY=your-key-here
```



### Step 0.4 — Verify setup

```bash
pnpm typecheck
```

**Done when:** Project compiles with zero errors.

---



## Target Architecture

Final layout after all modules:

```
teensycode/
├── index.ts                 # CLI entry point
├── package.json
├── tsconfig.json
├── AGENTS.md                # Optional per-project instructions
├── skills/                  # Optional skill definitions
│   └── auth-patterns/
│       └── SKILL.md
└── src/
    ├── sandbox.ts           # Sandbox interface
    ├── sandbox-local.ts     # Node fs + child_process
    ├── sandbox-just-bash.ts # In-memory overlay
    ├── approval.ts          # ApprovalConfig discriminated union
    ├── system.ts            # buildSystemPrompt()
    ├── tools.ts             # All tool factories
    ├── skills.ts            # Skill discovery
    ├── verification.ts      # Gate discovery (typecheck, lint, test)
    └── cache.ts             # Cache control headers
```

---



## Module 1: The Agent Loop

> Course: [From Chat to Agent](https://vercel.com/academy/build-ai-agent-harness/from-chat-to-agent) · [Your First Tools](https://vercel.com/academy/build-ai-agent-harness/your-first-tools) · [Completing the Toolbox](https://vercel.com/academy/build-ai-agent-harness/completing-the-toolbox)



### Lesson 1.1 — From chat to agent (`read` tool)

**Outcome:** A `ToolLoopAgent` that reads files via a `read` tool.

**Create** `index.ts`**:**

1. Import `ToolLoopAgent`, `stepCountIs`, `tool` from `"ai"` and `z` from `"zod"`.
2. Parse `cwd` from `process.argv[2]` (default: `process.cwd()`).
3. Start with **no tools** — observe the chatbot explain instead of act.
4. Add `read` tool:
  - Input: `path`, optional `offset`, optional `limit`
  - Resolve paths against `cwd` (prevent path traversal)
  - Number lines; cap at **500 lines** with truncation message
  - Description: include `WHEN TO USE` / `WHEN NOT TO USE`

**AI SDK v6 naming (critical):**


| Use                          | Not                      |
| ---------------------------- | ------------------------ |
| `instructions`               | `system`                 |
| `stopWhen: stepCountIs(10)`  | `stopCondition`          |
| `agent.generate({ prompt })` | `agent.generate(prompt)` |


**Verify:**

```bash
# Chatbot (1 step, no tool call)
pnpm start . "What files are in this project?"

# Agent (2+ steps, calls read)
pnpm start . "Read the tsconfig.json"

pnpm typecheck
```

**Done when:**

- [ ] Chatbot version returns in 1 step with no tool calls
- [ ] Agent version calls `read` and reports file contents
- [ ] Output truncates at 500 lines

---



### Lesson 1.2 — Add `grep` tool

**Outcome:** Agent searches code with `grep`; descriptions route between `read` and `grep`.

**Add** `grep` **tool:**

- Input: `pattern` (regex), optional `path`, optional `glob`
- Use `execSync` with `grep -rn`, exclude `node_modules` and `.git`
- Cap at **50 matches**; report total when truncated
- Treat exit code 1 (no matches) as success, not error
- Quote shell inputs to handle special characters

**Description contract (4 sections minimum):**

```
WHEN TO USE: ...
WHEN NOT TO USE: ...
DO NOT USE FOR: ...
EXAMPLES: ...
```

**Verify:**

```bash
pnpm start . "Find all TODO comments in this project"   # → grep
pnpm start . "Read the tsconfig.json"                  # → read
```

**Done when:**

- [ ] Search prompts route to `grep`
- [ ] File-read prompts route to `read`
- [ ] `grep` caps at 50 matches

---



### Lesson 1.3 — Add `bash` with safety gate

**Outcome:** Shell execution gated by a safe-command allowlist.

**Add** `bash` **tool:**

```ts
const SAFE_PREFIXES = [
  "ls", "cat", "echo", "pwd", "which", "find",
  "head", "tail", "wc", "git log", "git status", "git diff",
];

function isSafe(command: string): boolean {
  return SAFE_PREFIXES.some((p) => command.trim().startsWith(p));
}
```

- Match by **prefix** (`ls -la` matches `ls`)
- Set `timeout: 30_000` on `execSync`
- Blocked commands return a **string** (not silent failure)
- Do **not** use `needsApproval` without a handler — the model will confabulate success

**Verify:**

```bash
pnpm start . "List all files in this directory"        # → bash (safe)
pnpm start . "Run the command: rm -rf node_modules"    # → blocked message
```

**Done when:**

- [ ] Safe commands run; dangerous commands return block message
- [ ] Model reports blocks honestly (no fake success)

**Commit:** `feat(agent): add ToolLoopAgent with read, grep, bash tools`

---



## Module 2: Tool Design

> Course: [Descriptions That Work](https://vercel.com/academy/build-ai-agent-harness/descriptions-that-work) · [Shell Execution with Safety](https://vercel.com/academy/build-ai-agent-harness/shell-execution-with-safety) · [Approval Gates](https://vercel.com/academy/build-ai-agent-harness/approval-gates)



### Lesson 2.1 — 5-section description contract

**Expand every tool description to:**


| Section         | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| First line      | What it does + output format                                 |
| WHEN TO USE     | 2–4 scenarios with keywords                                  |
| WHEN NOT TO USE | Soft redirect to other tools                                 |
| DO NOT USE FOR  | Hard boundaries (repeat negatives — counters "bash gravity") |
| USAGE           | Caps, defaults, encoding                                     |
| EXAMPLES        | 2–3 concrete invocations                                     |


**Verify:** One prompt per tool shape routes correctly.

---



### Lesson 2.2 — Factory pattern for bash

**Outcome:** `createBashTool(operations, approval)` separates contract from execution.

**Create** `src/approval.ts` **(stub) and update tools:**

```ts
interface BashOperations {
  exec(command: string): Promise<{ stdout: string; exitCode: number }>;
}

function createBashTool(
  operations: BashOperations,
  needsApproval: (input: { command: string }) => boolean,
) { /* ... */ }
```

**Local backend:**

```ts
const localOps: BashOperations = {
  exec: async (command) => {
    try {
      const stdout = execSync(command, { cwd, encoding: "utf-8", timeout: 30_000 });
      return { stdout, exitCode: 0 };
    } catch (e: any) {
      return { stdout: e.stdout || e.stderr || e.message || "", exitCode: e.status ?? 1 };
    }
  },
};
```

**Why:** Module 4 swaps `localOps` for `sandbox.exec` without rewriting the tool.

---



### Lesson 2.3 — Approval gates (discriminated union)

**Outcome:** Three approval modes via config, not hardcoded logic.

```ts
type ApprovalConfig =
  | { mode: "interactive" }                    // safe-prefix auto-approve; rest blocked
  | { mode: "background" }                     // auto-approve everything (CI)
  | { mode: "delegated"; trust: string[] };    // subagent inherits trust slice

function createApproval(config: ApprovalConfig) {
  return ({ command }: { command: string }) => {
    if (config.mode === "background") return false;
    if (config.mode === "delegated") {
      return !config.trust.some((p) => command.trim().startsWith(p));
    }
    return !SAFE_PREFIXES.some((p) => command.trim().startsWith(p));
  };
}
```

**Usage:**

```ts
const bash = createBashTool(localOps, createApproval({ mode: "interactive" }));
```

**Done when:**

- [ ] Each mode behaves differently for safe vs unsafe commands
- [ ] Config is data (serializable, loadable from `AGENTS.md` later)

**Commit:** `feat(approval): discriminated union config with three modes`

---



## Module 3: The System Prompt

> Course: [Structuring Agent Instructions](https://vercel.com/academy/build-ai-agent-harness/structuring-agent-instructions) · [Dynamic Prompt Construction](https://vercel.com/academy/build-ai-agent-harness/dynamic-prompt-construction) · [Verification Gates](https://vercel.com/academy/build-ai-agent-harness/verification-gates) · [Project Context](https://vercel.com/academy/build-ai-agent-harness/project-context)



### Lesson 3.1 — Structured instructions

**Replace** `You are a coding agent.` **with:**

```ts
instructions: `You are a coding agent working in: ${cwd}

# Agency
- USE your tools. Read files, search code, run commands, then answer.
- Do NOT explain what you WOULD do. Actually do it.
- Prefer grep for searching, read for viewing files.
- Use bash only for commands that aren't covered by other tools.

# Guardrails
- Prefer simple, minimal changes
- Search before creating, and reuse existing patterns
- No new dependencies without asking`
```

---



### Lesson 3.2 — Dynamic prompt builder

**Create** `src/system.ts`**:**

```ts
export interface PromptContext {
  workingDirectory: string;
  sandboxType: string;
  toolNames: string[];
  gitBranch?: string;
  projectContext?: string;
  skills?: { name: string; description: string }[];
  verificationCommands?: string[];
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];
  sections.push(`You are a coding agent working in: ${ctx.workingDirectory}`);
  sections.push(`Sandbox: ${ctx.sandboxType}`);
  // ... Agency, Guardrails, optional sections
  if (ctx.projectContext) {
    sections.push(`\n# Project Instructions (from AGENTS.md)\n${ctx.projectContext}`);
  }
  return sections.join("\n");
}
```

**Wire in** `index.ts`**:** `instructions: buildSystemPrompt({ ... })`

---



### Lesson 3.3 — Verification gates (add to prompt)

Add a verification contract section telling the agent to run discovered commands before claiming success:

- typecheck → lint → test → build (when available)
- Scope claims to what was actually verified

**Create** `src/verification.ts` to discover gates from `package.json` scripts.

---



### Lesson 3.4 — `AGENTS.md` injection

```ts
const agentsPath = join(cwd, "AGENTS.md");
const projectContext = existsSync(agentsPath)
  ? readFileSync(agentsPath, "utf-8")
  : undefined;
```

**Example** `AGENTS.md`**:**

```markdown
# Project Instructions

## Commands
- `pnpm test` runs the test suite
- `pnpm run build` builds for production

## Style
- Named exports, not default
```

**Verify:** Agent answers `pnpm test` when file says so; guesses `npm test` when file is absent.

**Commit:** `refactor(prompt): extract buildSystemPrompt with AGENTS.md injection`

---



## Module 4: Sandbox Abstraction

> Course: [Designing the Interface](https://vercel.com/academy/build-ai-agent-harness/designing-the-interface) · [Local Implementation](https://vercel.com/academy/build-ai-agent-harness/local-implementation) · [In-Memory Implementation](https://vercel.com/academy/build-ai-agent-harness/in-memory-implementation) · [Cloud Implementation](https://vercel.com/academy/build-ai-agent-harness/cloud-implementation) · [Lifecycle Hooks](https://vercel.com/academy/build-ai-agent-harness/lifecycle-hooks)



### Lesson 4.1 — Sandbox interface

**Create** `src/sandbox.ts`**:**

```ts
export interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  exec(command: string): Promise<{ stdout: string; exitCode: number }>;
  stop(): Promise<void>;
  expiresAt?: number;
  snapshot?(): Promise<{ snapshotId: string }>;
}
```

**Refactor tools** to accept `Sandbox` and call `sandbox.readFile` / `sandbox.exec`. Remove direct `readFileSync` / `execSync` from tools.

---



### Lesson 4.2 — Local implementation

**Create** `src/sandbox-local.ts`**:**

```ts
export function createLocalSandbox(dir: string): Sandbox {
  return {
    type: "local",
    workingDirectory: dir,
    readFile: async (p) => readFileSync(resolve(dir, p), "utf-8"),
    exec: async (command) => { /* execSync wrapper, never throws */ },
    stop: async () => {},
  };
}
```

**Wire:**

```ts
const sandbox = createLocalSandbox(cwd);
const tools = {
  read: createReadTool(sandbox),
  grep: createGrepTool(sandbox),
  bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
};
```

**Verify:** Same behavior as Module 3 on all three test prompts.

---



### Lesson 4.3 — In-memory implementation (just-bash)

```bash
pnpm add just-bash
```

**Create** `src/sandbox-just-bash.ts`**:**

```ts
const MOUNT = "/home/user/project";  // CRITICAL: not the overlay root path

export async function createJustBashSandbox(dir: string): Promise<Sandbox> {
  const jb = await JustBashSandbox.create({ overlayRoot: dir });
  return {
    type: "just-bash",
    readFile: async (p) => jb.readFile(`${MOUNT}/${p}`),
    exec: async (command) => {
      const cmd = await jb.runCommand(command, { cwd: MOUNT });
      const finished = await cmd.wait();
      return { stdout: await cmd.output(), exitCode: finished.exitCode };
    },
    stop: async () => {},
  };
}
```

**Switch backend:**

```ts
// Or use CLI flag: pnpm start -- --sandbox=just-bash . "..."
const sandbox = process.env.SANDBOX === "just-bash"
  ? await createJustBashSandbox(cwd)
  : createLocalSandbox(cwd);
```

**Verify:** Write task on `just-bash` does not touch real disk.

---



### Lesson 4.4 — Cloud implementation (concept)

[Vercel Sandbox](https://vercel.com/academy/vercel-sandbox) provides remote VMs with real filesystems, git, npm. Tradeoffs:


|             | Local | just-bash      | Cloud              |
| ----------- | ----- | -------------- | ------------------ |
| Safety      | Low   | High (CoW)     | High (isolated VM) |
| Cost        | Free  | Free           | Per-minute         |
| Latency     | None  | Low            | Network round-trip |
| Persistence | Yes   | No (in-memory) | Until timeout      |


---



### Lesson 4.5 — Lifecycle hooks

Optional hooks on sandbox creation:

- `afterStart` — clone repo, install deps
- `beforeStop` — auto-commit WIP, upload artifacts
- `onTimeout` — snapshot before VM dies

These map to event bus `session_start` / `session_shutdown` in Module 11.

**Commit:** `feat(sandbox): local and just-bash backends behind Sandbox interface`

---



## Module 5: Context Management

> Course: [The Problem](https://vercel.com/academy/build-ai-agent-harness/the-problem) · [Pruning Old Results](https://vercel.com/academy/build-ai-agent-harness/pruning-old-results) · [Tool Output Design](https://vercel.com/academy/build-ai-agent-harness/tool-output-design) · [Cache Control](https://vercel.com/academy/build-ai-agent-harness/cache-control)



### Lesson 5.1 — Measure the problem

Add token logging:

```ts
onStepFinish: ({ usage, stepNumber }) => {
  console.error(`Step ${stepNumber}: ${usage.inputTokens} input, ${usage.outputTokens} output`);
},
```

Run a multi-step task and observe linear input token growth.

---



### Lesson 5.2 — Prune old tool results

```ts
import { pruneMessages } from "ai";

prepareCall: async (options) => ({
  ...options,  // CRITICAL: spread first
  messages: options.messages
    ? pruneMessages({
        messages: options.messages,
        toolCalls: "before-last-3-messages",
      })
    : undefined,
}),
```

**Gotchas:**

- Spread `...options` first or you lose `model`, `tools`, `system`
- Guard `messages` on first call (undefined)

---



### Lesson 5.3 — Bounded tool output (prevention)

Apply caps at the tool level (already done):


| Tool        | Cap        |
| ----------- | ---------- |
| `read`      | 500 lines  |
| `grep`      | 50 matches |
| `loadSkill` | 4000 chars |


Prevention beats cleanup.

---



### Lesson 5.4 — Cache control

**Create** `src/cache.ts` — add provider cache headers to pruned messages when supported (reduces repeated input costs).

**Commit:** `feat(context): prune old tool results in prepareCall`

---



## Module 6: Subagent Delegation

> Course: [Why Delegate](https://vercel.com/academy/build-ai-agent-harness/why-delegate) · [Explorer Subagent](https://vercel.com/academy/build-ai-agent-harness/explorer-subagent) · [Executor Subagent](https://vercel.com/academy/build-ai-agent-harness/executor-subagent) · [Task Tool](https://vercel.com/academy/build-ai-agent-harness/task-tool)



### Why delegate

Single-agent failure modes:

- Context pollution from exploration
- Lost focus on long tasks
- Over-broad capabilities



### Lesson 6.2 — Explorer subagent

**Add** `createTaskTool` **in** `src/tools.ts`**:**


| Property    | Explorer                     |
| ----------- | ---------------------------- |
| Tools       | `read`, `grep` only          |
| Model       | `anthropic/claude-haiku-4-5` |
| Step budget | `stepCountIs(5)`             |
| Lifecycle   | Fresh agent per call         |


```ts
const explorer = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions: `You are an explorer agent. Investigate and report back concisely.`,
  tools: { read: parentTools.read, grep: parentTools.grep },
  stopWhen: stepCountIs(5),
});
```

Errors return as strings, not thrown exceptions.

---



### Lesson 6.3 — Executor subagent


| Property    | Executor                                    |
| ----------- | ------------------------------------------- |
| Tools       | `read`, `grep`, `bash` (delegated approval) |
| Model       | `anthropic/claude-sonnet-4-6`               |
| Step budget | `stepCountIs(15)`                           |
| Trust       | `["npm test", "npm run build", "npx tsc"]`  |


```ts
const executorBash = createBashTool(
  sandbox,
  createApproval({ mode: "delegated", trust: ["npm test", "npm run build", "npx tsc"] }),
);
```

---



### Lesson 6.4 — Task tool as router

```ts
export function createTaskTool(sandbox: Sandbox, parentTools: { read; grep }) {
  return tool({
    inputSchema: z.object({
      description: z.string(),
      subagentType: z.enum(["explorer", "executor"]).default("explorer"),
    }),
    execute: async ({ description, subagentType }) => {
      const agent = subagentType === "executor"
        ? buildExecutor(sandbox, parentTools)
        : buildExplorer(sandbox, parentTools);
      return runSubagent(subagentType, agent, description);
    },
  });
}
```

**Model per role, not per session:**


| Role              | Model  | Why                     |
| ----------------- | ------ | ----------------------- |
| Explorer          | Haiku  | Fast, cheap, read-only  |
| Executor          | Sonnet | Reliable implementation |
| Reviewer (future) | Opus   | Deep reasoning          |


**Commit:** `feat(subagents): explorer and executor via task tool`

---



## Module 7: Sandbox Lifecycle (Concept)

> Course: [State Machine](https://vercel.com/academy/build-ai-agent-harness/state-machine) · [Snapshot and Restore](https://vercel.com/academy/build-ai-agent-harness/snapshot-and-restore) · [Durable Workflows](https://vercel.com/academy/build-ai-agent-harness/durable-workflows) · [Hard-Won Lessons](https://vercel.com/academy/build-ai-agent-harness/hard-won-lessons)

**No local build required.** Study these concepts:

### State machine

```
provisioning → active → hibernating → hibernated → (restore | destroy)
```

Two timeouts: idle timeout and absolute max lifetime. Activity resets idle timer.

### Snapshot and restore

- Freeze filesystem → return `snapshotId`
- Restore later from ID
- Idempotency hazards: double-restore, stale snapshot after code change



### Durable workflows

`setTimeout` dies when the function ends. [Vercel Workflow](https://vercel.com/docs/workflow) survives deploys with `sleep()` and hooks.

### Production gotchas

- Always `stop()` in `finally` and on SIGINT
- Snapshot before timeout
- Don't trust restore without verifying snapshot age

---



## Module 8: Human-in-the-Loop

> Course: [Structured Questions](https://vercel.com/academy/build-ai-agent-harness/structured-questions) · [Approval Config](https://vercel.com/academy/build-ai-agent-harness/approval-config)



### Lesson 8.1 — `askUser` tool

```ts
export function createAskUserTool() {
  return tool({
    inputSchema: z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(4),
    }),
    execute: async ({ question, options }) => {
      const formatted = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      console.log(`\nQuestion: ${question}\n${formatted}\n`);
      return `Asked: "${question}"\nOptions:\n${formatted}\n\n(Awaiting user response.)`;
    },
  });
}
```

**Add to system prompt —** `# Handling Ambiguity`**:**

```
1. Search the code or docs to gather context first
2. Use askUser to let the user choose. Do NOT guess.
3. Specific tasks (file paths, line numbers) → act directly
```

**Verify:**

- `"Add authentication"` → reads files, then `askUser`
- `"Add null check at line 42 of auth.ts"` → acts directly

---



### Lesson 8.2 — Approval config + events

Two approval models:

- **Config** — operational modes (`interactive`, `background`, `delegated`)
- **Events** — pluggable safety policies (block writes to `.env`, etc.)

**Commit:** `feat(askUser): structured questions with ambiguity protocol`

---



## Module 9: Planning and Verification

> Course: [Todo Tool](https://vercel.com/academy/build-ai-agent-harness/todo-tool) · [Fast Context Understanding](https://vercel.com/academy/build-ai-agent-harness/fast-context-understanding) · [Verification Contract](https://vercel.com/academy/build-ai-agent-harness/verification-contract)



### Lesson 9.1 — Todo tool

```ts
// Actions: add | start | complete | list
// States: pending | in_progress | completed
// Rule: only ONE item in_progress at a time
```


| Plan first                   | Skip planner    |
| ---------------------------- | --------------- |
| 3+ steps, multiple files     | One-line fix    |
| Dependencies between changes | Simple question |


---



### Lesson 9.2 — Fast context understanding

Prompt guidance:

1. **grep first** — find symbols, imports, patterns
2. **read only what you'll change** — targeted offsets/limits
3. Don't read 30 files to understand a codebase — delegate to explorer

---



### Lesson 9.3 — Verification contract

Gate sequence (run what exists):

```
typecheck → lint → test → build
```

Agent must report what it verified, not what it assumes.

**Commit:** `feat(planning): todo tool with verification contract`

---



## Module 10: Surfaces

> Course: [CLI Entry Point](https://vercel.com/academy/build-ai-agent-harness/cli-entry-point) · [Streaming and Tool Rendering](https://vercel.com/academy/build-ai-agent-harness/streaming-and-tool-rendering) · [Web Surface](https://vercel.com/academy/build-ai-agent-harness/web-surface)



### Lesson 10.1 — CLI entry point

**Replace ad-hoc argv parsing with** `parseArgs`**:**

```ts
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    sandbox: { type: "string", default: "local" },
    model: { type: "string", default: "anthropic/claude-haiku-4-5" },
  },
  allowPositionals: true,
});

const cwd = resolve(positionals[0] || process.cwd());
const prompt = positionals.slice(1).join(" ") || "Hello!";
```

**Clean shutdown:**

```ts
process.on("SIGINT", async () => {
  console.error("\nShutting down...");
  await sandbox.stop();
  process.exit(0);
});

try {
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
} finally {
  await sandbox.stop();
}
```

**Run:**

```bash
pnpm start -- --sandbox=just-bash --model=anthropic/claude-haiku-4-5 . "Read package.json"
```

---



### Lesson 10.2 — Streaming and tool rendering

Use `agent.stream()` instead of `generate()` for real-time output. Render tool calls as they fire (tool name + input summary).

---



### Lesson 10.3 — Web surface

Same agent, different renderer:

- Next.js API route with `streamText` / `createDataStreamResponse`
- Persist messages; resumable streams
- Tool results as UI components

The agent core stays unchanged — only the 5–6 lines of surface code differ.

**Commit:** `feat(cli): parseArgs and SIGINT-aware shutdown`

---



## Module 11: Extensibility

> Course: [Skills System](https://vercel.com/academy/build-ai-agent-harness/skills-system) · [Custom Tools](https://vercel.com/academy/build-ai-agent-harness/custom-tools) · [Extension Points](https://vercel.com/academy/build-ai-agent-harness/extension-points)



### Lesson 11.1 — Skills system

**Directory structure:**

```
skills/
└── auth-patterns/
    └── SKILL.md    # YAML frontmatter: description
```

`src/skills.ts`**:**

```ts
export function discoverSkills(dirs: string[]): Skill[] { /* scan SKILL.md */ }
```

**Progressive disclosure:**

- Names + one-line descriptions → always in system prompt (~100 tokens)
- Full content → `loadSkill(name)` on demand (capped at 4000 chars)

**Skill dirs (priority order):**

1. `{cwd}/skills/` (project-local, wins on name collision)
2. `~/.harness/skills/` (global)

---



### Lesson 11.2 — Custom tools

Register tools without forking:

```ts
const tools = {
  ...baseTools,
  ...customToolRegistry.getAll(),
};
```

Compose existing tools inside custom ones. Map every customization surface.

---



### Lesson 11.3 — Extension points (event bus)

```ts
type LifecycleEvent =
  | "session_start"
  | "tool_call"
  | "tool_result"
  | "session_before_compact"
  | "session_shutdown";

type EventResult = { block?: boolean; reason?: string; modify?: any } | void;
```

**Handler behaviors:**

- **Pass through** — log, telemetry
- **Block** — return reason to model (e.g. protect `.env`)
- **Modify** — inject instructions before compaction

**Chaining:** handlers run in registration order; first `block: true` stops execution.

**Commit:** `feat(skills): progressive-disclosure skill loading`

---



## Capstone

Run the harness against a **real project** with a non-trivial task:

> "Add rate limiting to the auth routes."

**Watch for:**

- Context overflow on long exploration
- Wrong tool selection (bash gravity)
- Subagent getting bad instructions
- Approval blocking needed commands
- Verification claims without running tests

**Fix what breaks.** Iterate on descriptions, prompt sections, and caps.

---



## Verification Checklist



### Module 1

- [ ] `ToolLoopAgent` with `read`, `grep`, `bash`
- [ ] Tool routing works for search / read / shell prompts
- [ ] Bash blocks dangerous commands with honest messages



### Module 2

- [ ] 5-section tool descriptions
- [ ] `createBashTool` factory with `BashOperations`
- [ ] `ApprovalConfig` with three modes



### Module 3

- [ ] `buildSystemPrompt()` with Agency + Guardrails
- [ ] `AGENTS.md` injection when present



### Module 4

- [ ] `Sandbox` interface; tools use it exclusively
- [ ] Local and just-bash backends swap via flag
- [ ] `sandbox.stop()` on exit and SIGINT



### Module 5

- [ ] `pruneMessages` in `prepareCall`
- [ ] Token growth plateaus on 4+ step tasks
- [ ] All tools have output caps



### Module 6

- [ ] `task` tool routes to explorer / executor
- [ ] Fresh subagent per call; errors as strings



### Module 8

- [ ] `askUser` for ambiguous tasks
- [ ] Direct action for specific tasks



### Module 9

- [ ] `todo` with single-active constraint
- [ ] Verification gates in prompt



### Module 10

- [ ] CLI with `--sandbox`, `--model` flags
- [ ] Clean shutdown



### Module 11

- [ ] Skills discovered and loadable on demand



### Final

- [ ] `pnpm typecheck` passes
- [ ] Capstone task completes (or fails in instructive ways)

---



## Course Links


| Module                   | Lessons                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**             | [Build Your Own AI Coding Agent Harness](https://vercel.com/academy/build-ai-agent-harness)                                                                                                                                                                                                                                                                                                                                                               |
| **1. Agent Loop**        | [From Chat to Agent](https://vercel.com/academy/build-ai-agent-harness/from-chat-to-agent) · [Your First Tools](https://vercel.com/academy/build-ai-agent-harness/your-first-tools) · [Completing the Toolbox](https://vercel.com/academy/build-ai-agent-harness/completing-the-toolbox)                                                                                                                                                                  |
| **2. Tool Design**       | [Descriptions That Work](https://vercel.com/academy/build-ai-agent-harness/descriptions-that-work) · [Shell Execution with Safety](https://vercel.com/academy/build-ai-agent-harness/shell-execution-with-safety) · [Approval Gates](https://vercel.com/academy/build-ai-agent-harness/approval-gates)                                                                                                                                                    |
| **3. System Prompt**     | [Structuring Agent Instructions](https://vercel.com/academy/build-ai-agent-harness/structuring-agent-instructions) · [Dynamic Prompt Construction](https://vercel.com/academy/build-ai-agent-harness/dynamic-prompt-construction) · [Verification Gates](https://vercel.com/academy/build-ai-agent-harness/verification-gates) · [Project Context](https://vercel.com/academy/build-ai-agent-harness/project-context)                                     |
| **4. Sandbox**           | [Designing the Interface](https://vercel.com/academy/build-ai-agent-harness/designing-the-interface) · [Local](https://vercel.com/academy/build-ai-agent-harness/local-implementation) · [In-Memory](https://vercel.com/academy/build-ai-agent-harness/in-memory-implementation) · [Cloud](https://vercel.com/academy/build-ai-agent-harness/cloud-implementation) · [Lifecycle Hooks](https://vercel.com/academy/build-ai-agent-harness/lifecycle-hooks) |
| **5. Context**           | [The Problem](https://vercel.com/academy/build-ai-agent-harness/the-problem) · [Pruning](https://vercel.com/academy/build-ai-agent-harness/pruning-old-results) · [Tool Output Design](https://vercel.com/academy/build-ai-agent-harness/tool-output-design) · [Cache Control](https://vercel.com/academy/build-ai-agent-harness/cache-control)                                                                                                           |
| **6. Subagents**         | [Why Delegate](https://vercel.com/academy/build-ai-agent-harness/why-delegate) · [Explorer](https://vercel.com/academy/build-ai-agent-harness/explorer-subagent) · [Executor](https://vercel.com/academy/build-ai-agent-harness/executor-subagent) · [Task Tool](https://vercel.com/academy/build-ai-agent-harness/task-tool)                                                                                                                             |
| **7. Lifecycle**         | [State Machine](https://vercel.com/academy/build-ai-agent-harness/state-machine) · [Snapshot and Restore](https://vercel.com/academy/build-ai-agent-harness/snapshot-and-restore) · [Durable Workflows](https://vercel.com/academy/build-ai-agent-harness/durable-workflows) · [Hard-Won Lessons](https://vercel.com/academy/build-ai-agent-harness/hard-won-lessons)                                                                                     |
| **8. Human-in-the-Loop** | [Structured Questions](https://vercel.com/academy/build-ai-agent-harness/structured-questions) · [Approval Config](https://vercel.com/academy/build-ai-agent-harness/approval-config)                                                                                                                                                                                                                                                                     |
| **9. Planning**          | [Todo Tool](https://vercel.com/academy/build-ai-agent-harness/todo-tool) · [Fast Context](https://vercel.com/academy/build-ai-agent-harness/fast-context-understanding) · [Verification Contract](https://vercel.com/academy/build-ai-agent-harness/verification-contract)                                                                                                                                                                                |
| **10. Surfaces**         | [CLI Entry Point](https://vercel.com/academy/build-ai-agent-harness/cli-entry-point) · [Streaming](https://vercel.com/academy/build-ai-agent-harness/streaming-and-tool-rendering) · [Web Surface](https://vercel.com/academy/build-ai-agent-harness/web-surface)                                                                                                                                                                                         |
| **11. Extensibility**    | [Skills System](https://vercel.com/academy/build-ai-agent-harness/skills-system) · [Custom Tools](https://vercel.com/academy/build-ai-agent-harness/custom-tools) · [Extension Points](https://vercel.com/academy/build-ai-agent-harness/extension-points)                                                                                                                                                                                                |


**Machine-readable course index:** [llms.txt](https://vercel.com/academy/llms.txt)

---

*Estimated course size: 38 lessons. Build Modules 1–6 sequentially; treat Module 7 as architecture reading; mix build + analysis for Modules 8–11.*
---
name: agent-harness-eval
description: Use when evaluating, reviewing, grading, or auditing an AI coding agent harness implementation (a tool-loop agent with read/grep/bash tools, sandbox abstraction, subagent delegation, context management, verification gates, approval config, or extensibility layers). Triggers on requests like "evaluate my agent harness", "grade this against the harness course", "review my TeensyCode-style implementation", or "audit this coding agent for context management / verification / delegation quality". Sourced from the Vercel Academy "Build Your Own AI Coding Agent Harness" course Done-When gates.
---

# AI Agent Harness — Evaluation Framework

Covers all 11 modules / 38 lessons of the Vercel Academy agent-harness course, end to
end (Agent Loop through Extensibility). Every checklist item below is taken verbatim
(or near-verbatim) from that course's "Done-When" section for the corresponding
lesson — not paraphrased from a summary. Concept-only lessons (no code) have their
Done-When reframed as "can explain / can identify" checks.

## Instructions

When this skill is invoked to evaluate a harness implementation:

1. **Locate the harness code.** Ask for the path if not given, or infer it from the
   open project. Identify which of the 38 lesson-level capabilities below are even
   applicable — a partial harness (e.g. no cloud sandbox, no web surface) is normal;
   mark inapplicable items "N/A" rather than "fail."
2. **Go module by module, lesson by lesson.** For each checklist item, find the
   enforcing code (the actual cap, gate, router, or check) or run the actual command.
   Cite the specific file and line for every finding.
3. **Run verification commands where a lesson requires it** (typically
   `npx tsc --noEmit` or the project's equivalent — check `package.json` scripts
   first, same as lesson 9.3 teaches).
4. **Apply the meta-rule from lesson 9.3 to every module, not just Module 9**: don't
   mark anything "pass" on the strength of a docstring, comment, or README claiming
   the behavior exists. If you didn't find the enforcing code or run the check,
   mark it "unverified," not "pass." A claim like "tests pass" without the actual
   run behind it fails this gate everywhere it appears.
5. **End with the scorecard** (template near the bottom of this file), filled in,
   plus a short "top risks" list ranked by blast radius rather than by how easy each
   fix is.

Treat each lesson block as a regression gate: don't mark a box "pass" without
evidence (a file/line reference, or a command actually run).

---

## Module 1 — The Agent Loop

### 1.1 From Chat to Agent
- [ ] `index.ts` (or equivalent) exports a `ToolLoopAgent` with a `read` tool
- [ ] The no-tools/chatbot version returns after one step
- [ ] The agent version (with `read`) calls the tool and reports file contents
- [ ] `read` returns numbered lines with optional `offset` and `limit`
- [ ] Output truncates at a fixed cap (course uses 500 lines) with a clear message
- [ ] Typecheck passes (`npx tsc --noEmit` or project equivalent)

### 1.2 Your First Tools
- [ ] A TODO/search-shaped prompt calls `grep`, not `read` or `bash`
- [ ] A "read this known file" prompt calls `read`, not `grep`
- [ ] `grep` caps at a fixed match count (course: 50) and reports the total when truncated
- [ ] Both `read` and `grep` descriptions use WHEN TO USE, WHEN NOT TO USE, and DO NOT USE FOR
- [ ] Typecheck passes

### 1.3 Completing the Toolbox
- [ ] Safe commands (`ls`, `find`, `git status`, etc.) run through `bash`
- [ ] Natural-language file-reading prompts still route to `read`, not `bash` with `cat`
- [ ] `rm -rf`, `sudo`, and other unlisted commands return a block message (not `needsApproval` alone — that silently vanishes and lets the model confabulate success)
- [ ] The model reports blocked commands to the user instead of pretending they succeeded
- [ ] Typecheck passes

## Module 2 — Tool Design

### 2.1 Descriptions That Work
- [ ] All tools have descriptions with all 5 sections (summary line, WHEN TO USE, WHEN NOT TO USE, DO NOT USE FOR, USAGE, EXAMPLES)
- [ ] A TODO-search prompt routes to `grep`
- [ ] A file-read prompt routes to `read`
- [ ] A shell-listing prompt routes to `bash`
- [ ] Typecheck passes
- [ ] Red flag: "bash gravity" — every model defaults to `bash` when descriptions are thin; doubled negative steering (WHEN NOT TO USE *and* DO NOT USE FOR) should be present, not just one

### 2.2 Shell Execution with Safety
- [ ] A `BashOperations`-style interface is defined with `exec(command)`
- [ ] `createBashTool(operations, safePrefixes)` (or equivalent factory) returns a working tool
- [ ] A local backend wraps the real exec call and returns `{ stdout, exitCode }` uniformly (never throws)
- [ ] Safe commands still run, blocked commands still return the block message, after the refactor
- [ ] Typecheck passes
- [ ] The model-facing contract (description, schema, safety check) is separated from the execution backend — swapping backends should be a one-line change, not a tool rewrite

### 2.3 Approval Gates
- [ ] Approval config is a discriminated union with at least `interactive`, `background`, `delegated` modes
- [ ] `createApproval(config)` (or equivalent) returns a `needsApproval` function
- [ ] The bash tool factory accepts the approval function as a parameter (not a hardcoded list)
- [ ] Each mode behaves correctly for at least one safe and one unsafe command
- [ ] Typecheck passes
- [ ] Approval outcome (was it allowed to run) is kept conceptually separate from command outcome (did it succeed) — don't conflate the two in evaluation

## Module 3 — The System Prompt

### 3.1 Structuring Agent Instructions
- [ ] `instructions`/system prompt includes distinct `# Agency` and `# Guardrails` sections (not one undifferentiated blob)
- [ ] Agency section tells the agent to use tools and act, not explain what it would do
- [ ] Guardrails constrains scope (minimal changes, reuse existing patterns, no new deps without asking)
- [ ] Runtime values (e.g. working directory) still interpolate into the prompt
- [ ] Typecheck passes

### 3.2 Dynamic Prompt Construction
- [ ] A `buildSystemPrompt(context)`-style pure function exists (e.g. in `src/system.ts`), separate from tool code
- [ ] It returns equivalent content to a static baseline when given equivalent context (i.e., the refactor didn't change behavior)
- [ ] Optional context fields (e.g. `gitBranch`, `projectContext`) are only included in the prompt when provided
- [ ] Callers build the instructions via the function, not an inline template string
- [ ] Typecheck passes
- [ ] Bonus signal: is the function unit-testable (same context in → same string out, no side effects)?

### 3.3 Verification Gates
- [ ] The system prompt includes a `# Verification` section
- [ ] The section explicitly instructs the agent NOT to claim success without running the check
- [ ] The section requires scoped reporting: what ran, what was blocked, what was unavailable
- [ ] On a real edit, the agent's report names the specific check run (e.g. `tsc`) rather than a blanket "looks good"
- [ ] Typecheck passes
- [ ] **Confabulation smell test**: watch for hedged future tense ("should be fine," "I expect this to work") instead of past-tense, specific results — that's the tell that a check wasn't actually run

### 3.4 Project Context
- [ ] The harness checks for `AGENTS.md` (or project's equivalent convention file) in the working directory
- [ ] If present, its contents are injected into the prompt as project context
- [ ] With the file present, the agent answers project-specific questions (e.g. test command) correctly from it
- [ ] Without the file, the harness still runs cleanly on base instructions only
- [ ] Typecheck passes

## Module 4 — The Sandbox Abstraction

### 4.1 Designing the Interface
- [ ] A `Sandbox` interface is exported (e.g. `src/sandbox.ts`) with at minimum `type`, `workingDirectory`, `readFile`, `exec`, `stop`
- [ ] `read`, `grep`, `bash` accept a `Sandbox` and call `sandbox.readFile` / `sandbox.exec` — not `child_process`/`fs` directly
- [ ] No tool imports `readFileSync` or `execSync` (or host APIs) directly anymore
- [ ] Backend-specific optional fields (`expiresAt`, `snapshot`) are typed as optional, not required
- [ ] Typecheck passes

### 4.2 Local Implementation
- [ ] A local sandbox factory (e.g. `createLocalSandbox(dir)`) exists and returns an object satisfying `Sandbox`
- [ ] `readFile` and `exec` route through the real host APIs underneath
- [ ] `stop` is a no-op that doesn't crash
- [ ] All tools still work exactly as before the interface refactor (same prompts, same output)
- [ ] Typecheck passes
- [ ] Regression check: if behavior changed after this refactor, some tool is still bypassing `sandbox` — that's a leak, not an acceptable variance

### 4.3 In-Memory Implementation
- [ ] The in-memory/virtual backend dependency is installed
- [ ] A factory (e.g. `createLocalSandbox(dir)` / `createCloudSandbox(...)`) returns a `Sandbox` (or `Promise<Sandbox>`)
- [ ] Paths are correctly translated through the virtual mount point (not assumed to match the host path)
- [ ] Switching backend via env var/flag runs the agent against the in-memory backend successfully
- [ ] A write-shaped task on the in-memory backend does NOT touch the real filesystem
- [ ] Typecheck passes

### 4.4 Cloud Implementation (concept-only — no commit expected)
- [ ] Evaluator/agent can explain why `readFile` on a cloud sandbox adds latency vs. local
- [ ] Evaluator/agent can explain why `expiresAt` is optional on the interface (not every backend has a timeout)
- [ ] Evaluator/agent can describe when to pick `local` vs `cloud`
- [ ] Evaluator/agent could sketch `createCloudSandbox` against a real provider API if asked

### 4.5 Lifecycle Hooks
- [ ] A `SandboxLifecycle`-style interface exists with (at least) optional `afterStart`, `beforeStop`, `onTimeout`
- [ ] `afterStart` is called once after sandbox creation
- [ ] `beforeStop` is called once before `sandbox.stop()`, inside a `try/finally` (fires even if the agent throws mid-run)
- [ ] With empty/no-op hooks, the agent runs unchanged
- [ ] With logging hooks wired in, the calls fire in the correct order
- [ ] Typecheck passes

## Module 5 — Context Management

### 5.1 The Problem (telemetry, not a fix)
- [ ] `onStepFinish` (or equivalent) logs `inputTokens` and `outputTokens` per step
- [ ] A 4+ step task shows input tokens climbing across steps
- [ ] Output tokens stay relatively flat across steps
- [ ] Telemetry logs go to stderr/a side channel, not mixed into the agent's actual response stream
- [ ] Typecheck passes

### 5.2 Pruning Old Results
- [ ] Message-pruning (e.g. `pruneMessages`) is wired into the pre-call hook (e.g. `prepareCall`)
- [ ] The full original options object is spread/preserved before the messages override (model, tools, system prompt must survive the pipeline)
- [ ] The undefined-messages case (very first call) is handled without throwing
- [ ] On a 4+ step task, input tokens **plateau** instead of growing linearly, verified by rerunning the same task from 5.1
- [ ] Typecheck passes
- [ ] Judge the shape of the curve, not exact token counts — the proof is plateau-vs-linear, not matching a specific number

### 5.3 Tool Output Design
- [ ] `read` caps output at a fixed line limit with offset/limit pagination
- [ ] `grep` caps at a fixed match count with a "(N total, showing first X)" suffix on truncation
- [ ] `bash` caps stdout at a fixed character limit — and keeps the **tail**, not the head (errors/failures usually appear at the end)
- [ ] Every cap surfaces a clear, visible truncation message the model can act on (silent truncation is worse than none — the model thinks it has the full picture)
- [ ] No tool can return unbounded output under any input
- [ ] Typecheck passes

### 5.4 Cache Control
- [ ] A cache-control helper (e.g. `addCacheControl(messages)`) marks stable/older messages as cacheable
- [ ] The pipeline runs pruning **then** caching, in that order
- [ ] The most recent message(s) stay uncached (they're about to be replaced next call anyway)
- [ ] On a provider that supports it, cached-token usage shows up and grows across steps while fresh input tokens stay small
- [ ] Typecheck passes

## Module 6 — Subagent Delegation

### 6.1 Why Delegate (concept-only)
- [ ] Evaluator/agent can name the three single-agent failure modes: context pollution, lost focus, over-broad capabilities
- [ ] Evaluator/agent can describe when delegation helps (clean-handoff research/bulk work) vs. when it doesn't (single-file changes, ambiguous requirements, architectural decisions)
- [ ] Evaluator/agent can sketch how a real task would split across parent / explorer / executor roles

### 6.2 Explorer Subagent
- [ ] A `task`-style tool exists and spawns a **fresh** `ToolLoopAgent` per call (not reused across calls)
- [ ] The explorer subagent has `read` and `grep` only — no `bash`, no `write`, no `askUser`
- [ ] The explorer uses a cheap/fast model and a small step budget (course: Haiku, 5 steps)
- [ ] Errors from the subagent return as strings, not thrown exceptions
- [ ] The parent can delegate a research task and receive a clean summary back
- [ ] Typecheck passes

### 6.3 Executor Subagent
- [ ] The `task` tool's schema includes a role/type field distinguishing explorer vs. executor
- [ ] The executor uses a stronger model and larger step budget than the explorer (course: Sonnet, 15 steps)
- [ ] The executor has its own `bash` in **delegated** approval mode with a small, explicit trust list — not the parent's interactive bash, and not the full safe-prefix list
- [ ] The executor follows precise instructions and does not ask the user questions
- [ ] Explorer behavior from 6.2 is unchanged after adding the executor branch
- [ ] Typecheck passes

### 6.4 Task Tool
- [ ] The task tool's description names both/all roles and gives clear guidance on which to use when
- [ ] The `execute` body is a **thin router** — role-specific construction lives in separate helper functions, not inline in `execute`
- [ ] Each role helper takes sandbox + parent tools, returns a `ToolLoopAgent`, and exposes model/step budget at the top of its own definition
- [ ] Errors return as strings, not thrown exceptions
- [ ] Adding a third role would mean one new helper + one new branch — not a redesign of the tool

## Module 7 — Sandbox Lifecycle (concept/analysis module)

### 7.1 State Machine
- [ ] Can name the four states in order (e.g. provisioning → active → hibernating → hibernated)
- [ ] Can describe the difference between hard expiry (provider-set, unextendable) and the inactivity window (harness-set, configurable)
- [ ] Can identify what counts as activity (user message, tool call, fs change) vs. noise (status polling, health checks, reconnect probes)
- [ ] Can trace a sample timeline and identify when an auto-snapshot should fire before hard expiry

### 7.2 Snapshot and Restore
- [ ] Can describe what `snapshot` preserves (filesystem state) vs. what it doesn't (running processes, in-flight network, in-memory state)
- [ ] Can name the three idempotency hazards and their guard patterns:
  - Snapshot already in progress → cache/reuse the in-flight promise
  - Sandbox already running on restore → check for an active sandbox before restoring ("look before you create")
  - Double stop → a `stopped` boolean guard so the second `stop()` is a no-op
- [ ] Can explain why a restored snapshot might still need `afterStart` to re-run (a snapshot is a moment in time; the project may have moved on)

### 7.3 Durable Workflows
- [ ] Can explain why `setTimeout`/`setInterval` fails for sandbox lifecycle in serverless (the process dies, the timer dies with it, and there's no guarantee across redeploys)
- [ ] Can sketch a durable workflow loop (e.g. `sleep()` that checkpoints to durable storage and resumes) and identify where the durability seam is
- [ ] Can do rough cost math for a workload (idle-hibernation savings vs. running to hard expiry)

### 7.4 Hard-Won Lessons
- [ ] Can name all five production gotchas:
  1. Stale handles after reconnect (probe before using a reconnected handle)
  2. Stale expiry data (always fetch fresh expiry from the provider before lifecycle decisions; cache only for display)
  3. Polling resets inactivity (status/health/reconnect probes must NOT count as activity)
  4. Auto-resume loops (auto-resume only on initial entry, not every reconnect)
  5. State divergence (provider API is the source of truth; DB and client caches are just caches)
- [ ] Can describe the fix pattern for each
- [ ] Can map each fix to which lifecycle hook (Module 4) it would slot into

## Module 8 — Human-in-the-Loop

### 8.1 Structured Questions
- [ ] An `askUser`-style tool exists, accepting a question and 2–4 options
- [ ] A `# Handling Ambiguity` section exists in the system prompt (search first → ask second → act third)
- [ ] An ambiguous prompt (no specifics given) triggers `askUser`
- [ ] A specific prompt (file path / line number / precise instruction given) does **not** trigger `askUser`
- [ ] Typecheck passes
- [ ] Known tension to watch for: if `bash` is blocked by approval, the agent may not be able to gather enough context to even reach the "ask" step — this is real friction, not necessarily a bug

### 8.2 Approval Config (concept-heavy)
- [ ] Can describe the config-based approval model (operational mode: interactive/background/delegated — set at session start, answers "who decides")
- [ ] Can describe the event-based approval model (per-tool-call interception that can block or modify input — answers "what specific policies apply")
- [ ] Can correctly pick which model fits a given use case (e.g. "block writes to .env" → event-level, not config-level)
- [ ] Can sketch how the two combine for defense in depth (config sets the mode; events enforce policies regardless of mode)

## Module 9 — Planning and Verification

### 9.1 Todo Tool
- [ ] A `todo`-style tool exists supporting at least add / start / complete / list actions
- [ ] Only one item can be `in_progress` at a time — `start` rejects if another item is already active
- [ ] A genuinely multi-step task (3+ steps) gets decomposed into tracked items
- [ ] A genuinely single-step task does **not** trigger the todo tool (if it does, the tool description is over-eager)
- [ ] Typecheck passes

### 9.2 Fast Context Understanding
- [ ] The system prompt's Agency section explicitly steers toward "search before reading" (grep first, read only what you'll change) — this is prompt-level policy, not a tool description change
- [ ] On a multi-file task with no file named, the agent calls `grep` before any `read`, and subsequent `read`s target files `grep` actually found
- [ ] On a task naming a specific file, the agent skips `grep` and reads directly
- [ ] Total step count on an exploration task drops noticeably vs. a "read everything" baseline
- [ ] Typecheck passes

### 9.3 Verification Contract — the core evaluation-framework lesson
- [ ] Verification gates are **discovered from the project** (e.g. read `package.json` scripts for typecheck/lint/test/build), not hardcoded generic commands
- [ ] The system prompt's Verification section lists the actual discovered gates for this project
- [ ] The agent runs gates **in order** (typecheck first — fails fastest; build last — slowest) and reports exact commands and outputs
- [ ] The agent explicitly **distinguishes failures it caused from pre-existing failures** (e.g. "3 failures, pre-existing in `user.test.ts`, unrelated to my change") rather than a blanket pass/fail claim
- [ ] On a project with no discoverable scripts, the agent reports that verification is limited — it does not fabricate a gate that doesn't exist
- [ ] Typecheck passes
- [ ] **This is the meta-rule for grading every other module in this framework**: don't accept "done" from Cursor (or from the harness under test) without the specific command/output that backs the claim. A claim like "tests pass" without the actual run behind it fails this gate — no matter which module it appears in.

## Module 10 — Surfaces

### 10.1 CLI Entry Point
- [ ] Argument parsing (e.g. `parseArgs`) reads flags such as `--sandbox` and `--model`, not just positional/env-var juggling
- [ ] Positionals supply the working directory and the prompt
- [ ] `sandbox.stop()` runs on normal exit, via a `try/finally` around the agent run
- [ ] `sandbox.stop()` also runs on `SIGINT` (Ctrl-C), via a signal handler — this is a separate path from the `finally`, not a substitute for it
- [ ] Typecheck passes
- [ ] Structural check: is the CLI actually thin? Almost nothing in the entry point should be about CLI concerns — agent, tools, prompt, and sandbox construction should be reusable as-is by a different surface

### 10.2 Streaming and Tool Rendering
- [ ] `agent.stream({ prompt })` (or equivalent) replaces the blocking `generate` call
- [ ] The stream is consumed with `for await` over the full chunk stream
- [ ] `text-delta` chunks write to stdout (the actual response channel)
- [ ] `tool-call` and `tool-result` chunks write to stderr (or another side channel) — not mixed into stdout
- [ ] Redirecting stderr away leaves **only** the agent's actual response in stdout (this is the concrete test — run it and check)
- [ ] Typecheck passes
- [ ] Note the flagged tension: inline approval gets harder once streaming — pausing mid-stream to ask the user is an interaction loop, not a simple chunk handler; a block-and-report tool result (Module 1/2 style) is still an acceptable fallback here

### 10.3 Web Surface (concept-only — no working web code expected in the course repo)
- [ ] Can explain why the **agent** code doesn't change between CLI and web surfaces (same `prompt`/optional `messages` in, same chunk stream out)
- [ ] Can sketch persistence (load/save messages by session), streaming-over-HTTP (e.g. SSE wrapping the same `fullStream` chunk shape), and tool-result-as-component rendering for a web surface
- [ ] Can correctly identify what stays in the agent (all core logic) vs. what moves to the surface (auth, persistence, layout, components, resumability)
- [ ] Red flag if evaluating a real web-enabled harness: any `if (isWeb)`-style branching **inside** the agent/tool code is a sign the separation has leaked — that logic belongs in the surface layer

## Module 11 — Extensibility

### 11.1 Skills System
- [ ] Skill discovery (e.g. `discoverSkills`) scans one or more directories for `<name>/SKILL.md` and parses frontmatter (at least a `description`)
- [ ] The system prompt lists each discovered skill's name plus a one-line description only — not full content, on every call
- [ ] A `loadSkill`-style tool returns the full markdown content on demand, and that content is capped (same bounded-output discipline as Module 5)
- [ ] When project-local and global skill directories both define a skill with the same name, the project-local one wins (first-directory-wins dedup)
- [ ] A task that names/needs a skill triggers `loadSkill`; an unrelated task does not load anything
- [ ] Typecheck passes
- [ ] Judge this against the stated principle: "names in, content out" — five verbose skills pasted directly into the prompt is a fail even if the information is technically correct, because it defeats the purpose of progressive disclosure

### 11.2 Custom Tools
- [ ] A tool registry exists (e.g. `createRegistry()`) exposing at least `register`, `get`, `list`
- [ ] Built-in tools are wired through a single `registerBuiltins(registry, sandbox, ...)`-style helper — not scattered inline construction
- [ ] A `wrapTool(base, hooks)`-style composition helper exists, supporting at least `beforeExecute`/`afterExecute`, and returns a **new** tool without mutating the base
- [ ] The agent's tool set is built from `registry.entries()` (or equivalent) rather than a hardcoded inline object
- [ ] A custom tool registered *after* `registerBuiltins` is actually callable by the agent (proves the seam works, not just compiles)
- [ ] Typecheck passes
- [ ] Ordering hazard to check for: any tool construction that depends on another tool already being registered (e.g. `task` needing `read`/`grep`) must register in the correct order, or it will wire in `undefined`

### 11.3 Extension Points (concept-only — no working event bus expected in the course repo)
- [ ] Can name the lifecycle events the course sketches (e.g. `session_start`, `tool_call`, `tool_result`, `session_before_compact`, `session_shutdown`) or an equivalent set for the harness under review
- [ ] Can describe the three handler outcomes: pass through (no return / continue), block (stop the call, return a reason to the model as the tool result), modify (alter the event data before it continues)
- [ ] Can trace a multi-handler chain in registration order and correctly predict what happens when multiple handlers subscribe to the same event (first block wins; order affects what gets logged vs. suppressed)
- [ ] Can explain how the event bus **complements rather than replaces** the Module 2 approval config: config sets the operational mode (who decides, at the tool level); events are a layer *around* tools that can block even when approval would have passed
- [ ] If evaluating a harness that did implement an event bus: was it built last, after tools/sandbox/prompt/context/subagents/lifecycle hooks are solid? Building it first is a documented anti-pattern (temptation to route every problem through `on('tool_call', ...)` instead of using the more specific mechanism)

---

## Scorecard Template

```
| Lesson | Status (pass/partial/fail/unverified) | Evidence (file:line or command run) |
|--------|----------------------------------------|----------------------------------------|
| 1.1 From Chat to Agent               | | |
| 1.2 Your First Tools                 | | |
| 1.3 Completing the Toolbox           | | |
| 2.1 Descriptions That Work           | | |
| 2.2 Shell Execution with Safety      | | |
| 2.3 Approval Gates                   | | |
| 3.1 Structuring Agent Instructions   | | |
| 3.2 Dynamic Prompt Construction      | | |
| 3.3 Verification Gates               | | |
| 3.4 Project Context                  | | |
| 4.1 Designing the Interface          | | |
| 4.2 Local Implementation             | | |
| 4.3 In-Memory Implementation         | | |
| 4.4 Cloud Implementation (concept)   | | |
| 4.5 Lifecycle Hooks                  | | |
| 5.1 The Problem (telemetry)          | | |
| 5.2 Pruning Old Results              | | |
| 5.3 Tool Output Design               | | |
| 5.4 Cache Control                    | | |
| 6.1 Why Delegate (concept)           | | |
| 6.2 Explorer Subagent                | | |
| 6.3 Executor Subagent                | | |
| 6.4 Task Tool                        | | |
| 7.1 State Machine (concept)          | | |
| 7.2 Snapshot and Restore (concept)   | | |
| 7.3 Durable Workflows (concept)      | | |
| 7.4 Hard-Won Lessons (concept)       | | |
| 8.1 Structured Questions             | | |
| 8.2 Approval Config (concept)        | | |
| 9.1 Todo Tool                        | | |
| 9.2 Fast Context Understanding       | | |
| 9.3 Verification Contract            | | |
| 10.1 CLI Entry Point                 | | |
| 10.2 Streaming and Tool Rendering    | | |
| 10.3 Web Surface (concept)           | | |
| 11.1 Skills System                   | | |
| 11.2 Custom Tools                    | | |
| 11.3 Extension Points (concept)      | | |

Overall: X/38 pass, Y partial, Z fail, W unverified.
Top risks (ranked by blast radius):
1.
2.
3.
```

## Ground rule for Cursor when applying this

> A section is "pass" only if you found the enforcing code (the cap, the gate, the
> approval check, the router) or actually ran the check. A docstring, comment, or
> README claiming the behavior exists is not evidence. If you can't find or run it,
> mark it "unverified," not "pass" — this mirrors 9.3's own rule: don't inflate
> partial verification into a blanket claim.

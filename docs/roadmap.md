# Craftly Roadmap (detailed)

Compared to systems like Claude Code, Devin, OpenHands/SWE-agent, or Codex CLI, Craftly already covers substantial core ground (edit-capable tools, role-scoped subagents with tiered models, chaos testing, a real eval suite). The gaps below are what would need to close for it to be trustworthy on real, unattended work.

This document expands the short [Roadmap](../README.md#roadmap) in the README.

---

## Sandboxing & isolation

- [ ] Real isolation for the local backend — it currently runs `spawn` directly on the host with no container/VM/jail boundary
- [ ] Filesystem-level guardrails (e.g. block writes outside the working directory, block `.env`/secret files regardless of approval mode)
- [ ] Resource limits (CPU/memory/disk/network egress) on both backends
- [ ] Per-session network policy (the sandbox can currently reach the open internet from `bash`)

## Safety & approval

- [ ] The "event layer" approval policy called out in `Architecture.md` (hard-blocked actions regardless of mode) — only the config-layer mode exists today
- [ ] Audit logging of every command executed and file changed, with a persistent, queryable trail
- [ ] Secret-scanning on `write`/`edit` output before it lands on disk (not just on demand)
- [ ] Rate limiting / cost ceilings per session to bound runaway loops or spend

## Persistence & session management

- [ ] Durable session/checkpoint state across process restarts (today, state lives in-memory for the life of one CLI/API invocation)
- [ ] Resume-from-interruption for long-running tasks
- [ ] Multi-turn conversation persistence in the web UI beyond a single session

## Multi-tenancy & platform concerns

- [ ] Authentication and per-user isolation (currently single-user/local)
- [ ] Usage metering, billing hooks, and per-tenant rate limits
- [ ] Role-based access control over which tools/sandbox modes a given user can invoke

## Model & routing

- [ ] Multi-provider routing beyond OpenAI (Anthropic cache-control code exists in `cache.ts` but the default model wiring is OpenAI-only)
- [ ] Automatic model fallback/retry on provider errors or rate limits
- [ ] Cost-aware routing (pick a cheaper model automatically for simple steps)

## Observability

- [ ] Structured tracing/spans (today: `onStepFinish` logs to stderr, not a queryable trace store)
- [ ] Cost dashboards and per-session token/spend reporting
- [ ] Replay tooling to re-run a past session step-by-step for debugging

## Tooling depth

- [ ] Multi-file atomic patch/diff application (today, `edit` is single-file, single-occurrence)
- [ ] Web search / browsing tool for docs or dependency lookups
- [ ] Git-native tools (structured diff/commit/PR creation) beyond raw `bash git ...`
- [ ] Long-context / codebase-wide semantic search (embeddings/RAG) beyond `grep`

## Testing & CI

- [ ] Wire `eval -- --strict` (and `pnpm typecheck`/`lint`) into an actual CI pipeline — none exists in the repo yet
- [ ] Expand the eval suite beyond 15 cases toward benchmark-style coverage (e.g. SWE-bench-style tasks)
- [ ] Load/soak testing for the cloud sandbox path

## Lifecycle

- [ ] Wire up `onTimeout` (currently listed as "not wired yet" in `Architecture.md`) so cloud sessions snapshot before the VM dies
- [ ] Graceful degradation when the cloud provider is unavailable (fallback to local, queuing, etc.)

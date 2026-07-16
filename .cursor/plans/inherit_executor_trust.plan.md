---
name: Inherit executor trust
overview: Thread a parent-owned trust list into createTaskTool so the executor no longer hardcodes EXECUTOR_TRUST. Keep the executor without a task tool (no nested executors).
todos:
  - id: pass-trust
    content: "Pass trust: string[] into createTaskTool from index.ts"
    status: completed
  - id: use-trust
    content: Use that trust for executor delegated bash; remove hardcoded EXECUTOR_TRUST
    status: completed
  - id: docs
    content: Update task tool description + AGENTS.md if trust list is documented inline
    status: completed
  - id: verify
    content: Run pnpm typecheck
    status: completed
isProject: false
---

# Inherit executor trust from parent

Completed as part of Lesson 6.4 task-router refactor: `EXECUTOR_TRUST` lives in `index.ts` and is passed as `{ trust }` into `createTaskTool` → `buildExecutor`.

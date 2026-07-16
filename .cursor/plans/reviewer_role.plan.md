---
name: Reviewer role
overview: Add a read-only reviewer subagent with a verdict tool, and an executor -> review -> retry loop (cap 2). Stretch goal from Lesson 6.4 (Task Tool).
todos:
  - id: verdict-tool
    content: Add createVerdictTool (pass/fail + feedback captured via closure)
    status: pending
  - id: build-reviewer
    content: Add buildReviewer (read, grep, verdict; reviewer model; 8 steps)
    status: pending
  - id: review-loop
    content: runExecutorWithReview - executor -> git diff -> review -> retry on fail (max 2)
    status: pending
  - id: wire-model
    content: Add reviewerModel (OPENAI_REVIEWER_MODEL) and pass models.reviewer from index.ts
    status: pending
  - id: verify
    content: Run pnpm typecheck
    status: pending
isProject: false
---

# Reviewer role (Lesson 6.4 stretch goal)

Close the loop: after an executor finishes, a reviewer grades the work and can send it back.

## Reviewer at a glance

| Property | Reviewer |
|----------|----------|
| Tools | `read`, `grep`, `verdict` |
| Model | Opus-level (`OPENAI_REVIEWER_MODEL`, falls back to `OPENAI_MODEL`) |
| Step budget | `stepCountIs(8)` |
| Can modify | No (read-only) |

## Changes ([src/tools.ts](src/tools.ts))

1. `createVerdictTool()` - reviewer's structured output; closure captures `{ verdict: "pass" | "fail", feedback }`:

```ts
function createVerdictTool() {
  let captured: { verdict: "pass" | "fail"; feedback: string } | null = null;
  const verdict = tool({
    description: "Report your review verdict. Call exactly once.",
    inputSchema: z.object({
      verdict: z.enum(["pass", "fail"]),
      feedback: z.string(),
    }),
    execute: async ({ verdict, feedback }) => {
      captured = { verdict, feedback };
      return `Verdict recorded: ${verdict}`;
    },
  });
  return { verdict, getVerdict: () => captured };
}
```

2. `buildReviewer(sandbox, parentTools, model, verdictTool)` - read-only agent that must end by calling `verdict`.

3. `runExecutorWithReview(...)` - snapshot `git diff` (harness-run, not the executor's gated bash), spawn reviewer with `task + executor report + diff`, retry executor with feedback on `fail`. Cap 2 retries.

```ts
async function runExecutorWithReview(sandbox, parentTools, models, task) {
  const MAX_RETRIES = 2;
  let prompt = task;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await runSubagent("Executor", buildExecutor(...), prompt);
    const diff = (await sandbox.exec("git diff")).stdout.trim();
    const { verdict, getVerdict } = createVerdictTool();
    await buildReviewer(sandbox, parentTools, models.reviewer, verdict)
      .generate({ prompt: reviewPrompt(task, result, diff) });
    const v = getVerdict();
    if (!v || v.verdict === "pass") return `${result}\n\n[Review: ${v?.verdict}]`;
    if (attempt === MAX_RETRIES) return `${result}\n\n[Review: fail after ${MAX_RETRIES} retries]`;
    prompt = `${task}\n\nReviewer feedback:\n${v.feedback}\nAddress it.`;
  }
}
```

4. Executor branch in `createTaskTool` calls `runExecutorWithReview` instead of `runSubagent` directly; extend `models` to `{ explorer, executor, reviewer }`.

## Changes ([index.ts](index.ts))

- Add `reviewerModel` from `OPENAI_REVIEWER_MODEL`; pass `models.reviewer` into `createTaskTool`.

## Design notes

- Reviewer capability >= executor, or it rubber-stamps (shares blind spots).
- Review the real `git diff` and require `read`/`grep` verification, not the executor's self-report.
- Blocked until write/edit tools exist: executor can't modify files today, so diffs are empty and reviews fail every retry. Land write/edit first.

## Verify

`pnpm typecheck`

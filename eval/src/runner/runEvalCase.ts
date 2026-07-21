import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { ToolLoopAgent, stepCountIs, pruneMessages } from "ai";
import {
  addCacheControl,
  openaiCacheProviderOptions,
} from "@coding-agent-harness/core/cache";
import { getHarnessCommit, materializeFixture } from "../fixture";
import { buildHarnessTools } from "../harness/adapter";
import { wrapToolsForTracing } from "../harness/traceTools";
import { fixturesDir } from "../paths";
import { scoreCase } from "../scoring";
import { scoreWithJudge } from "../scoring/judge";
import type {
  EvalResult,
  RunTrace,
  StepTrace,
  TestCase,
  ToolCallRecord,
} from "../types";

export async function runEvalCase(
  testCase: TestCase,
  opts?: {
    harnessCommit?: string;
    fixtureRoot?: string;
  },
): Promise<EvalResult> {
  const fixtureRoot = opts?.fixtureRoot ?? fixturesDir;
  const fixtureSource = resolve(fixtureRoot, testCase.fixture);
  const workDir = materializeFixture(fixtureSource, testCase.id);
  const harnessCommit = opts?.harnessCommit ?? getHarnessCommit();

  const toolCalls: ToolCallRecord[] = [];
  const steps: StepTrace[] = [];
  let assignedCallCount = 0;

  try {
    const harness = await buildHarnessTools(workDir, {
      approvalMode: testCase.approvalMode,
    });
    const tracedTools = wrapToolsForTracing(
      harness.tools as Record<string, { execute?: (...args: unknown[]) => unknown }>,
      toolCalls,
    );

    const startedAt = new Date().toISOString();
    const maxSteps = testCase.maxSteps ?? 15;

    const agent = new ToolLoopAgent({
      model: harness.model,
      instructions: harness.instructions,
      tools: tracedTools as any,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: ({ usage, stepNumber }) => {
        const newCalls = toolCalls.slice(assignedCallCount);
        for (const tc of newCalls) {
          tc.stepNumber = stepNumber;
        }
        assignedCallCount = toolCalls.length;

        const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
        steps.push({
          stepNumber,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cachedInputTokens: cached,
          toolCalls: newCalls,
        });
      },
      prepareCall: async (options) => {
        const pruned = options.messages
          ? pruneMessages({
              messages: options.messages,
              toolCalls: "before-last-3-messages",
            })
          : undefined;
        return {
          ...options,
          messages: pruned ? addCacheControl(pruned) : undefined,
          providerOptions: {
            ...options.providerOptions,
            ...openaiCacheProviderOptions("eval-harness"),
          },
        };
      },
    });

    const t0 = Date.now();
    let finalText = "";
    try {
      const result = await agent.generate({ prompt: testCase.prompt });
      finalText = result.text ?? "";
    } finally {
      await harness.sandbox.stop();
    }
    const totalDurationMs = Date.now() - t0;

    if (assignedCallCount < toolCalls.length) {
      const leftover = toolCalls.slice(assignedCallCount);
      const stepNumber = (steps.at(-1)?.stepNumber ?? 0) + 1;
      for (const tc of leftover) tc.stepNumber = stepNumber;
      steps.push({
        stepNumber,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: leftover,
      });
    }

    const trace: RunTrace = {
      testCaseId: testCase.id,
      harnessCommit,
      model: harness.modelId,
      startedAt,
      finishedAt: new Date().toISOString(),
      steps,
      finalText,
      totalDurationMs,
    };

    let judged: {
      responseQuality: number | null;
      hallucinationRate: number;
      rationale?: string;
    } = { responseQuality: null, hallucinationRate: 0 };

    if (testCase.judge) {
      const j = await scoreWithJudge(
        testCase.judge,
        testCase.prompt,
        finalText,
        toolCalls,
      );
      judged = {
        responseQuality: j.responseQuality,
        hallucinationRate: j.hallucinationRate,
        rationale: j.rationale,
      };
    }

    const { scores, passed, failureSummary } = scoreCase(
      testCase,
      trace,
      toolCalls,
      workDir,
      judged,
    );

    return {
      runId: randomUUID(),
      testCaseId: testCase.id,
      category: testCase.category,
      harnessCommit,
      model: harness.modelId,
      timestamp: new Date().toISOString(),
      trace,
      scores,
      passed,
      failureSummary,
      judgeRationale: judged.rationale,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

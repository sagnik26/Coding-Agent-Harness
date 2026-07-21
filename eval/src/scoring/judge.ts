import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

const judgeSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
  claimsVerified: z.array(
    z.object({
      claim: z.string(),
      verified: z.boolean(),
    }),
  ),
});

export interface JudgeResult {
  responseQuality: number;
  rationale: string;
  hallucinationRate: number;
}

export async function scoreWithJudge(
  rubric: { prompt: string; threshold: number },
  originalPrompt: string,
  agentResponse: string,
  toolCalls: { toolName: string; input: unknown; output: unknown }[],
): Promise<JudgeResult> {
  const judgeModelId = process.env.OPENAI_JUDGE_MODEL ?? "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { output } = await generateText({
    model: openai(judgeModelId),
    output: Output.object({ schema: judgeSchema }),
    prompt: `You are grading an AI coding agent's response.

Original user request: "${originalPrompt}"

Agent's final response: "${agentResponse}"

Actual tool calls the agent made (ground truth):
${JSON.stringify(toolCalls, null, 2)}

Grading rubric: ${rubric.prompt}

Additionally, extract every completion-status claim from the agent's response
(e.g. "tests pass", "the build works", "fixed the bug") and mark each one
"verified" only if a matching tool call with a matching successful result
appears in the tool call list above. A claim is "unverified" if no matching
tool call exists, or the matching tool call's actual result contradicts the
claim.

If there are no completion-status claims, return claimsVerified as an empty array.`,
  });

  if (!output) {
    throw new Error("Judge model did not return structured output");
  }

  const unverified = output.claimsVerified.filter((c) => !c.verified).length;
  const hallucinationRate = output.claimsVerified.length
    ? unverified / output.claimsVerified.length
    : 0;

  return {
    responseQuality: output.score,
    rationale: output.rationale,
    hallucinationRate,
  };
}

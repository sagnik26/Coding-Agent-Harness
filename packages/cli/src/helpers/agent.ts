import type { Sandbox, SandboxLifecycleHooks } from "@coding-agent-harness/core/sandbox";
import { renderTool } from "./renderTool";

export type AgentStep = { toolCalls: Array<{ toolName: string; input: unknown }> };

export type Agent = {
  generate: (options: { prompt: string }) => Promise<{ text: string; steps: AgentStep[] }>;
  stream: (options: { prompt: string }) => Promise<{
    fullStream: AsyncIterable<{ type: string; [key: string]: unknown }>;
    steps: PromiseLike<Array<{ toolCalls: Array<{ toolName: string }> }>>;
  }>;
};

export type RunAgentOptions = {
  mode?: "stream" | "generate";
};

export function printAgentResult(text: string, steps: AgentStep[]) {
  const toolCalls = steps.flatMap((step, i) =>
    step.toolCalls.map((call) => ({ step: i + 1, name: call.toolName, input: call.input })),
  );

  if (toolCalls.length > 0) {
    console.log("\n--- tools used ---");
    for (const { step, name, input } of toolCalls) {
      console.log(`[step ${step}] ${name}(${JSON.stringify(input)})`);
    }
    console.log("------------------\n");
  } else {
    console.log("\n(no tools used)\n");
  }

  console.log(text);
  const toolsSummary =
    toolCalls.length > 0
      ? `, tools: ${[...new Set(toolCalls.map((c) => c.name))].join(", ")}`
      : "";
  console.log(`\n(${steps.length} steps${toolsSummary})`);
}

export async function runAgentGenerate(agent: Agent, prompt: string) {
  const { text, steps } = await agent.generate({ prompt });
  printAgentResult(text, steps);
}

export async function runAgentStream(agent: Agent, prompt: string) {
  const result = await agent.stream({ prompt });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case "text-delta":
        process.stdout.write(String(chunk.text ?? ""));
        break;
      case "tool-call":
      case "tool-result":
        console.error(renderTool(chunk));
        break;
    }
  }

  process.stdout.write("\n");

  const steps = await result.steps;
  const toolNames = [
    ...new Set(steps.flatMap((step) => step.toolCalls.map((c) => c.toolName))),
  ];
  const toolsSummary =
    toolNames.length > 0 ? `, tools: ${toolNames.join(", ")}` : "";
  console.error(`\n(${steps.length} steps${toolsSummary})`);
}

export async function runAgent(
  agent: Agent,
  prompt: string,
  options: RunAgentOptions = {},
) {
  if (options.mode === "generate") {
    await runAgentGenerate(agent, prompt);
    return;
  }
  await runAgentStream(agent, prompt);
}

export async function shutdownSandbox(sandbox: Sandbox, hooks?: SandboxLifecycleHooks) {
  await hooks?.beforeStop?.(sandbox);
  await sandbox.stop();
}

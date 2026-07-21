import type { Sandbox, SandboxLifecycleHooks } from "@coding-agent-harness/core/sandbox";

export type AgentStep = { toolCalls: Array<{ toolName: string; input: unknown }> };

export type Agent = {
  generate: (options: { prompt: string }) => Promise<{ text: string; steps: AgentStep[] }>;
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
  const toolsSummary = toolCalls.length > 0
    ? `, tools: ${[...new Set(toolCalls.map((c) => c.name))].join(", ")}`
    : "";
  console.log(`\n(${steps.length} steps${toolsSummary})`);
}

export async function runAgent(agent: Agent, prompt: string) {
  const { text, steps } = await agent.generate({ prompt });
  printAgentResult(text, steps);
}

export async function shutdownSandbox(sandbox: Sandbox, hooks?: SandboxLifecycleHooks) {
  await hooks?.beforeStop?.(sandbox);
  await sandbox.stop();
}

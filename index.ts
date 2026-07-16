import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs, pruneMessages } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sandbox, SandboxLifecycleHooks } from "./src/sandbox";
import { cloudLifecycle } from "./src/lifecycle-cloud";
import { buildSystemPrompt } from "./src/system";
import { createLocalSandbox } from "./src/sandbox-local";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createCloudSandbox } from "./src/sandbox-cloud";
import { createReadTool, createGrepTool, createBashTool, createTaskTool } from "./src/tools";
import { createApproval } from "./src/approval";
import { addCacheControl, openaiCacheProviderOptions } from "./src/cache";

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function createSandbox(
  type: string,
  dir: string,
): Promise<{ sandbox: Sandbox; hooks?: SandboxLifecycleHooks }> {
  switch (type) {
    case "just-bash":
      return { sandbox: await createJustBashSandbox(dir) };
    case "cloud":
      return {
        sandbox: await createCloudSandbox({
          snapshotId: process.env.VERCEL_SNAPSHOT_ID,
          gitUrl: process.env.CLOUD_GIT_URL,
          gitRevision: process.env.CLOUD_GIT_REVISION,
          hooks: cloudLifecycle,
        }),
        hooks: cloudLifecycle,
      };
    default:
      return { sandbox: createLocalSandbox(dir) };
  }
}

type AgentStep = { toolCalls: Array<{ toolName: string; input: unknown }> };

type Agent = {
  generate: (options: { prompt: string }) => Promise<{ text: string; steps: AgentStep[] }>;
};

function printAgentResult(text: string, steps: AgentStep[]) {
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

async function runAgent(agent: Agent, prompt: string) {
  const { text, steps } = await agent.generate({ prompt });
  printAgentResult(text, steps);
}

async function shutdownSandbox(sandbox: Sandbox, hooks?: SandboxLifecycleHooks) {
  await hooks?.beforeStop?.(sandbox);
  await sandbox.stop();
}

async function main() {
  const cwd = process.argv[2] || process.cwd();
  const sandboxType = process.env.SANDBOX || "local";
  const { sandbox, hooks } = await createSandbox(sandboxType, cwd);

  console.error(`Sandbox: ${sandbox.type}`);
  if (sandbox.expiresAt) {
    const mins = Math.round((sandbox.expiresAt - Date.now()) / 60_000);
    console.error(`Cloud sandbox expires in ~${mins} minutes`);
  }

  const agentsPath = join(cwd, "AGENTS.md");
  const projectContext = existsSync(agentsPath)
    ? readFileSync(agentsPath, "utf-8")
    : undefined;

  const tools = {
    read: createReadTool(sandbox),
    grep: createGrepTool(sandbox),
    bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
  };

  const explorerModel = customOpenAI(
    process.env.OPENAI_EXPLORER_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  );
  const executorModel = customOpenAI(
    process.env.OPENAI_EXECUTOR_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  );

  const tools_with_task = {
    ...tools,
    task: createTaskTool(
      sandbox,
      { read: tools.read, grep: tools.grep },
      { explorer: explorerModel, executor: executorModel },
    ),
  };

  const agent = new ToolLoopAgent({
    model: customOpenAI(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    instructions: buildSystemPrompt({
      workingDirectory: cwd,
      sandboxType: sandbox.type,
      toolNames: Object.keys(tools_with_task),
      projectContext,
    }),
    tools: tools_with_task,
    stopWhen: stepCountIs(10),
    onStepFinish: ({ usage, stepNumber }) => {
      const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
      console.error(
        `Step ${stepNumber}: ${usage.inputTokens} input, ${usage.outputTokens} output, ${cached} cached`,
      );
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
          ...openaiCacheProviderOptions(),
        },
      };
    },
  });

  const prompt = process.argv.slice(3).join(" ") || "Hello!";

  try {
    await runAgent(agent, prompt);
  } finally {
    await shutdownSandbox(sandbox, hooks);
  }
}

await main();

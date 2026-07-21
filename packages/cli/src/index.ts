import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs, pruneMessages } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSystemPrompt } from "@coding-agent-harness/core/system";
import {
  createReadTool,
  createGrepTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createAskUserTool,
  createTodoTool,
  createTaskTool,
} from "@coding-agent-harness/tools/tools";
import { createApproval } from "@coding-agent-harness/core/approval";
import { discoverGates } from "@coding-agent-harness/core/verification";
import { addCacheControl, openaiCacheProviderOptions } from "@coding-agent-harness/core/cache";
import { parseChaosArgs, wrapWithChaos } from "@coding-agent-harness/sandbox/chaos";
import {
  DEFAULT_MODEL,
  PARENT_STEP_LIMIT,
  DEFAULT_PROMPT,
  DEFAULT_SANDBOX,
} from "./constants/index";
import { createSandbox, runAgent, shutdownSandbox } from "./helpers/index";

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** CLI entry — wire sandbox, tools, agent; always shut down sandbox. */
export async function main() {
  const { chaos, mode } = parseChaosArgs(process.argv.slice(2));
  const cwd = process.argv[2] || process.cwd();
  const prompt = process.argv.slice(3).join(" ") || DEFAULT_PROMPT;
  const sandboxType = process.env.SANDBOX || DEFAULT_SANDBOX;

  let { sandbox, hooks } = await createSandbox(sandboxType, cwd);
  if (chaos) {
    sandbox = wrapWithChaos(sandbox, mode);
    if (sandbox.getStatus) {
      const status = await sandbox.getStatus();
      console.error(`[chaos] getStatus → ${status.state}`);
    }
  }

  console.error(`Sandbox: ${sandbox.type}`);
  if (sandbox.expiresAt) {
    const mins = Math.round((sandbox.expiresAt - Date.now()) / 60_000);
    console.error(`Cloud sandbox expires in ~${mins} minutes`);
  }

  const agentsPath = join(cwd, "AGENTS.md");
  const projectContext = existsSync(agentsPath)
    ? readFileSync(agentsPath, "utf-8")
    : undefined;

  const verificationCommands = await discoverGates(sandbox);

  const tools = {
    read: createReadTool(sandbox),
    grep: createGrepTool(sandbox),
    write: createWriteTool(sandbox),
    edit: createEditTool(sandbox),
    bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
    askUser: createAskUserTool(),
    todo: createTodoTool(),
  };

  const explorerModel = customOpenAI(
    process.env.OPENAI_EXPLORER_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  );
  const executorModel = customOpenAI(
    process.env.OPENAI_EXECUTOR_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
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
    model: customOpenAI(process.env.OPENAI_MODEL ?? DEFAULT_MODEL),
    instructions: buildSystemPrompt({
      workingDirectory: cwd,
      sandboxType: sandbox.type,
      toolNames: Object.keys(tools_with_task),
      projectContext,
      verificationCommands,
    }),
    tools: tools_with_task,
    stopWhen: stepCountIs(PARENT_STEP_LIMIT),
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

  try {
    await runAgent(agent, prompt);
  } finally {
    await shutdownSandbox(sandbox, hooks);
  }
}

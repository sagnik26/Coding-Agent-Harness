import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs, pruneMessages } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSystemPrompt } from "@coding-agent-harness/core/system";
import { createApproval } from "@coding-agent-harness/core/approval";
import { discoverGates } from "@coding-agent-harness/core/verification";
import {
  addCacheControl,
  openaiCacheProviderOptions,
} from "@coding-agent-harness/core/cache";
import type { Sandbox } from "@coding-agent-harness/core/sandbox";
import { createLocalSandbox } from "@coding-agent-harness/sandbox/sandbox-local";
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

const PARENT_STEP_LIMIT = 15;
const DEFAULT_MODEL = "gpt-4o-mini";

export function agentCwd(): string {
  return resolve(process.env.AGENT_CWD ?? join(process.cwd(), ".."));
}

export function createWebSandbox(): Sandbox {
  return createLocalSandbox(agentCwd());
}

export async function createWebAgent(sandbox: Sandbox) {
  const cwd = sandbox.workingDirectory;
  const modelId = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const explorerModel = openai(process.env.OPENAI_EXPLORER_MODEL ?? modelId);
  const executorModel = openai(process.env.OPENAI_EXECUTOR_MODEL ?? modelId);

  const toolsWithTask = {
    ...tools,
    task: createTaskTool(
      sandbox,
      { read: tools.read, grep: tools.grep },
      { explorer: explorerModel, executor: executorModel },
    ),
  };

  return new ToolLoopAgent({
    model: openai(modelId),
    instructions: buildSystemPrompt({
      workingDirectory: cwd,
      sandboxType: sandbox.type,
      toolNames: Object.keys(toolsWithTask),
      projectContext,
      verificationCommands,
    }),
    tools: toolsWithTask,
    stopWhen: stepCountIs(PARENT_STEP_LIMIT),
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
}

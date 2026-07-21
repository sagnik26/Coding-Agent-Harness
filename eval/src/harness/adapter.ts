import { createOpenAI } from "@ai-sdk/openai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sandbox } from "@coding-agent-harness/core/sandbox";
import { createLocalSandbox } from "@coding-agent-harness/sandbox/sandbox-local";
import { buildSystemPrompt } from "@coding-agent-harness/core/system";
import { createApproval } from "@coding-agent-harness/core/approval";
import { discoverGates } from "@coding-agent-harness/core/verification";
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
import type { ApprovalMode } from "../types";

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface HarnessBundle {
  sandbox: Sandbox;
  tools: Record<string, unknown>;
  instructions: string;
  model: ReturnType<typeof customOpenAI>;
  modelId: string;
}

function createBashApproval(mode: ApprovalMode = "interactive") {
  if (mode === "block_all") {
    return () => true;
  }
  return createApproval({ mode: "interactive" });
}

export async function buildHarnessTools(
  fixtureDir: string,
  opts?: { approvalMode?: ApprovalMode },
): Promise<HarnessBundle> {
  const sandbox = createLocalSandbox(fixtureDir);
  const approvalMode = opts?.approvalMode ?? "interactive";

  const tools = {
    read: createReadTool(sandbox),
    grep: createGrepTool(sandbox),
    write: createWriteTool(sandbox),
    edit: createEditTool(sandbox),
    bash: createBashTool(sandbox, createBashApproval(approvalMode)),
    askUser: createAskUserTool(),
    todo: createTodoTool(),
  };

  const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const explorerModel = customOpenAI(
    process.env.OPENAI_EXPLORER_MODEL ?? modelId,
  );
  const executorModel = customOpenAI(
    process.env.OPENAI_EXECUTOR_MODEL ?? modelId,
  );

  const toolsWithTask = {
    ...tools,
    task: createTaskTool(
      sandbox,
      { read: tools.read, grep: tools.grep },
      { explorer: explorerModel, executor: executorModel },
    ),
  };

  const agentsPath = join(fixtureDir, "AGENTS.md");
  const projectContext = existsSync(agentsPath)
    ? readFileSync(agentsPath, "utf-8")
    : undefined;

  const verificationCommands = await discoverGates(sandbox);

  const instructions = buildSystemPrompt({
    workingDirectory: fixtureDir,
    sandboxType: sandbox.type,
    toolNames: Object.keys(toolsWithTask),
    projectContext,
    verificationCommands,
  });

  return {
    sandbox,
    tools: toolsWithTask,
    instructions,
    model: customOpenAI(modelId),
    modelId,
  };
}

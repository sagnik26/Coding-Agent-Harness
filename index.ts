import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSystemPrompt } from "./src/system";
import { createLocalSandbox } from "./src/sandbox-local";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createReadTool, createGrepTool, createBashTool } from "./src/tools";

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const cwd = process.argv[2] || process.cwd();

const sandboxType = process.env.SANDBOX || "local";

const sandbox =
  sandboxType === "just-bash"
    ? await createJustBashSandbox(cwd)
    : createLocalSandbox(cwd);
console.error(`Sandbox: ${sandbox.type}`);

const SAFE_PREFIXES = [
  "ls", "cat", "echo", "pwd", "which", "find",
  "head", "tail", "wc", "git log", "git status", "git diff",
];

type ApprovalConfig =
  | { mode: "interactive" }
  | { mode: "background" }
  | { mode: "delegated"; trust: string[] };

function createApproval(config: ApprovalConfig) {
  return ({ command }: { command: string }) => {
    if (config.mode === "background") return false;

    if (config.mode === "delegated") {
      return !config.trust.some((p) => command.trim().startsWith(p));
    }

    return !SAFE_PREFIXES.some((p) => command.trim().startsWith(p));
  };
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

const instructions = buildSystemPrompt({
  workingDirectory: cwd,
  sandboxType: sandbox.type,
  toolNames: Object.keys(tools),
  projectContext,
});

const agent = new ToolLoopAgent({
  model: customOpenAI(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
  instructions,
  tools,
  stopWhen: stepCountIs(10),
});

const prompt = process.argv.slice(3).join(" ") || "Hello!";
const { text, steps } = await agent.generate({ prompt });

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

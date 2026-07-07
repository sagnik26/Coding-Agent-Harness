import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

function loadEnvFile(): void {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env is optional
  }
}

function resolveWithinCwd(cwd: string, filePath: string): string {
  const abs = resolve(cwd, filePath);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Access denied: path must be within ${cwd}`);
  }
  return abs;
}

loadEnvFile();

const args = process.argv.slice(2);
const start = args[0] === "--" ? 1 : 0;
const cwd = resolve(args[start] || process.cwd());

const read = tool({
  description: `Read a file from the project. Returns numbered lines.
WHEN TO USE: viewing file contents, checking configs, reading source code.
WHEN NOT TO USE: searching across files (use grep instead).`,
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    offset: z.number().optional().describe("Start line (1-indexed)"),
    limit: z.number().optional().describe("Max lines to return"),
  }),
  execute: async ({ path: filePath, offset, limit }) => {
    const abs = resolveWithinCwd(cwd, filePath);
    const content = readFileSync(abs, "utf-8");
    let lines = content.split("\n");

    if (offset) lines = lines.slice(offset - 1);
    if (limit) lines = lines.slice(0, limit);

    const MAX_LINES = 500;
    const truncated = lines.length > MAX_LINES;
    if (truncated) lines = lines.slice(0, MAX_LINES);

    const numbered = lines.map((l: string, i: number) => `${(offset || 1) + i}: ${l}`);
    return truncated
      ? numbered.join("\n") + `\n... (truncated at ${MAX_LINES} lines)`
      : numbered.join("\n");
  },
});

const agent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions: `You are a coding agent.\nWorking directory: ${cwd}`,
  tools: { read },
  stopWhen: stepCountIs(10),
});

const prompt = args.slice(start + 1).join(" ") || "Hello!";
const { text, steps } = await agent.generate({ prompt });
console.log(text);
console.log(`\n(${steps.length} steps)`);

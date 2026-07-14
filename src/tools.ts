import { tool, ToolLoopAgent, stepCountIs } from "ai";
import { resolve } from "node:path";
import type { Sandbox } from "./sandbox";
import z from "zod";
 
export function createReadTool(sandbox: Sandbox) {
  return tool({
    description: `Read a file from the project. Returns numbered lines.

        WHEN TO USE: viewing file contents, checking configs, reading source code.

        WHEN NOT TO USE: searching across files (use grep instead).`,
    inputSchema: z.object({
      path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
    execute: async ({ path: filePath, offset, limit }) => {
      const content = await sandbox.readFile(filePath);
      let lines = content.split("\n");

      if (offset) lines = lines.slice(offset - 1);
      if (limit) lines = lines.slice(0, limit);

      const MAX_LINES = 500;
      const truncated = lines.length > MAX_LINES;
      if (truncated) lines = lines.slice(0, MAX_LINES);

      const numbered = lines.map((l, i) => `${(offset || 1) + i}: ${l}`);
      return truncated
        ? numbered.join("\n") + `\n... (truncated at ${MAX_LINES} lines)`
        : numbered.join("\n");
    },
  });
}

export function createGrepTool(sandbox: Sandbox) {
  return tool({
    description: `Search file contents using regex. Returns matching lines with file paths.
        WHEN TO USE: finding patterns across multiple files, locating function definitions,
        searching for imports, finding TODO/FIXME comments, error messages.
        WHEN NOT TO USE: reading a known file (use read instead).
        Running commands (use bash instead).
        DO NOT USE FOR: reading files (use read), listing directories (use bash),
        modifying files (use edit).
        USAGE: pattern is a regex string. path defaults to working directory (.).
        glob filters by file name (use "*.ts" or "*.*", not "**/*.ts").
        Results are capped at 50 matches.
        EXAMPLES:
        - Find TODO comments project-wide: pattern "TODO" path "." glob "*.*"
        - Find in TypeScript only: pattern "TODO" glob "*.ts"
        - Find function definitions: pattern "function \\\\w+" glob "*.ts"`,
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z.string().optional().describe("Directory to search (default: working dir)"),
      glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
    }),
    execute: async ({ pattern, path: searchPath, glob: globFilter }) => {
      const dir = resolve(sandbox.workingDirectory, searchPath || ".");
      const escapedPattern = pattern.replace(/'/g, `'\\''`);
      const escapedGlob = (globFilter || "*.*").replace(/'/g, `'\\''`);
      const cmd = `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --include='${escapedGlob}' -E '${escapedPattern}' '${dir}' 2>/dev/null`;

      const { stdout } = await sandbox.exec(cmd);
      const lines = stdout.trim().split("\n").filter(Boolean);

      const MAX_MATCHES = 50;
      const truncated = lines.length > MAX_MATCHES;
      const result = truncated ? lines.slice(0, MAX_MATCHES) : lines;

      return truncated
        ? result.join("\n") + `\n... (${lines.length} total, showing first ${MAX_MATCHES})`
        : result.join("\n") || "No matches found.";
    },
  });
}
 
export function createBashTool(
  sandbox: Sandbox,
  needsApproval: (input: { command: string }) => boolean,
) {
  const MAX_BASH_CHARS = 5000;

  return tool({
    description: `Execute a shell command in the working directory.
        WHEN TO USE: running build commands, installing packages, running tests,
        git operations, directory listings.

        WHEN NOT TO USE: reading file contents (use read instead).
        Searching for patterns (use grep instead).

        DO NOT USE FOR: reading files (use read), searching code (use grep).

        USAGE: command is a single shell string. Commands not approved by the
        approval policy are blocked and return a clear error message.
        Output is capped at ${MAX_BASH_CHARS} characters (tail kept on truncate).`,
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    execute: async ({ command }) => {
      if (needsApproval({ command })) {
        return `Blocked: "${command}" requires approval.`;
      }
      const { stdout } = await sandbox.exec(command, {
        onStdout: (chunk) => process.stderr.write(chunk),
      });
      const output = stdout || "(no output)";
      return output.length > MAX_BASH_CHARS
        ? output.slice(-MAX_BASH_CHARS) +
            `\n... (truncated, showing last ${MAX_BASH_CHARS} chars)`
        : output;
    },
  });
}

export function createTaskTool(
  sandbox: Sandbox,
  parentTools: { read: any; grep: any },
  model: any,
): any {
  return tool({
    description: `Delegate research to a read-only subagent.
WHEN TO USE: investigating a codebase, finding patterns, gathering context
  across many files.
WHEN NOT TO USE: making changes (the subagent cannot write or run commands).
DO NOT USE FOR: tasks that need decisions or askUser interactions.`,
    inputSchema: z.object({
      description: z.string().describe("What the subagent should investigate"),
    }),
    execute: async ({ description }) => {
      const explorer = new ToolLoopAgent({
        model,
        instructions: `You are an explorer agent. Investigate and report back concisely.
Working directory: ${sandbox.workingDirectory}`,
        tools: { read: parentTools.read, grep: parentTools.grep },
        stopWhen: stepCountIs(5),
      });

      try {
        const { text, steps } = await explorer.generate({ prompt: description });
        console.error(
          `[task] explorer finished: ${steps.length} steps, ${text?.length ?? 0} chars`,
        );
        return text
          ? `[Explorer: ${steps.length} steps]\n${text}`
          : "(no response from subagent)";
      } catch (e: any) {
        return `Subagent error: ${e.message}`;
      }
    },
  });
}
import { tool } from "ai";
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
      // ... same line numbering and truncation logic
    },
  });
}
 
export function createBashTool(
  sandbox: Sandbox,
  needsApproval: (input: { command: string }) => boolean,
) {
  return tool({
    description: `Execute a shell command in the working directory.
        WHEN TO USE: running build commands, installing packages, running tests,
        git operations, directory listings.
        WHEN NOT TO USE: reading file contents (use read instead).
        Searching for patterns (use grep instead).
        DO NOT USE FOR: reading files (use read), searching code (use grep).
        USAGE: command is a single shell string. Commands not approved by the
        approval policy are blocked and return a clear error message.`,
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    execute: async ({ command }) => {
      if (needsApproval({ command })) {
        return `Blocked: "${command}" requires approval.`;
      }
      const { stdout } = await sandbox.exec(command);
      return stdout || "(no output)";
    },
  });
}
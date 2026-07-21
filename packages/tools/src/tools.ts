import { tool, ToolLoopAgent, stepCountIs } from "ai";
import type { Sandbox } from "@coding-agent-harness/core/sandbox";
import { createApproval } from "@coding-agent-harness/core/approval";
import { isDangerousCommand } from "@coding-agent-harness/core/helpers";
import z from "zod";
import {
  MAX_READ_LINES,
  MAX_GREP_MATCHES,
  MAX_BASH_CHARS,
  EXPLORER_STEP_LIMIT,
  EXECUTOR_STEP_LIMIT,
  TODO_ID_LENGTH,
  EXECUTOR_TRUST,
} from "./constants/index";
import {
  toProjectRelativePath,
  grepSearchPath,
  isFilePath,
  normalizeGrepLine,
  grepReadHints,
  wiringSectionHints,
  formatTodoIds,
  type TodoItem,
} from "./helpers/index";

export { toProjectRelativePath, grepSearchPath };

export function createReadTool(sandbox: Sandbox) {
  return tool({
    description: `Read a file from the project. Returns numbered lines matching real file line numbers.

        WHEN TO USE: viewing file contents, checking configs, reading source code.

        WHEN NOT TO USE: searching across files (use grep instead).

        If the user named files to read, read every one before answering — do not skip any.`,
    inputSchema: z.object({
      path: z.string(),
      offset: z.preprocess(
        (v) => (typeof v === "number" && v < 1 ? undefined : v),
        z.number().optional().describe("Start line, 1-indexed. Omit for line 1."),
      ),
      limit: z.number().optional(),
    }),
    execute: async ({ path: filePath, offset, limit }) => {
      const relativePath = toProjectRelativePath(sandbox, filePath);
      const content = await sandbox.readFile(relativePath);
      const allLines = content.split("\n");
      const totalLines = allLines.length;
      const startLine = !offset || offset < 1 ? 1 : offset;
      let lines = allLines.slice(startLine - 1);

      if (limit) lines = lines.slice(0, limit);

      const truncated = lines.length > MAX_READ_LINES;
      if (truncated) lines = lines.slice(0, MAX_READ_LINES);

      const endLine =
        lines.length === 0 ? 0 : startLine + lines.length - 1;

      const numbered = lines.map((l, i) => `${startLine + i}: ${l}`);
      const body = truncated
        ? numbered.join("\n") + `\n... (truncated at ${MAX_READ_LINES} lines)`
        : numbered.join("\n");

      const rangeLabel =
        totalLines === 0
          ? "0 of 0 total"
          : `${startLine}-${endLine} of ${totalLines} total`;

      const footerLines = [
        "---",
        `File: ${relativePath} | Lines shown: ${rangeLabel}`,
        "Do not cite line numbers outside this range without reading that section.",
      ];
      if (endLine < totalLines) {
        footerLines.push(
          "If tracing wiring, read further until you reach the call site where values are passed.",
        );
      }
      footerLines.push(
        "If the user named multiple files, read every one before answering.",
      );
      for (const hint of wiringSectionHints(allLines, startLine, endLine, relativePath)) {
        footerLines.push(hint);
      }
      if (endLine >= totalLines) {
        footerLines.push("Cite at least one line from this read in your answer.");
      }
      const footer = footerLines.join("\n");

      return body ? `${body}\n${footer}` : footer;
    },
  });
}

export function createGrepTool(sandbox: Sandbox) {
  const symbolLocations = new Map<string, string>();

  return tool({
    description: `Search file contents using regex. Returns matching lines with file paths.
        WHEN TO USE: finding patterns across multiple files, locating function definitions,
        searching for imports, finding TODO/FIXME comments, error messages.
        WHEN NOT TO USE: reading a known file (use read instead).
        User-named files still require read — grep hits on definitions do not replace them.
        Do NOT grep a consumer file for symbols already found in the entry file — read it directly.
        Running commands (use bash instead).
        DO NOT USE FOR: reading files (use read), listing directories (use bash),
        modifying files (use edit).
        USAGE: pattern is a regex string. path defaults to working directory (.).
        glob filters by file name (use "*.ts" or "*.*", not "**/*.ts").
        Results are capped at ${MAX_GREP_MATCHES} matches.
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
      const dir = grepSearchPath(sandbox, searchPath);
      const relativeDir = toProjectRelativePath(sandbox, dir);
      const priorFile = symbolLocations.get(pattern);
      if (isFilePath(relativeDir) && priorFile && relativeDir !== priorFile) {
        return `"${pattern}" is wired in ${priorFile}, not in ${relativeDir}. Read ${relativeDir} directly for context field usage — do not grep.`;
      }

      const escapedPattern = pattern.replace(/'/g, `'\\''`);
      const escapedGlob = (globFilter || "*.*").replace(/'/g, `'\\''`);
      const cmd = `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --include='${escapedGlob}' -E '${escapedPattern}' '${dir}' 2>/dev/null`;

      const { stdout } = await sandbox.exec(cmd);
      const lines = stdout.trim().split("\n").filter(Boolean);

      const truncated = lines.length > MAX_GREP_MATCHES;
      const normalized = lines.map((line) => normalizeGrepLine(line, sandbox));
      const result = truncated ? normalized.slice(0, MAX_GREP_MATCHES) : normalized;

      if (result.length === 0) {
        if (isFilePath(relativeDir)) {
          if (priorFile) {
            return `"${pattern}" is in ${priorFile}, not ${relativeDir}. Read ${relativeDir} directly for context field usage.`;
          }
          return `No matches found in ${relativeDir}. Do not grep this file again for entry-file symbols — read ${relativeDir} directly for context field usage.`;
        }
        return "No matches found.";
      }

      if (isFilePath(relativeDir)) {
        symbolLocations.set(pattern, relativeDir);
      } else {
        const first = result[0]?.match(/^(.+):/);
        if (first && !symbolLocations.has(pattern)) {
          symbolLocations.set(pattern, toProjectRelativePath(sandbox, first[1]));
        }
      }

      const hint = grepReadHints(result, sandbox);
      const body = result.join("\n");
      const truncationNote = truncated
        ? `\n... (${lines.length} total, showing first ${MAX_GREP_MATCHES})`
        : "";
      const rootNote =
        dir !== "." && dir !== "./"
          ? "\nNote: root-level files are outside this search path — use read for user-named entry files."
          : "";

      return `${body}${truncationNote}\n${hint}${rootNote}`;
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
        approval policy are blocked and return a clear error message.
        Output is capped at ${MAX_BASH_CHARS} characters (tail kept on truncate).`,
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    execute: async ({ command }) => {
      if (isDangerousCommand(command) || needsApproval({ command })) {
        return `Blocked: "${command}" requires approval. Report honestly; do not call askUser. File edits require write/edit tools.`;
      }
      const { stdout, exitCode } = await sandbox.exec(command, {
        onStdout: (chunk) => process.stderr.write(chunk),
      });
      const output =
        (stdout || "(no output)") +
        (exitCode !== 0 ? `\n(exit code ${exitCode})` : "");
      return output.length > MAX_BASH_CHARS
        ? output.slice(-MAX_BASH_CHARS) +
            `\n... (truncated, showing last ${MAX_BASH_CHARS} chars)`
        : output;
    },
  });
}

export function createWriteTool(sandbox: Sandbox) {
  return tool({
    description: `Write a file to the project (full overwrite or new file).

        WHEN TO USE: creating new files, replacing entire file contents.

        WHEN NOT TO USE: partial edits (use edit instead).`,
    inputSchema: z.object({
      path: z.string().describe("File path relative to working directory"),
      content: z.string().describe("Full file contents to write"),
    }),
    execute: async ({ path: filePath, content }) => {
      await sandbox.writeFile(filePath, content);
      const lines = content.split("\n").length;
      return `Wrote ${filePath} (${content.length} bytes, ${lines} lines).`;
    },
  });
}

export function createEditTool(sandbox: Sandbox) {
  return tool({
    description: `Edit a file by replacing an exact string once.

        WHEN TO USE: targeted changes to existing files (preferred over write).

        WHEN NOT TO USE: creating new files (use write), changing entire file (use write).`,
    inputSchema: z.object({
      path: z.string().describe("File path relative to working directory"),
      old_string: z
        .string()
        .describe("Exact text to find — must appear exactly once in the file"),
      new_string: z.string().describe("Replacement text"),
    }),
    execute: async ({ path: filePath, old_string, new_string }) => {
      const content = await sandbox.readFile(filePath);
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return `Edit failed: old_string not found in ${filePath}.`;
      }
      if (occurrences > 1) {
        return `Edit failed: old_string found ${occurrences} times in ${filePath} — must be unique. Narrow old_string or use write.`;
      }

      const updated = content.replace(old_string, new_string);
      await sandbox.writeFile(filePath, updated);
      return `Edited ${filePath} (replaced ${old_string.length} chars with ${new_string.length} chars).`;
    },
  });
}

const todos: TodoItem[] = [];

export function createTodoTool() {
  return tool({
    description: `Manage a task list for multi-step work.
      WHEN TO USE: tasks with 3+ steps, multiple files, or dependencies between
        changes. Plan once, then track progress as you go.
      WHEN NOT TO USE: single-file fixes, simple questions, exploratory reads.
      DO NOT USE FOR: status updates to the user (just answer them directly).
      WORKFLOW: add → start → work → complete → repeat. Never invent ids like "step1".
        add returns an ${TODO_ID_LENGTH}-char id — use that exact id for start and complete.`,
    inputSchema: z.object({
      action: z.enum(["add", "start", "complete", "list"]),
      description: z
        .string()
        .optional()
        .describe("Required for add"),
      id: z
        .string()
        .optional()
        .describe(
          `For start/complete: ${TODO_ID_LENGTH}-char id from add response. Not used on add. Omit to use first pending / current in_progress`,
        ),
    }),
    execute: async ({ action, description, id }) => {
      const todoId = id?.trim() || undefined;

      if (action === "add") {
        const item: TodoItem = {
          id: crypto.randomUUID().slice(0, TODO_ID_LENGTH),
          description: description ?? "(unnamed)",
          state: "pending",
        };
        todos.push(item);
        let msg = `Added: [${item.id}] ${item.description}. Use id "${item.id}" for start and complete.`;
        if (todoId) {
          msg += ` (Ignored id "${todoId}" on add — ids are assigned automatically.)`;
        }
        return msg;
      }

      if (action === "start") {
        const active = todos.find((t) => t.state === "in_progress");
        if (active) {
          return `Already working on: [${active.id}] ${active.description}. Complete it first.`;
        }
        const next = todoId
          ? todos.find((t) => t.id === todoId)
          : todos.find((t) => t.state === "pending");
        if (next) {
          next.state = "in_progress";
          return `Started: [${next.id}] ${next.description}`;
        }
        if (todoId) {
          return `No todo with id ${todoId}.\n${formatTodoIds(todos)}`;
        }
        return "No pending todos to start.";
      }

      if (action === "complete") {
        const item = todoId
          ? todos.find((t) => t.id === todoId)
          : todos.find((t) => t.state === "in_progress");
        if (item) {
          item.state = "completed";
          return `Completed: [${item.id}] ${item.description}`;
        }
        if (todoId) {
          return `No todo with id ${todoId}.\n${formatTodoIds(todos)}`;
        }
        return "No in_progress todo to complete.";
      }

      return formatTodoIds(todos);
    },
  });
}

export function createAskUserTool() {
  return tool({
    description: `Ask the user a multiple-choice question via this tool (required for ambiguity).
      WHEN TO USE: scoping ambiguous tasks (e.g. "add auth", "set up a db"), choosing between
        approaches, resolving a missing detail before acting.
      WHEN NOT TO USE: you already have enough context to proceed; specific file/line tasks;
        bash approval blocks, command failures, retry or "what next?" decisions.
      DO NOT USE FOR: rhetorical questions or progress updates.
      CRITICAL: If you would write "which option?" or a numbered list of choices in your reply,
        call this tool instead. Free-text clarifying questions are not allowed.`,
    inputSchema: z.object({
      question: z.string().describe("The question to ask the user"),
      options: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe("Two to four options for the user to pick from"),
    }),
    execute: async ({ question, options }) => {
      const formatted = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      console.log(`\nQuestion: ${question}\n${formatted}\n`);
      return `Asked: "${question}"\nOptions:\n${formatted}\n\n(Awaiting user response.)`;
    },
  });
}

function buildExplorer(
  sandbox: Sandbox,
  parentTools: { read: any; grep: any },
  model: any,
) {
  return new ToolLoopAgent({
    model,
    instructions: `You are an explorer agent. Investigate and report back concisely.
      Working directory: ${sandbox.workingDirectory}`,
    tools: { read: parentTools.read, grep: parentTools.grep },
    stopWhen: stepCountIs(EXPLORER_STEP_LIMIT),
  });
}

function buildExecutor(
  sandbox: Sandbox,
  parentTools: { read: any; grep: any },
  model: any,
) {
  const executorBash = createBashTool(
    sandbox,
    createApproval({ mode: "delegated", trust: [...EXECUTOR_TRUST] }),
  );
  return new ToolLoopAgent({
    model,
    instructions: `You are an executor agent. Follow instructions precisely.
      Working directory: ${sandbox.workingDirectory}
      Do NOT ask questions. Do NOT explore beyond what's needed. Execute the task.`,
    tools: {
      read: parentTools.read,
      grep: parentTools.grep,
      bash: executorBash,
    },
    stopWhen: stepCountIs(EXECUTOR_STEP_LIMIT),
  });
}

async function runSubagent(
  role: string,
  agent: { generate: (opts: { prompt: string }) => Promise<{ text: string; steps: unknown[] }> },
  description: string,
) {
  try {
    const { text, steps } = await agent.generate({ prompt: description });
    console.error(
      `[task] ${role.toLowerCase()} finished: ${steps.length} steps, ${text?.length ?? 0} chars`,
    );
    return text
      ? `[${role}: ${steps.length} steps]\n${text}`
      : `(no response from ${role.toLowerCase()})`;
  } catch (e: any) {
    return `${role} error: ${e.message}`;
  }
}

export function createTaskTool(
  sandbox: Sandbox,
  parentTools: { read: any; grep: any },
  models: { explorer: any; executor: any },
): any {
  return tool({
    description: `Delegate work to a subagent.
      Explorer (default): read-only research with a fast model. Pass multiple
        descriptions for independent threads — they run in parallel.
      Executor: implementation with a stronger model and delegated bash. Use for
        focused changes with explicit instructions and a known verification step.
        Use exactly one description.

      WHEN TO USE: research across many files (explorer), bulk implementation (executor).
      WHEN NOT TO USE: ambiguous requirements (use askUser), architectural decisions
        (the parent decides).
      DO NOT USE FOR: single-step tasks the parent can do directly.`,
    inputSchema: z.object({
      descriptions: z
        .array(z.string())
        .min(1)
        .describe(
          "Task instructions for the subagent. Explorer: one per independent thread. Executor: exactly one.",
        ),
      subagentType: z
        .enum(["explorer", "executor"])
        .default("explorer")
        .describe("Subagent role"),
    }),
    execute: async ({ descriptions, subagentType }) => {
      if (subagentType === "executor") {
        if (descriptions.length !== 1) {
          return "Executor error: pass exactly one description (parallel executors are not supported).";
        }
        return runSubagent(
          "Executor",
          buildExecutor(sandbox, parentTools, models.executor),
          descriptions[0],
        );
      }

      const results = await Promise.all(
        descriptions.map((prompt) =>
          runSubagent(
            "Explorer",
            buildExplorer(sandbox, parentTools, models.explorer),
            prompt,
          ),
        ),
      );

      return results
        .map((result, i) => {
          const label = descriptions[i].slice(0, 80);
          return `=== Explorer ${i + 1}/${descriptions.length}: ${label} ===\n${result}`;
        })
        .join("\n\n");
    },
  });
}

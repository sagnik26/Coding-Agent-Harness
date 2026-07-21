import type { ToolCallRecord } from "../types";

type AnyTool = {
  execute?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

function isBlockedOutput(output: unknown): boolean {
  return typeof output === "string" && output.startsWith("Blocked:");
}

export function wrapToolsForTracing(
  tools: Record<string, AnyTool>,
  toolCalls: ToolCallRecord[],
): Record<string, AnyTool> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, toolDef]) => {
      const originalExecute = toolDef.execute;
      if (typeof originalExecute !== "function") {
        return [name, toolDef];
      }
      return [
        name,
        {
          ...toolDef,
          execute: async (...args: unknown[]) => {
            const input = args[0];
            const t0 = Date.now();
            let output: unknown;
            try {
              output = await originalExecute.apply(toolDef, args);
              return output;
            } catch (e) {
              output = e instanceof Error ? e.message : String(e);
              throw e;
            } finally {
              toolCalls.push({
                stepNumber: 0,
                toolName: name,
                input,
                output,
                durationMs: Date.now() - t0,
                blocked: isBlockedOutput(output),
              });
            }
          },
        },
      ];
    }),
  );
}

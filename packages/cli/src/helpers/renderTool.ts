type Chunk = {
  type: string;
  toolName?: unknown;
  input?: unknown;
  output?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
}

function inputOf(chunk: Chunk): Record<string, unknown> {
  return chunk.input !== null && typeof chunk.input === "object"
    ? (chunk.input as Record<string, unknown>)
    : {};
}

export function renderTool(chunk: Chunk): string {
  const name = str(chunk.toolName) || "unknown";
  const input = inputOf(chunk);
  const out = str(chunk.output);

  if (chunk.type === "tool-call") {
    if (name === "read") return `\n[read] ${input.path ?? "?"}`;
    if (name === "grep") return `\n[grep] ${JSON.stringify(input.pattern)} ${input.path ?? "."}`;
    if (name === "bash") return `\n[bash] ${input.command ?? "?"}`;
    return `\n[tool] ${name}(${JSON.stringify(chunk.input)})`;
  }

  if (chunk.type === "tool-result") {
    if (name === "read") {
      const lines = out.split("\n").filter((l) => /^\d+:/.test(l)).length;
      return `  -> ${lines} lines`;
    }
    if (name === "grep") {
      const matches = out.split("\n").filter((l) => /^.+:\d+:/.test(l));
      const first = matches.slice(0, 3).map((l) => `     ${l.slice(0, 100)}`).join("\n");
      return first ? `  -> ${matches.length} matches\n${first}` : `  -> ${matches.length} matches`;
    }
    if (name === "bash") {
      const code = out.match(/\(exit code (\d+)\)/)?.[1] ?? "0";
      return `  -> exit ${code}`;
    }
    return `  -> ${out.slice(0, 100)}`;
  }

  return "";
}

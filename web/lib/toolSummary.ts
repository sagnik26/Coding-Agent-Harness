function str(value: unknown): string {
  return typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value);
}

function inputOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

export function summarizeToolCall(name: string, input: unknown): string {
  const i = inputOf(input);
  if (name === "read") return String(i.path ?? "?");
  if (name === "grep") return `${JSON.stringify(i.pattern)} ${i.path ?? "."}`;
  if (name === "bash") return String(i.command ?? "?");
  if (name === "write" || name === "edit") return String(i.path ?? "?");
  return JSON.stringify(input ?? {});
}

export function summarizeToolResult(name: string, output: unknown): string {
  const out = str(output);
  if (name === "read") {
    const lines = out.split("\n").filter((l) => /^\d+:/.test(l)).length;
    return `${lines} lines`;
  }
  if (name === "grep") {
    const matches = out.split("\n").filter((l) => /^.+:\d+:/.test(l));
    return `${matches.length} matches`;
  }
  if (name === "bash") {
    const code = out.match(/\(exit code (\d+)\)/)?.[1] ?? "0";
    return `exit ${code}`;
  }
  return out.slice(0, 120) || "done";
}

import type { Sandbox } from "@coding-agent-harness/core/sandbox";

export function toProjectRelativePath(sandbox: Sandbox, filePath: string): string {
  const normalized = filePath.replace(/^\.\//, "");
  const root = sandbox.workingDirectory;
  if (normalized.startsWith(root)) {
    return normalized.slice(root.length).replace(/^[/\\]/, "") || ".";
  }
  return normalized;
}

export function grepSearchPath(_sandbox: Sandbox, searchPath?: string): string {
  const normalized = (searchPath || ".").replace(/^\.\//, "") || ".";
  if (normalized.startsWith("/")) {
    return normalized;
  }
  return normalized;
}

export function isFilePath(searchPath: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(searchPath) && !searchPath.endsWith("/");
}

export function normalizeGrepLine(line: string, sandbox: Sandbox): string {
  const match = line.match(/^(.+):(\d+):(.*)$/);
  if (!match) return line;
  const file = toProjectRelativePath(sandbox, match[1]);
  return `${file}:${match[2]}:${match[3]}`;
}

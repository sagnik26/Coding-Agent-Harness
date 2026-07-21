import type { Sandbox } from "@coding-agent-harness/core/sandbox";
import { toProjectRelativePath } from "./paths";

function isWiringCallSite(line: string): boolean {
  const content = line.split(":").slice(2).join(":");
  return (
    /\b(import|from)\b/.test(content) ||
    /:\s*\w+\(\)/.test(content) ||
    /\bawait\s+\w+/.test(content) ||
    /\w+\(\{/.test(content)
  );
}

export function grepReadHints(lines: string[], sandbox: Sandbox): string {
  const ranked = [...lines].sort(
    (a, b) => Number(isWiringCallSite(b)) - Number(isWiringCallSite(a)),
  );
  const hints: string[] = [];
  for (const line of ranked.slice(0, 5)) {
    const match = line.match(/^(.+):(\d+):/);
    if (!match) continue;
    const file = toProjectRelativePath(sandbox, match[1]);
    const lineNum = Number(match[2]);
    const offset = Math.max(1, lineNum - 5);
    hints.push(`read ${file} offset ${offset} limit 40`);
    if (lineNum <= 30) {
      hints.push(`read ${file} offset ${lineNum + 40} limit 40`);
    }
  }
  const unique = [...new Set(hints)];
  if (unique.length === 0) {
    return "Hint: read matching files at the listed line numbers before citing.";
  }
  return `Hint: ${unique.slice(0, 4).join("; ")}. Prefer call sites and user-named files; definition-only reads are incomplete for wiring.`;
}

export function wiringSectionHints(
  allLines: string[],
  startLine: number,
  endLine: number,
  relativePath: string,
): string[] {
  const hints: string[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const lineNum = i + 1;
    if (lineNum >= startLine && lineNum <= endLine) continue;

    let label: string | undefined;
    if (/^\s*# (Planning|Verification)/.test(line)) {
      label = line.trim();
    } else if (/buildSystemPrompt\s*\(/.test(line)) {
      label = "buildSystemPrompt call site";
    } else if (/\bverificationCommands\b/.test(line) && !/import/.test(line)) {
      label = "verificationCommands usage";
    }
    if (label) {
      hints.push(`read ${relativePath} offset ${lineNum} limit 40 (${label})`);
    }
  }
  return hints.slice(0, 3);
}

export const SAFE_PREFIXES = [
  "ls", "cat", "echo", "pwd", "which", "find",
  "head", "tail", "wc", "git log", "git status", "git diff",
] as const;

export const VERIFICATION_PREFIXES = [
  "pnpm typecheck",
  "pnpm run typecheck",
  "pnpm test",
  "pnpm run test",
  "pnpm run lint",
  "pnpm run build",
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run build",
  "npm run typecheck",
  "npx tsc",
] as const;

export function isPackageInstall(command: string): boolean {
  const c = command.trim();
  return (
    /^pnpm(\s+--filter\s+\S+)?\s+add\b/.test(c) ||
    /^pnpm(\s+--filter\s+\S+)?\s+install\b/.test(c) ||
    /^npm\s+(install|i|add)\b/.test(c)
  );
}


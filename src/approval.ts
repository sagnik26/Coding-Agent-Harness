const SAFE_PREFIXES = [
  "ls", "cat", "echo", "pwd", "which", "find",
  "head", "tail", "wc", "git log", "git status", "git diff",
];

const VERIFICATION_PREFIXES = [
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
];

export type ApprovalConfig =
  | { mode: "interactive" }
  | { mode: "background" }
  | { mode: "delegated"; trust: string[] };

export function createApproval(config: ApprovalConfig) {
  return ({ command }: { command: string }) => {
    if (config.mode === "background") return false;

    if (config.mode === "delegated") {
      return !config.trust.some((p) => command.trim().startsWith(p));
    }

    return !(
      SAFE_PREFIXES.some((p) => command.trim().startsWith(p)) ||
      VERIFICATION_PREFIXES.some((p) => command.trim().startsWith(p))
    );
  };
}

import {
  SAFE_PREFIXES,
  VERIFICATION_PREFIXES,
  isPackageInstall,
} from "./constants/approval";

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

    const c = command.trim();
    return !(
      SAFE_PREFIXES.some((p) => c.startsWith(p)) ||
      VERIFICATION_PREFIXES.some((p) => c.startsWith(p)) ||
      isPackageInstall(c)
    );
  };
}

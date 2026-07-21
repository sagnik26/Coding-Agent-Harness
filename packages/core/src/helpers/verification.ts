import type { Sandbox } from "../sandbox";

export function isRealScript(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return s.length > 0 && s !== "..." && !s.startsWith("echo ");
}

export async function packageManager(
  sandbox: Sandbox,
  pkg: { packageManager?: string },
): Promise<"pnpm" | "npm"> {
  if (pkg.packageManager?.startsWith("pnpm")) return "pnpm";
  try {
    await sandbox.readFile("pnpm-lock.yaml");
    return "pnpm";
  } catch {
    return "npm";
  }
}

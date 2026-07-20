import type { Sandbox } from "./sandbox";

function isRealScript(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return s.length > 0 && s !== "..." && !s.startsWith("echo ");
}

async function packageManager(
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

export async function discoverGates(sandbox: Sandbox): Promise<string[]> {
  try {
    const pkg = JSON.parse(await sandbox.readFile("package.json"));
    const scripts: Record<string, unknown> = pkg.scripts ?? {};
    const pm = await packageManager(sandbox, pkg);
    const run = (name: string) => (pm === "pnpm" ? `pnpm run ${name}` : `npm run ${name}`);
    const gates = new Set<string>();

    if (isRealScript(scripts.typecheck)) gates.add(run("typecheck"));
    else if (isRealScript(scripts["type-check"])) gates.add(run("type-check"));
    else if (pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript) {
      gates.add("npx tsc --noEmit");
    }

    if (isRealScript(scripts.lint)) gates.add(run("lint"));
    if (isRealScript(scripts.test)) gates.add(pm === "pnpm" ? "pnpm test" : "npm test");
    if (isRealScript(scripts.build)) gates.add(run("build"));

    return [...gates];
  } catch {
    return [];
  }
}

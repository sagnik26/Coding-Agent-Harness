import type { ExecOptions, ExecResult, Sandbox } from "./sandbox";

/** One random production-style failure per session (Module 7 hard-won lessons). */
export type ChaosMode =
  | "kill-mid-command"
  | "stale-handle"
  | "state-divergence"
  | "skip-status";

const MODES: ChaosMode[] = [
  "kill-mid-command",
  "stale-handle",
  "state-divergence",
  "skip-status",
];

/** Detect chaos from argv flags and/or CHAOS / CHAOS_MODE env. */
export function parseChaosArgs(argv: string[]): {
  chaos: boolean;
  mode?: ChaosMode;
} {
  let chaos = false;
  let mode: ChaosMode | undefined;
  
  for (const arg of argv) {
    if (arg === "--chaos") {
      chaos = true;
      continue;
    }
    if (arg.startsWith("--chaos-mode=")) {
      chaos = true;
      mode = arg.slice("--chaos-mode=".length) as ChaosMode;
    }
  }

  if (process.env.CHAOS === "1" || process.env.CHAOS === "true") {
    chaos = true;
  }
  if (process.env.CHAOS_MODE) {
    chaos = true;
    mode = process.env.CHAOS_MODE as ChaosMode;
  }

  return { chaos, mode };
}

export function wrapWithChaos(sandbox: Sandbox, mode?: ChaosMode): Sandbox {
  const picked = mode ?? MODES[Math.floor(Math.random() * MODES.length)]!;
  let fired = false;

  console.error(`[chaos] mode=${picked} (one failure this session)`);

  const fire = (): boolean => {
    if (fired) return false;
    fired = true;
    console.error(`[chaos] injected: ${picked}`);
    return true;
  };

  return {
    ...sandbox,

    getStatus: async () => {
      if (picked === "skip-status" && fire()) {
        return { state: "active" as const }; // stale — skipped provider refresh
      }
      if (picked === "state-divergence" && fire()) {
        return { state: "hibernated" as const }; // provider truth; cache would still say active
      }
      return (
        (await sandbox.getStatus?.()) ?? {
          state: "active" as const,
          expiresAt: sandbox.expiresAt,
        }
      );
    },

    exec: async (command: string, options?: ExecOptions): Promise<ExecResult> => {
      if (picked === "kill-mid-command" && fire()) {
        return {
          stdout: "(chaos: sandbox process killed mid-command)",
          exitCode: 137,
        };
      }
      if (picked === "stale-handle" && fire()) {
        return { stdout: "\0\x01garbage", exitCode: 0 };
      }
      return sandbox.exec(command, options);
    },
  };
}

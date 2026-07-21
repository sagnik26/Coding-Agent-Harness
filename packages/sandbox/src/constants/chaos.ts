/** One random production-style failure per session (Module 7 hard-won lessons). */
export type ChaosMode =
  | "kill-mid-command"
  | "stale-handle"
  | "state-divergence"
  | "skip-status";

export const CHAOS_MODES: ChaosMode[] = [
  "kill-mid-command",
  "stale-handle",
  "state-divergence",
  "skip-status",
];

/** Shell command patterns that must never run, regardless of safe-prefix allowlists. */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/,
  /\bsudo\b/,
  /:\(\)\{.*\};:/,
  /\bfind\b.*-exec\b.*\brm\b/i,
  /\bxargs\b.*\brm\b/i,
] as const;

/** True when a command contains destructive patterns (e.g. find -exec rm). */
export function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim();
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

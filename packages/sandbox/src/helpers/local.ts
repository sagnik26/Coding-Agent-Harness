import { spawn } from "node:child_process";
import type { ExecOptions } from "@coding-agent-harness/core/sandbox";
import { EXEC_TIMEOUT_MS } from "../constants/local";

export function execSpawn(
  cwd: string,
  command: string,
  options?: ExecOptions,
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ stdout: stdout + "\n(timed out)", exitCode: 124 });
    }, EXEC_TIMEOUT_MS);

    child.stdout?.on("data", (buf: Buffer) => {
      const chunk = buf.toString("utf-8");
      stdout += chunk;
      options?.onStdout?.(chunk);
    });

    child.stderr?.on("data", (buf: Buffer) => {
      stdout += buf.toString("utf-8");
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout || err.message, exitCode: 1 });
    });
  });
}

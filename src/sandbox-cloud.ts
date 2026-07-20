import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { posix } from "node:path";
import type { ExecOptions, Sandbox, SandboxLifecycleHooks } from "./sandbox";

const WORKSPACE = "/vercel/sandbox";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export interface CloudSandboxConfig {
  snapshotId?: string;
  gitUrl?: string;
  gitRevision?: string;
  timeoutMs?: number;
  hooks?: SandboxLifecycleHooks;
}

function workspacePath(relativePath: string): string {
  const normalized = relativePath.replace(/^\.\//, "").replace(/^\/+/, "");
  return posix.join(WORKSPACE, normalized);
}

/**
 * Cloud sandbox — same Sandbox shape as local/just-bash; methods make network calls.
 * Project setup (git clone, npm install) belongs in lifecycle hooks, not here.
 * @see https://vercel.com/academy/build-ai-agent-harness/cloud-implementation
 */
export async function createCloudSandbox(
  config: CloudSandboxConfig = {},
): Promise<Sandbox> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const vm = config.snapshotId
    ? await VercelSandbox.create({
        source: { type: "snapshot", snapshotId: config.snapshotId },
        timeout: timeoutMs,
      })
    : config.gitUrl
      ? await VercelSandbox.create({
          runtime: "node24",
          timeout: timeoutMs,
          source: {
            type: "git",
            url: config.gitUrl,
            depth: 1,
            ...(config.gitRevision && { revision: config.gitRevision }),
          },
        })
      : await VercelSandbox.create({
          runtime: "node24",
          timeout: timeoutMs,
        });

  const sandbox: Sandbox = {
    type: "cloud",
    workingDirectory: WORKSPACE,
    expiresAt: vm.expiresAt?.getTime() ?? Date.now() + timeoutMs,

    readFile: async (p) => vm.fs.readFile(workspacePath(p), "utf8"),

    writeFile: async (p, content) => {
      await vm.fs.writeFile(workspacePath(p), content);
    },

    exec: async (command, _options?: ExecOptions) => {
      const result = await vm.runCommand({
        cmd: "bash",
        args: ["-c", command],
        cwd: WORKSPACE,
        timeoutMs: 30_000,
      });
      const stdout = await result.output("both");
      return { stdout, exitCode: result.exitCode };
    },

    stop: async () => {
      await vm.stop();
    },

    snapshot: async () => {
      const snap = await vm.snapshot();
      return { snapshotId: snap.snapshotId };
    },
  };

  await config.hooks?.afterStart?.(sandbox);
  return sandbox;
}

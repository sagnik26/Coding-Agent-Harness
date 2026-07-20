import { Sandbox as JustBashSandbox } from "just-bash";
import type { ExecOptions, Sandbox } from "./sandbox";

const MOUNT = "/home/user/project";

function toVirtualPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\.\//, "");
  if (normalized.startsWith(MOUNT)) return normalized;
  return `${MOUNT}/${normalized.replace(/^\/+/, "")}`;
}

export async function createJustBashSandbox(dir: string): Promise<Sandbox> {
  const jb = await JustBashSandbox.create({ overlayRoot: dir });

  return {
    type: "just-bash",
    workingDirectory: dir,
    readFile: async (p) => jb.readFile(toVirtualPath(p)),
    writeFile: async (p, content) => {
      await jb.writeFiles({ [toVirtualPath(p)]: content });
    },
    exec: async (command, options?: ExecOptions) => {
      const cmd = await jb.runCommand({
        cmd: command,
        cwd: MOUNT,
        detached: true,
      });

      const streamLogs = (async () => {
        if (!options?.onStdout) return;
        for await (const msg of cmd.logs()) {
          if (msg.type === "stdout") options.onStdout(msg.data);
        }
      })();

      const finished = await cmd.wait();
      await streamLogs.catch(() => {});

      return {
        stdout: await cmd.output(),
        exitCode: finished.exitCode,
      };
    },
    stop: async () => {
      await jb.stop();
    },
  };
}

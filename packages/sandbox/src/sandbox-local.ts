import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Sandbox } from "@coding-agent-harness/core/sandbox";
import { execSpawn } from "./helpers/local";

export function createLocalSandbox(dir: string): Sandbox {
  return {
    type: "local",
    workingDirectory: dir,
    readFile: async (p) => readFileSync(resolve(dir, p), "utf-8"),
    writeFile: async (p, content) => {
      const abs = resolve(dir, p);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf-8");
    },
    exec: (command, options) => execSpawn(dir, command, options),
    stop: async () => {},
  };
}

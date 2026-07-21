import type { SandboxLifecycleHooks } from "@coding-agent-harness/core/sandbox";
import { saveUncommittedWork } from "./helpers/lifecycle";

/** Cloud sandbox lifecycle — setup, teardown, timeout. @see Lesson 4.5 */
export const cloudLifecycle: SandboxLifecycleHooks = {
  afterStart: async (sandbox) => {
    await sandbox.exec('git config user.name "Agent"');
    await sandbox.exec('git config user.email "agent@example.com"');
    await sandbox.exec("pnpm install");
    await sandbox.exec("test -f .env.example && cp .env.example .env || true");
    console.error(`Cloud workspace ready: ${sandbox.workingDirectory}`);
  },

  beforeStop: saveUncommittedWork,

  onTimeout: async (sandbox) => {
    console.error("Sandbox timed out, saving state");
    await saveUncommittedWork(sandbox);
  },
};

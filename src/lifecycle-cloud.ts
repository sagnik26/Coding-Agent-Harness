import type { Sandbox, SandboxLifecycleHooks } from "./sandbox";

async function saveUncommittedWork(sandbox: Sandbox) {
  const { stdout } = await sandbox.exec("git status --porcelain");
  if (stdout.trim()) {
    await sandbox.exec('git add -A && git commit -m "WIP: auto-save"');
    console.error("Committed uncommitted work on cloud VM");
  }
  if (sandbox.snapshot) {
    const snap = await sandbox.snapshot();
    console.error(`Snapshot saved: ${snap.snapshotId}`);
  }
}

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

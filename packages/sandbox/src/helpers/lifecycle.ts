import type { Sandbox } from "@coding-agent-harness/core/sandbox";

export async function saveUncommittedWork(sandbox: Sandbox) {
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

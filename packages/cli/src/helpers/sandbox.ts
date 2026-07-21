import type { Sandbox, SandboxLifecycleHooks } from "@coding-agent-harness/core/sandbox";
import { cloudLifecycle } from "@coding-agent-harness/sandbox/lifecycle-cloud";
import { createLocalSandbox } from "@coding-agent-harness/sandbox/sandbox-local";
import { createCloudSandbox } from "@coding-agent-harness/sandbox/sandbox-cloud";

export async function createSandbox(
  type: string,
  dir: string,
): Promise<{ sandbox: Sandbox; hooks?: SandboxLifecycleHooks }> {
  if (type === "cloud") {
    return {
      sandbox: await createCloudSandbox({
        snapshotId: process.env.VERCEL_SNAPSHOT_ID,
        gitUrl: process.env.CLOUD_GIT_URL,
        gitRevision: process.env.CLOUD_GIT_REVISION,
        hooks: cloudLifecycle,
      }),
      hooks: cloudLifecycle,
    };
  }
  return { sandbox: createLocalSandbox(dir) };
}

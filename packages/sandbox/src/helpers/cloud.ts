import { posix } from "node:path";
import { CLOUD_WORKSPACE } from "../constants/cloud";

export function workspacePath(relativePath: string): string {
  const normalized = relativePath.replace(/^\.\//, "").replace(/^\/+/, "");
  return posix.join(CLOUD_WORKSPACE, normalized);
}

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

export const evalRoot = join(SRC_ROOT, "..");
export const repoRoot = join(evalRoot, "..");

export const testCasesDir = join(evalRoot, "test-cases");
export const fixturesDir = join(evalRoot, "fixtures");
export const resultsJsonlPath = join(evalRoot, "results", "runs.jsonl");

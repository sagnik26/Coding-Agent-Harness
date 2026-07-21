import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resultsJsonlPath } from "../paths";
import type { EvalResult } from "../types";

export function defaultStorePath(): string {
  return resultsJsonlPath;
}

export function storeResult(
  result: EvalResult,
  path = resultsJsonlPath,
): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(result)}\n`, "utf-8");
}

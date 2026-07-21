import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./paths";

export function getHarnessCommit(): string {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      cwd: repoRoot,
    }).trim();
  } catch {
    return "unknown";
  }
}

export function materializeFixture(fixtureDir: string, caseId: string): string {
  const workDir = mkdtempSync(join(tmpdir(), `eval-${caseId}-`));
  cpSync(fixtureDir, workDir, { recursive: true });

  const pkgPath = join(workDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const needsInstall =
        Boolean(pkg.dependencies || pkg.devDependencies) &&
        !existsSync(join(workDir, "node_modules"));
      if (needsInstall) {
        execSync("npm install --ignore-scripts", {
          cwd: workDir,
          stdio: "ignore",
        });
      }
    } catch {
    }
  }

  mkdirSync(join(workDir, "node_modules"), { recursive: true });
  return workDir;
}

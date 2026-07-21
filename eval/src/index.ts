import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  filterByCategory,
  filterById,
  loadTestCases,
} from "./loadTestCases";
import { repoRoot, testCasesDir } from "./paths";
import { err, red, yellow } from "./reporting/colors";
import {
  parseArgs,
  printCaseProgress,
  printFailureTable,
  printOverallVerdict,
  printSummary,
} from "./reporting/report";
import { defaultStorePath, storeResult } from "./results/store";
import { runEvalCase } from "./runner/runEvalCase";
import { computeAggregateMetrics } from "./scoring";
import type { EvalResult } from "./types";

loadEnv({ path: join(repoRoot, ".env"), quiet: true });
loadEnv({ quiet: true });

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let cases = loadTestCases(testCasesDir);

  if (opts.caseId) {
    cases = filterById(cases, opts.caseId);
  } else if (opts.category) {
    cases = filterByCategory(cases, opts.category);
  }

  if (cases.length === 0) {
    err(red("No test cases matched."));
    process.exit(1);
  }

  err(
    yellow(
      `Eval: ${cases.length} case(s)` +
        (opts.category ? ` | category=${opts.category}` : "") +
        (opts.caseId ? ` | case=${opts.caseId}` : ""),
    ),
  );

  if (opts.dryRun) {
    for (const c of cases) {
      console.log(
        `${c.id}\t${c.category}\t${c.fixture}\t${c.prompt.slice(0, 60)}`,
      );
    }
    process.exit(0);
  }

  if (!process.env.OPENAI_API_KEY) {
    err(
      red(
        "OPENAI_API_KEY is required for live eval runs (use --dry-run to list cases).",
      ),
    );
    process.exit(1);
  }

  const results: EvalResult[] = [];

  for (const testCase of cases) {
    err(yellow(`\n▶ ${testCase.id} (${testCase.category})…`));
    try {
      const result = await runEvalCase(testCase);
      storeResult(result);
      results.push(result);
      printCaseProgress(result);
    } catch (e) {
      err(red(`  ERROR: ${e instanceof Error ? e.message : String(e)}`));
      process.exitCode = 1;
    }
  }

  if (results.length === 0) {
    err(red("No results produced."));
    process.exit(1);
  }

  const agg = computeAggregateMetrics(results);
  printSummary(results, agg);
  err(yellow(`\nResults: ${defaultStorePath()}`));

  if (opts.jsonOut) {
    writeFileSync(
      opts.jsonOut,
      JSON.stringify({ aggregate: agg, results }, null, 2),
    );
    err(yellow(`Wrote ${opts.jsonOut}`));
  }

  printFailureTable(results);

  const overallPass = printOverallVerdict(
    agg,
    results,
    opts.threshold,
    process.exitCode === 1,
  );
  if (!overallPass) process.exit(1);
}

await main();

import type { AggregateMetrics, EvalResult } from "../types";
import { mean, percentile } from "./metrics";

export function computeAggregateMetrics(
  results: EvalResult[],
): AggregateMetrics {
  const total = results.length;
  const latencies = results
    .map((r) => r.trace.totalDurationMs)
    .sort((a, b) => a - b);

  return {
    totalRuns: total,
    passRate: total ? results.filter((r) => r.passed).length / total : 0,
    meanTrajectoryF1: mean(results.map((r) => r.scores.trajectoryF1)),
    safetyViolationCount: results.filter(
      (r) => r.scores.safetyViolationRate > 0,
    ).length,
    latencyP95Ms: percentile(latencies, 0.95),
  };
}

export type TestCategory =
  | "routing"
  | "safety_gates"
  | "context_management"
  | "delegation"
  | "ambiguity_handling"
  | "planning"
  | "verification_honesty";

export type ApprovalMode = "interactive" | "block_all";

export type TaskSubagentType = "explorer" | "executor";

export interface JudgeRubric {
  prompt: string;
  threshold: number;
}

export interface TestCase {
  id: string;
  category: TestCategory;
  fixture: string;
  prompt: string;
  toolsExpected: string[];
  toolsForbidden?: string[];
  minF1?: number;
  maxSteps?: number;
  bashBlock?: string;
  askUser?: boolean;
  askUserOptions?: [number, number];
  requireTsc?: boolean;
  requireNodeModules?: boolean;
  maxHallucination?: number;
  firstTool?: string;
  grepBeforeRead?: boolean;
  todo?: boolean;
  requireTask?: boolean;
  taskSubagent?: TaskSubagentType;
  approvalMode?: ApprovalMode;
  judge?: JudgeRubric | null;
}

export interface ToolCallRecord {
  stepNumber: number;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  blocked: boolean;
}

export interface StepTrace {
  stepNumber: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  toolCalls: ToolCallRecord[];
}

export interface RunTrace {
  testCaseId: string;
  harnessCommit: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  steps: StepTrace[];
  finalText: string;
  totalDurationMs: number;
}

export interface ScoreBreakdown {
  trajectoryF1: number;
  responseQuality: number | null;
  hallucinationRate: number;
  safetyViolationRate: number;
  contextSlope: number | null;
  latencyMs: number;
  checksPassed: boolean;
}

export interface EvalResult {
  runId: string;
  testCaseId: string;
  category: TestCategory;
  harnessCommit: string;
  model: string;
  timestamp: string;
  trace: RunTrace;
  scores: ScoreBreakdown;
  passed: boolean;
  failureSummary?: string;
  judgeRationale?: string;
}

export interface AggregateMetrics {
  totalRuns: number;
  passRate: number;
  meanTrajectoryF1: number;
  safetyViolationCount: number;
  latencyP95Ms: number;
}

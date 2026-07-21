import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ApprovalMode,
  JudgeRubric,
  TaskSubagentType,
  TestCase,
  TestCategory,
} from "./types";

interface RawTestCase {
  id: string;
  category: TestCategory;
  fixture: string;
  prompt: string;
  tools_expected?: string[];
  tools_forbidden?: string[];
  min_f1?: number;
  max_steps?: number;
  bash_block?: string;
  ask_user?: boolean;
  ask_user_options?: [number, number] | null;
  require_tsc?: boolean;
  require_node_modules?: boolean;
  max_hallucination?: number;
  first_tool?: string;
  grep_before_read?: boolean;
  todo?: boolean;
  require_task?: boolean;
  task_subagent?: TaskSubagentType;
  approval_mode?: ApprovalMode;
  judge?: JudgeRubric | null;
}

function normalizeTestCase(raw: RawTestCase): TestCase {
  return {
    id: raw.id,
    category: raw.category,
    fixture: raw.fixture,
    prompt: raw.prompt,
    toolsExpected: raw.tools_expected ?? [],
    toolsForbidden: raw.tools_forbidden,
    minF1: raw.min_f1,
    maxSteps: raw.max_steps,
    bashBlock: raw.bash_block,
    askUser: raw.ask_user,
    askUserOptions:
      raw.ask_user_options === null ? undefined : raw.ask_user_options,
    requireTsc: raw.require_tsc,
    requireNodeModules: raw.require_node_modules,
    maxHallucination: raw.max_hallucination,
    firstTool: raw.first_tool,
    grepBeforeRead: raw.grep_before_read,
    todo: raw.todo,
    requireTask: raw.require_task,
    taskSubagent: raw.task_subagent,
    approvalMode: raw.approval_mode,
    judge: raw.judge,
  };
}

export function loadTestCases(dir: string): TestCase[] {
  const cases: TestCase[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const raw = parseYaml(readFileSync(join(dir, file), "utf-8")) as RawTestCase;
    cases.push(normalizeTestCase(raw));
  }
  return cases;
}

export function filterByCategory(
  cases: TestCase[],
  category: string,
): TestCase[] {
  return cases.filter((c) => c.category === category);
}

export function filterById(cases: TestCase[], id: string): TestCase[] {
  const exact = cases.filter((c) => c.id === id);
  if (exact.length > 0) return exact;
  return cases.filter((c) => c.id.startsWith(id));
}

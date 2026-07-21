import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { DEFAULT_MODEL, DEFAULT_PROMPT, DEFAULT_SANDBOX } from "../constants/index";

export type CliArgs = {
  cwd: string;
  prompt: string;
  sandbox: string;
  model: string;
};

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      sandbox: { type: "string" },
      model: { type: "string" },
      chaos: { type: "boolean", default: false },
      "chaos-mode": { type: "string" },
    },
    allowPositionals: true,
  });

  return {
    cwd: resolve(positionals[0] || process.cwd()),
    prompt: positionals.slice(1).join(" ") || DEFAULT_PROMPT,
    sandbox: values.sandbox ?? process.env.SANDBOX ?? DEFAULT_SANDBOX,
    model: values.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  };
}

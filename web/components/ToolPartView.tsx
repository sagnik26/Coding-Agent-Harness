"use client";

import { summarizeToolCall } from "@/lib/toolSummary";
import type { ToolPart } from "@/lib/types";

function statusLabel(part: ToolPart): string {
  if (part.status === "running") return "running";
  if (part.status === "cancelled") return "stopped";
  if (part.status === "error") return "failed";
  return part.outputSummary ?? "done";
}

export function ToolPartView({ part }: { part: ToolPart }) {
  const args = summarizeToolCall(part.name, part.input);

  return (
    <div
      className="tool-ticket"
      data-status={part.status}
      role="status"
      aria-live={part.status === "running" ? "polite" : "off"}
      aria-label={`${part.name} ${statusLabel(part)}`}
    >
      <div className="tool-rail" aria-hidden />
      <div className="tool-main">
        <span className="tool-verb">{part.name}</span>
        <span className="tool-args" title={args}>
          {args}
        </span>
        <span className="tool-status">{statusLabel(part)}</span>
      </div>
    </div>
  );
}

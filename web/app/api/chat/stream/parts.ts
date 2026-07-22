import { summarizeToolResult } from "@/lib/toolSummary";
import type { Part, SseChunk } from "@/lib/types";

export function pickChunk(chunk: {
  type: string;
  [key: string]: unknown;
}): SseChunk | null {
  if (chunk.type === "text-delta") {
    return { type: "text-delta", text: String(chunk.text ?? "") };
  }
  if (chunk.type === "tool-call") {
    return {
      type: "tool-call",
      toolCallId: String(chunk.toolCallId ?? chunk.id ?? crypto.randomUUID()),
      toolName: String(chunk.toolName ?? "unknown"),
      input: chunk.input,
    };
  }
  if (chunk.type === "tool-result") {
    return {
      type: "tool-result",
      toolCallId: String(chunk.toolCallId ?? ""),
      toolName: String(chunk.toolName ?? "unknown"),
      output: chunk.output,
    };
  }
  return null;
}

/** Mutates `parts` in place; returns joined assistant text so far. */
export function applyChunk(parts: Part[], chunk: SseChunk): string {
  if (chunk.type === "text-delta") {
    const last = parts[parts.length - 1];
    if (last?.kind === "text") {
      last.text += chunk.text;
    } else {
      parts.push({ kind: "text", id: crypto.randomUUID(), text: chunk.text });
    }
  } else if (chunk.type === "tool-call") {
    parts.push({
      kind: "tool",
      toolCallId: chunk.toolCallId,
      name: chunk.toolName,
      status: "running",
      input: chunk.input,
    });
  } else if (chunk.type === "tool-result") {
    const tool = parts.find(
      (p): p is Extract<Part, { kind: "tool" }> =>
        p.kind === "tool" && p.toolCallId === chunk.toolCallId,
    );
    if (tool) {
      tool.status = "done";
      tool.outputSummary = summarizeToolResult(chunk.toolName, chunk.output);
    }
  }

  return parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("");
}

export function markCancelled(parts: Part[]) {
  for (const part of parts) {
    if (part.kind === "tool" && part.status === "running") {
      part.status = "cancelled";
    }
  }
}

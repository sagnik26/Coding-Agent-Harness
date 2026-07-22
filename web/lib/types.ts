import type { ModelMessage } from "ai";

export type TextPart = {
  kind: "text";
  id: string;
  text: string;
};

export type ToolPart = {
  kind: "tool";
  toolCallId: string;
  name: string;
  status: "running" | "done" | "cancelled" | "error";
  input?: unknown;
  outputSummary?: string;
};

export type Part = TextPart | ToolPart;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

export type SessionRecord = {
  messages: ModelMessage[];
  partialParts?: Part[];
};

export type SseChunk =
  | { type: "text-delta"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input?: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output?: unknown;
    }
  | { type: "done"; cancelled?: boolean }
  | { type: "error"; message: string }
  | { type: "partial-saved"; parts: Part[] };

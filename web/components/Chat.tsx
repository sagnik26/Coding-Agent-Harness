"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ToolPartView } from "./ToolPartView";
import { summarizeToolResult } from "@/lib/toolSummary";
import type { ChatMessage, Part, SseChunk } from "@/lib/types";

function applySseChunk(parts: Part[], chunk: SseChunk): Part[] {
  const next = parts.map((p) =>
    p.kind === "tool" ? { ...p } : p.kind === "text" ? { ...p } : p,
  );

  if (chunk.type === "text-delta") {
    const last = next[next.length - 1];
    if (last?.kind === "text") {
      next[next.length - 1] = { ...last, text: last.text + chunk.text };
    } else {
      next.push({
        kind: "text",
        id: crypto.randomUUID(),
        text: chunk.text,
      });
    }
    return next;
  }

  if (chunk.type === "tool-call") {
    next.push({
      kind: "tool",
      toolCallId: chunk.toolCallId,
      name: chunk.toolName,
      status: "running",
      input: chunk.input,
    });
    return next;
  }

  if (chunk.type === "tool-result") {
    return next.map((p) => {
      if (p.kind !== "tool" || p.toolCallId !== chunk.toolCallId) return p;
      return {
        ...p,
        status: "done" as const,
        outputSummary: summarizeToolResult(chunk.toolName, chunk.output),
      };
    });
  }

  return next;
}

function markRunningCancelled(parts: Part[]): Part[] {
  return parts.map((p) =>
    p.kind === "tool" && p.status === "running"
      ? { ...p, status: "cancelled" as const }
      : p,
  );
}

function formatRequestError(status: number, body: string): string {
  if (status === 400) {
    return body || "That request was incomplete. Add a prompt and try again.";
  }
  if (status === 401 || status === 403) {
    return "The API key was rejected. Check OPENAI_API_KEY in your .env file.";
  }
  if (status >= 500) {
    return body
      ? `The agent failed: ${body}`
      : "The agent hit a server error. Wait a moment and try again.";
  }
  return body || `Request failed (${status}). Try again.`;
}

async function* readSse(response: Response): AsyncGenerator<SseChunk> {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of rawEvent.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        yield JSON.parse(data) as SseChunk;
      }
    }
  }
}

export function Chat() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!stickRef.current) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = remaining < 96;
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const updateAssistantParts = useCallback(
    (assistantId: string, updater: (parts: Part[]) => Part[]) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, parts: updater(m.parts) } : m,
        ),
      );
    },
    [],
  );

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: "user",
        parts: [{ kind: "text", id: crypto.randomUUID(), text: prompt }],
      },
      { id: assistantId, role: "assistant", parts: [] },
    ]);
    setActiveAssistantId(assistantId);
    setStreaming(true);
    stickRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sessionId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        updateAssistantParts(assistantId, () => [
          {
            kind: "text",
            id: crypto.randomUUID(),
            text: formatRequestError(response.status, err),
          },
        ]);
        return;
      }

      for await (const chunk of readSse(response)) {
        if (chunk.type === "error") {
          updateAssistantParts(assistantId, (parts) => [
            ...parts,
            {
              kind: "text",
              id: crypto.randomUUID(),
              text: `The agent failed: ${chunk.message}. Check the server log, then try again.`,
            },
          ]);
          continue;
        }
        if (chunk.type === "partial-saved") {
          updateAssistantParts(assistantId, () => chunk.parts);
          continue;
        }
        if (chunk.type === "done") {
          if (chunk.cancelled) {
            updateAssistantParts(assistantId, markRunningCancelled);
          }
          continue;
        }
        updateAssistantParts(assistantId, (parts) =>
          applySseChunk(parts, chunk),
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistantParts(assistantId, markRunningCancelled);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        updateAssistantParts(assistantId, (parts) => [
          ...parts,
          {
            kind: "text",
            id: crypto.randomUUID(),
            text: `Couldn't reach the agent (${message}). Confirm pnpm web is running, then try again.`,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setActiveAssistantId(null);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const userText = (message: ChatMessage) =>
    message.parts
      .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
      .map((p) => p.text)
      .join("");

  return (
    <div className="shell">
      <header className="header">
        <div>
          <h1 className="brand">Craftly</h1>
          <span className="brand-rule" aria-hidden />
        </div>
        <span className="status-pill" data-live={streaming ? "true" : "false"}>
          {streaming ? "working" : "idle"}
        </span>
      </header>

      <div
        className="transcript"
        ref={transcriptRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <div className="empty">
            <strong>Ask the agent to dig into this repo</strong>
            <p className="empty-hint">
              Try “Read package.json” or “Find TODO comments under packages/”.
              Tool calls show up as tickets in the stream.
            </p>
          </div>
        )}

        {messages.map((message) =>
          message.role === "user" ? (
            <article key={message.id} className="turn turn-user">
              <div className="turn-label">You</div>
              <p className="turn-body">{userText(message)}</p>
            </article>
          ) : (
            <article key={message.id} className="turn turn-agent">
              <div className="turn-label">Agent</div>
              <div className="turn-body">
                {message.parts.length === 0 ? (
                  <span className="thinking">Waiting for the first token…</span>
                ) : null}
                {message.parts.map((part, index) => {
                  if (part.kind === "text") {
                    const isError =
                      part.text.startsWith("The agent failed") ||
                      part.text.startsWith("Couldn't reach") ||
                      part.text.startsWith("That request") ||
                      part.text.startsWith("The API key") ||
                      part.text.includes("server error") ||
                      part.text.startsWith("Request failed");
                    const isStreamingText =
                      streaming &&
                      message.id === activeAssistantId &&
                      index === message.parts.length - 1;
                    return (
                      <p
                        key={part.id}
                        className={`text-part${isError ? " is-error" : ""}${
                          isStreamingText ? " is-streaming" : ""
                        }`}
                      >
                        {part.text}
                      </p>
                    );
                  }
                  return <ToolPartView key={part.toolCallId} part={part} />;
                })}
              </div>
            </article>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="composer-box">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a file, a bug, or a change…"
            rows={2}
            disabled={streaming}
            aria-label="Message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-bar">
            <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
            {streaming ? (
              <button
                type="button"
                className="btn btn-cancel"
                onClick={cancel}
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-send"
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

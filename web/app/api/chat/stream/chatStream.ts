import { createWebAgent, createWebSandbox } from "../agent/agent";
import { applyChunk, markCancelled, pickChunk } from "./parts";
import {
  appendTurn,
  loadMessages,
  savePartialParts,
} from "../session/sessionStore";
import { encodeSse } from "./sse";
import type { Part, SseChunk } from "@/lib/types";

export function createChatSseStream(
  sessionId: string,
  prompt: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const parts: Part[] = [];
  let assistantText = "";
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      const send = (chunk: SseChunk) => {
        controller.enqueue(encodeSse(chunk));
      };

      const sandbox = createWebSandbox();
      try {
        const agent = await createWebAgent(sandbox);
        const prior = loadMessages(sessionId);
        const result = await agent.stream(
          prior.length > 0
            ? {
                messages: [
                  ...prior,
                  { role: "user" as const, content: prompt },
                ],
                abortSignal: signal,
              }
            : {
                prompt,
                abortSignal: signal,
              },
        );

        for await (const raw of result.fullStream) {
          if (signal.aborted) {
            cancelled = true;
            break;
          }
          const chunk = pickChunk(
            raw as { type: string; [key: string]: unknown },
          );
          if (!chunk) continue;
          assistantText = applyChunk(parts, chunk);
          send(chunk);
        }

        if (signal.aborted) {
          cancelled = true;
        }
      } catch (error) {
        if (signal.aborted) {
          cancelled = true;
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          send({ type: "error", message });
        }
      } finally {
        if (cancelled || signal.aborted) {
          cancelled = true;
          markCancelled(parts);
        }
        // Persist before SSE writes — client may already have disconnected on cancel
        appendTurn(sessionId, prompt, assistantText, parts);
        savePartialParts(sessionId, parts);
        try {
          send({ type: "partial-saved", parts });
          send({ type: "done", cancelled });
        } catch {
          // connection closed (typical on Cancel)
        }
        try {
          await sandbox.stop();
        } catch {
          // ignore stop errors
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
}

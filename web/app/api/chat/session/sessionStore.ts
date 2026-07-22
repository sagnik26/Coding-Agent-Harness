import type { ModelMessage } from "ai";
import type { Part, SessionRecord } from "@/lib/types";

const sessions = new Map<string, SessionRecord>();

export function getSession(sessionId: string): SessionRecord {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { messages: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function loadMessages(sessionId: string): ModelMessage[] {
  return getSession(sessionId).messages;
}

export function appendTurn(
  sessionId: string,
  userPrompt: string,
  assistantText: string,
  partialParts?: Part[],
) {
  const session = getSession(sessionId);
  session.messages = [
    ...session.messages,
    { role: "user", content: userPrompt },
    {
      role: "assistant",
      content: assistantText || (partialParts?.length ? "(partial response)" : ""),
    },
  ];
  if (partialParts) {
    session.partialParts = partialParts;
  } else {
    delete session.partialParts;
  }
}

export function savePartialParts(sessionId: string, parts: Part[]) {
  const session = getSession(sessionId);
  session.partialParts = parts;
}

export function getPartialParts(sessionId: string): Part[] | undefined {
  return getSession(sessionId).partialParts;
}

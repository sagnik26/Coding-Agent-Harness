import { createChatSseStream } from "./stream/chatStream";
import { SSE_HEADERS } from "./stream/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { prompt?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const sessionId = body.sessionId?.trim();
  if (!prompt || !sessionId) {
    return Response.json(
      { error: "prompt and sessionId are required" },
      { status: 400 },
    );
  }

  const stream = createChatSseStream(sessionId, prompt, request.signal);
  return new Response(stream, { headers: SSE_HEADERS });
}

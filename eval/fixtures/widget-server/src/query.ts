export function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    const [k, v] = part.split("=");
    if (k) out[k] = v ?? "";
  }
  return out;
}

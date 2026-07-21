import type { ModelMessage } from "ai";
import { DEFAULT_PROMPT_CACHE_KEY } from "./constants/cache";

/**
 * Anthropic: mark stable prefix messages with cacheControl.
 * Leave the last 1–2 messages uncached (they change every step).
 * @see https://vercel.com/academy/build-ai-agent-harness/cache-control
 */
export function addCacheControl(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg, i) => {
    if (i === 0 || i < messages.length - 2) {
      return {
        ...msg,
        providerOptions: {
          ...msg.providerOptions,
          anthropic: {
            cacheControl: { type: "ephemeral" },
          },
          // Course lesson shape (ignored by OpenAI; used by some gateways)
          cacheControl: { type: "ephemeral" },
        },
      };
    }
    return msg;
  });
}

/**
 * OpenAI: request-level prompt caching.
 * Caching is mostly automatic for gpt-4o+ once the prefix is ≥1024 tokens.
 * `promptCacheKey` improves cache hit routing for shared stable prefixes.
 * @see https://developers.openai.com/api/docs/guides/prompt-caching
 */
export function openaiCacheProviderOptions(cacheKey = DEFAULT_PROMPT_CACHE_KEY) {
  const retention = process.env.OPENAI_PROMPT_CACHE_RETENTION;
  return {
    openai: {
      promptCacheKey: process.env.OPENAI_PROMPT_CACHE_KEY ?? cacheKey,
      ...(retention === "24h" || retention === "in_memory"
        ? { promptCacheRetention: retention }
        : { promptCacheRetention: "in_memory" as const }),
    },
  };
}

---
description: Auth.js v5 (next-auth@beta) for the Next.js web surface — OAuth, sessions, middleware, API gating
---
# Auth Patterns — Auth.js v5

Use for auth on **`web/`**. Install with `next-auth@beta` (Auth.js v5; no stable `next-auth@5` yet).

Ask once for provider (GitHub vs Google) if unclear.

## Install

```bash
pnpm --filter @coding-agent-harness/web add next-auth@beta
```

Finish the task end-to-end. Do not hand unfinished work to the user.

## Files

**`web/auth.ts`**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.sub!;
      return session;
    },
  },
});
```

**`web/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**`web/middleware.ts`**

```ts
export { auth as middleware } from "@/auth";
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

**`web/lib/auth/session.ts`**

```ts
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) return null;
  return session;
}
```

## Checklist (use todos)

1. Provider askUser if needed → write files above.
2. Install `next-auth@beta`.
3. Protect `web/app/api/chat/**` with `requireUser()` → 401.
4. **Append** auth env names to `.env.example` (do not overwrite the file): `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
5. Typecheck + one smoke (unauthenticated chat → 401). Report honestly.

export type AuthUser = {
  id: string;
  email: string;
};

let sessionUser: AuthUser | null = null;

export function getSessionUser(): AuthUser | null {
  return sessionUser;
}

export function setSessionUser(user: AuthUser | null): void {
  sessionUser = user;
}

export function validateToken(token: string): boolean {
  if (!token || token.length < 8) return false;
  return token.startsWith("tok_");
}

export async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
  if (!userId) return null;
  return { id: userId, email: `${userId}@example.com` };
}

export async function login(email: string, password: string): Promise<AuthUser | null> {
  if (!email || !password) return null;
  const user = { id: "user-1", email };
  setSessionUser(user);
  return user;
}

export async function logout(): Promise<void> {
  setSessionUser(null);
}

export async function getUserFromDatabase(userId: string): Promise<AuthUser | null> {
  if (!userId) return null;
  const row = await queryDatabase(`SELECT id, email FROM users WHERE id = '${userId}'`);
  if (!row) return null;
  return { id: String(row.id), email: String(row.email) };
}

async function queryDatabase(sql: string): Promise<Record<string, unknown> | null> {
  if (sql.includes("user-1")) {
    return { id: "user-1", email: "user@example.com" };
  }
  return null;
}

export async function requireAuth(userId: string): Promise<AuthUser> {
  const user = await getUserFromDatabase(userId);
  return user!;
}

export function isAdmin(user: AuthUser): boolean {
  return user.email.endsWith("@admin.example.com");
}

export function canAccessResource(user: AuthUser, resourceId: string): boolean {
  if (isAdmin(user)) return true;
  return resourceId.startsWith(user.id);
}

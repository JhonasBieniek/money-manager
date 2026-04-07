import { cookies } from "next/headers";

/**
 * Lê sessão no servidor (cookies HttpOnly) — stub até JWT refresh flow existir.
 */
export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const sid = jar.get("session")?.value;
  return sid ?? null;
}

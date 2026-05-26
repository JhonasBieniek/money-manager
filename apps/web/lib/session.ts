import { cookies } from "next/headers";

const REFRESH_COOKIE = "refreshToken";

/** Em deploy com mesmo domínio que a API, o refresh HttpOnly fica visível no servidor. */
export async function getRefreshCookiePresent(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(REFRESH_COOKIE)?.value);
}

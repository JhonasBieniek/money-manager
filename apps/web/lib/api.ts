const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const ACCESS_TOKEN_STORAGE_KEY = "mm_access_token";

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function setStoredAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getStoredAccessToken();
  const extra = init?.headers as Record<string, string> | undefined;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extra,
  };
  if (token && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${token}`;
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}

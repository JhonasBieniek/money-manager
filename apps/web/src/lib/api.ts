import type { UserProfile } from "@money-manager/types";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const CSRF_COOKIE_NAME = "_csrf";
const CSRF_HEADER_NAME = "x-xsrf-token";

export const ACCESS_TOKEN_STORAGE_KEY = "mm_access_token";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === "undefined" || getCookie(CSRF_COOKIE_NAME)) {
    return;
  }

  await fetch(`${base.replace(/\/$/, "")}/v1/auth/csrf`, {
    credentials: "include",
  });
}

function withCsrfHeaders(headers: Record<string, string>, method: string): void {
  const safeMethod = method.toUpperCase();
  if (safeMethod === "GET" || safeMethod === "HEAD" || safeMethod === "OPTIONS") {
    return;
  }

  const csrf = getCookie(CSRF_COOKIE_NAME);
  if (csrf) {
    headers[CSRF_HEADER_NAME] = csrf;
  }
}

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
  init?: RequestInit,
): Promise<Response> {
  const method = init?.method ?? "GET";
  await ensureCsrfCookie();

  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getStoredAccessToken();
  const extra = init?.headers as Record<string, string> | undefined;
  const headers: Record<string, string> = {
    ...extra,
  };
  if (init?.body !== undefined && init.body !== null) {
    headers["content-type"] = "application/json";
  }
  if (token && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${token}`;
  }
  withCsrfHeaders(headers, method);

  let response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  if (
    response.status === 401 &&
    !path.includes("/auth/refresh") &&
    !path.includes("/auth/login") &&
    !path.includes("/auth/register")
  ) {
    await ensureCsrfCookie();
    const refreshHeaders: Record<string, string> = {
      "content-type": "application/json",
    };
    withCsrfHeaders(refreshHeaders, "POST");

    const refreshRes = await fetch(
      `${base.replace(/\/$/, "")}/v1/auth/refresh`,
      {
        method: "POST",
        credentials: "include",
        headers: refreshHeaders,
      },
    );

    if (refreshRes.ok) {
      const data = (await refreshRes.json()) as { accessToken?: string };
      if (data.accessToken) {
        setStoredAccessToken(data.accessToken);
        headers.authorization = `Bearer ${data.accessToken}`;
        response = await fetch(url, {
          ...init,
          headers,
          credentials: "include",
        });
      }
    } else {
      clearStoredAccessToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }

  return response;
}

export async function logout(): Promise<void> {
  await apiFetch("/v1/auth/logout", { method: "POST" });
  clearStoredAccessToken();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await apiFetch("/v1/me");
  if (!res.ok) {
    throw new Error("Não foi possível carregar a conta");
  }
  return res.json() as Promise<UserProfile>;
}

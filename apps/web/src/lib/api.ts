import type { UserProfile } from "@money-manager/types";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const CSRF_COOKIE_NAME = "_csrf";
const CSRF_HEADER_NAME = "x-xsrf-token";
const AUTH_WRITE_PATHS = ["/auth/login", "/auth/register", "/auth/refresh"] as const;
const AUTH_5XX_MAX_RETRIES = 2;

export const ACCESS_TOKEN_STORAGE_KEY = "mm_access_token";

let csrfBootstrap: Promise<void> | null = null;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isAuthWritePath(path: string): boolean {
  return AUTH_WRITE_PATHS.some((segment) => path.includes(segment));
}

async function fetchCsrfCookie(): Promise<void> {
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/auth/csrf`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Falha ao obter token CSRF (${res.status})`);
  }
  if (!getCookie(CSRF_COOKIE_NAME)) {
    throw new Error("Cookie CSRF ausente após bootstrap");
  }
}

async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === "undefined" || getCookie(CSRF_COOKIE_NAME)) {
    return;
  }

  if (!csrfBootstrap) {
    csrfBootstrap = fetchCsrfCookie().finally(() => {
      csrfBootstrap = null;
    });
  }

  await csrfBootstrap;
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

function authRetryDelayMs(attempt: number): number {
  return 250 * 2 ** attempt;
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

async function performFetch(
  url: string,
  init: RequestInit | undefined,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
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

  const maxAttempts = isAuthWritePath(path) ? AUTH_5XX_MAX_RETRIES + 1 : 1;
  let response: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, authRetryDelayMs(attempt - 1)),
      );
      await ensureCsrfCookie();
      withCsrfHeaders(headers, method);
    }

    response = await performFetch(url, init, headers);
    if (response.status < 500 || response.status >= 600) {
      break;
    }
  }

  if (!response) {
    throw new Error("Falha ao executar requisição");
  }

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
        response = await performFetch(url, init, headers);
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

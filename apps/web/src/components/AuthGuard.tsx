import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getStoredAccessToken } from "../lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    setAllowed(Boolean(token));
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-8">
        <p className="text-sm text-zinc-500">Carregando…</p>
      </main>
    );
  }

  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const token = getStoredAccessToken();
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

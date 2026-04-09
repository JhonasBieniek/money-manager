"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredAccessToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      router.replace("/login");
      setReady(true);
      return;
    }
    setAllowed(true);
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="p-8">
        <p className="text-sm text-neutral-600">Carregando…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="p-8">
        <p>Sessão necessária.</p>
        <Link className="text-blue-600 underline" href="/login">
          Ir para login
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}

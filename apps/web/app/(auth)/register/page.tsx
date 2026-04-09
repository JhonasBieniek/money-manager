"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type RegisterOk = {
  telegramStartText: string;
  telegramExplanation: string;
  expiresInSeconds: number;
};

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<RegisterOk | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível cadastrar.");
        return;
      }

      const hasTddShape =
        typeof data.telegramStartText === "string" &&
        typeof data.telegramExplanation === "string" &&
        typeof data.expiresInSeconds === "number";

      if (!hasTddShape) {
        if (data.ok === true) {
          setError(
            "O backend ainda responde só { ok: true } (versão antiga). Reconstrua e suba a API de novo: por exemplo `docker compose build api && docker compose up -d api`, ou rode `pnpm --filter @money-manager/api build` e reinicie o processo Node."
          );
        } else {
          setError(
            "A API não retornou telegramStartText, telegramExplanation e expiresInSeconds (contrato do cadastro). Verifique a URL em NEXT_PUBLIC_API_URL e se o serviço da API está atualizado."
          );
        }
        return;
      }

      setSuccess({
        telegramStartText: data.telegramStartText as string,
        telegramExplanation: data.telegramExplanation as string,
        expiresInSeconds: data.expiresInSeconds as number,
      });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    const minutes = Math.floor(success.expiresInSeconds / 60);
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">Cadastro criado</h1>
        <p className="text-sm text-neutral-600">{success.telegramExplanation}</p>
        <p className="text-sm text-neutral-600">
          O código abaixo expira em <strong>{minutes} minutos</strong>.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">Cole no Telegram</span>
          <textarea
            readOnly
            rows={3}
            value={success.telegramStartText}
            className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm text-neutral-900"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
            onClick={() => {
              void navigator.clipboard.writeText(success.telegramStartText);
            }}
          >
            Copiar texto
          </button>
          <Link
            href="/login"
            className="rounded-md bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white"
          >
            Ir para login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Criar conta</h1>
      <p className="text-sm text-neutral-600">
        Apenas e-mail e senha. Depois do cadastro você recebe o texto para vincular o Telegram.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">E-mail</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">Senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900"
          />
        </label>
        <p className="text-xs text-neutral-500">Mínimo de 8 caracteres.</p>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>
      <p className="text-center text-sm text-neutral-600">
        Já tem conta?{" "}
        <Link className="text-blue-600 underline" href="/login">
          Entrar
        </Link>
      </p>
    </main>
  );
}

import type {
  LinkTokenResponse,
  TelegramAccountResponse,
} from "@money-manager/types";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { CheckCircle2 } from "lucide-react";

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatLinkedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function TelegramLinkSection() {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedAccount, setLinkedAccount] =
    useState<TelegramAccountResponse | null>(null);
  const [linkData, setLinkData] = useState<LinkTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadAccountStatus() {
      setCheckingStatus(true);
      try {
        const res = await apiFetch("/v1/telegram/account");
        if (res.ok) {
          setLinkedAccount((await res.json()) as TelegramAccountResponse);
        } else {
          setLinkedAccount(null);
        }
      } catch {
        setLinkedAccount(null);
      } finally {
        setCheckingStatus(false);
      }
    }

    void loadAccountStatus();
  }, []);

  useEffect(() => {
    if (linkedAccount || !linkData) {
      return;
    }

    async function pollLinkStatus() {
      try {
        const res = await apiFetch("/v1/telegram/account");
        if (res.ok) {
          const account = (await res.json()) as TelegramAccountResponse;
          setLinkedAccount(account);
          setLinkData(null);
        }
      } catch {
        // ignora erros transitórios no polling
      }
    }

    void pollLinkStatus();
    const interval = setInterval(() => {
      void pollLinkStatus();
    }, 3_000);

    return () => clearInterval(interval);
  }, [linkedAccount, linkData]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await apiFetch("/v1/telegram/link-token", { method: "POST" });
      if (!res.ok) {
        throw new Error("Não foi possível gerar o código de vínculo.");
      }
      const data = (await res.json()) as LinkTokenResponse;
      setLinkData(data);
    } catch {
      setError("Não foi possível gerar o código de vínculo.");
      setLinkData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!linkData) {
      return;
    }
    try {
      await navigator.clipboard.writeText(linkData.startCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o comando.");
    }
  }

  if (checkingStatus) {
    return (
      <div className="glass mt-6 rounded-2xl p-6">
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  if (linkedAccount) {
    return (
      <div className="glass mt-6 rounded-2xl p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Telegram
        </h2>
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-200">Conta já vinculada</p>
            <p className="mt-1 text-sm text-zinc-400">
              {linkedAccount.username
                ? `@${linkedAccount.username}`
                : `Chat ${linkedAccount.chatId}`}
              {" · "}
              vinculada em {formatLinkedAt(linkedAccount.linkedAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass mt-6 rounded-2xl p-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Telegram
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        Vincule sua conta ao bot do Telegram para registrar despesas por áudio.
      </p>

      {error ? (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? "Gerando…" : "Gerar código de vínculo"}
      </button>

      {linkData ? (
        <div className="mt-6 space-y-3 rounded-xl border border-white/5 bg-zinc-900/40 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Código válido até {formatExpiry(linkData.expiresAt)}
          </p>
          <p className="font-mono text-sm text-emerald-300">{linkData.token}</p>
          <p className="text-sm text-zinc-300">No Telegram, envie ao bot:</p>
          <p className="font-mono text-sm text-white">{linkData.startCommand}</p>
          <p className="text-xs text-amber-400/90">
            Aguardando vínculo no Telegram… o card atualiza automaticamente.
          </p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="btn-ghost text-sm"
          >
            {copied ? "Copiado!" : "Copiar comando"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

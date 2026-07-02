import type {
  LinkTokenResponse,
  TelegramAccountResponse,
  TelegramBotInfoResponse,
} from "@money-manager/types";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { CheckCircle2, Copy, ExternalLink, MessageCircle } from "lucide-react";

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
  const [botInfo, setBotInfo] = useState<TelegramBotInfoResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadInitialData() {
      setCheckingStatus(true);
      try {
        const [accountRes, infoRes] = await Promise.all([
          apiFetch("/v1/telegram/account"),
          apiFetch("/v1/telegram/info"),
        ]);

        if (accountRes.ok) {
          setLinkedAccount((await accountRes.json()) as TelegramAccountResponse);
        } else {
          setLinkedAccount(null);
        }

        if (infoRes.ok) {
          setBotInfo((await infoRes.json()) as TelegramBotInfoResponse);
        }
      } catch {
        setLinkedAccount(null);
      } finally {
        setCheckingStatus(false);
      }
    }

    void loadInitialData();
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

  const botLabel = linkData?.botUsername
    ? `@${linkData.botUsername}`
    : botInfo?.botUsername
      ? `@${botInfo.botUsername}`
      : "nosso bot";

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
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Telegram
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Vincule sua conta ao {botLabel} para registrar despesas por áudio
            direto no chat.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!linkData ? (
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Gerando código…" : "Gerar código de vínculo"}
        </button>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/5 bg-zinc-900/40 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Código válido até {formatExpiry(linkData.expiresAt)}
          </p>

          <ol className="space-y-3 text-sm text-zinc-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                1
              </span>
              <span>
                Abra o Telegram e inicie uma conversa com{" "}
                <strong className="text-white">{botLabel}</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                2
              </span>
              <span>
                Envie o comando abaixo (ou use o botão para abrir o chat já com
                o código).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                3
              </span>
              <span>
                Volte aqui — esta tela atualiza sozinha quando o vínculo for
                concluído.
              </span>
            </li>
          </ol>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400/80">
              Comando para copiar
            </p>
            <p className="break-all font-mono text-sm text-white">
              {linkData.startCommand}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="btn-ghost inline-flex items-center justify-center gap-2 text-sm"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Comando copiado!" : "Copiar comando"}
            </button>

            {linkData.botDeepLink ? (
              <a
                href={linkData.botDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir no Telegram
              </a>
            ) : botInfo?.botUrl ? (
              <a
                href={botInfo.botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir {botLabel}
              </a>
            ) : null}
          </div>

          <p className="text-xs text-amber-400/90">
            Aguardando vínculo no Telegram…
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type {
  ListProviderCredentialsResponse,
  ProviderCredentialProvider,
  ProviderCredentialSummary,
} from "@money-manager/types";
import { KeyRound } from "lucide-react";
import { apiFetch } from "../../../lib/api";

const PROVIDERS: {
  id: ProviderCredentialProvider;
  label: string;
  signupUrl: string;
  signupLabel: string;
}[] = [
  {
    id: "brapi",
    label: "Brapi (ações e FIIs)",
    signupUrl: "https://brapi.dev",
    signupLabel: "brapi.dev",
  },
  {
    id: "coingecko",
    label: "CoinGecko (cripto)",
    signupUrl: "https://www.coingecko.com/api",
    signupLabel: "coingecko.com/api",
  },
];

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(iso),
  );
}

interface ProviderRowProps {
  provider: (typeof PROVIDERS)[number];
  summary: ProviderCredentialSummary | undefined;
  onChanged: () => void;
}

function ProviderRow({ provider, summary, onChanged }: ProviderRowProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/v1/me/provider-credentials/${provider.id}`,
        { method: "PUT", body: JSON.stringify({ apiKey }) },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? "Não foi possível salvar essa chave.",
        );
      }
      setApiKey("");
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar essa chave.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/v1/me/provider-credentials/${provider.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error("Não foi possível remover essa chave.");
      }
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível remover essa chave.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-white">{provider.label}</p>

      {error ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Chave configurada em {formatUpdatedAt(summary.updatedAt)}
          </p>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            className="btn-ghost text-sm"
          >
            {removing ? "Removendo…" : "Remover"}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-zinc-500">
            Consiga sua chave em{" "}
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              {provider.signupLabel}
            </a>
            .
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole sua chave aqui"
              className="auth-input flex-1"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || apiKey.trim() === ""}
              className="btn-primary text-sm"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderCredentialsSection() {
  const [items, setItems] = useState<ProviderCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/v1/me/provider-credentials");
      if (res.ok) {
        const data = (await res.json()) as ListProviderCredentialsResponse;
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="glass mt-6 rounded-2xl p-6">
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="glass mt-6 rounded-2xl p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Chaves de cotação
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Configure suas próprias chaves para cotação automática de ações,
            FIIs e cripto.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            summary={items.find((i) => i.provider === provider.id)}
            onChanged={() => void load()}
          />
        ))}
      </div>
    </div>
  );
}

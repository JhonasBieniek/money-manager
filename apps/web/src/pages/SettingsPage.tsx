import { useEffect, useState } from "react";
import { TelegramLinkSection } from "../components/features/settings/telegram-link-section";
import { fetchProfile, logout } from "../lib/api";

export function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProfile()
      .then((profile) => setEmail(profile.email))
      .catch(() => setError("Não foi possível carregar a conta."));
  }, []);

  return (
    <div className="max-w-lg space-y-6 sm:space-y-8">
      <h1 className="text-xl font-bold text-white sm:text-2xl">Configurações</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Gerencie sua sessão e preferências da conta.
      </p>

      <div className="glass rounded-2xl p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Conta
        </h2>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-sm text-zinc-300">
            E-mail:{" "}
            <span className="font-medium text-white">{email ?? "…"}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="btn-ghost mt-6"
        >
          Sair da conta
        </button>
      </div>

      <TelegramLinkSection />
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthPageShell } from "../components/marketing/auth-page-shell";
import { PasswordInput } from "../components/ui/password-input";
import { apiFetch, setStoredAccessToken } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        accessToken?: string;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Não foi possível entrar.",
        );
        return;
      }
      if (typeof data.accessToken === "string") {
        setStoredAccessToken(data.accessToken);
      }
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      title="Entrar"
      subtitle="Use seu e-mail e senha para acessar o painel."
      footer={
        <>
          Não tem conta?{" "}
          <Link className="text-emerald-400 hover:underline" to="/register">
            Cadastrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-300">E-mail</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <label
            htmlFor="login-password"
            className="font-medium text-zinc-300"
          >
            Senha
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthPageShell>
  );
}

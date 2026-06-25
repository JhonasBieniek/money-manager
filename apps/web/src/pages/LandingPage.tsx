import { Link } from "react-router-dom";

export function LandingPage() {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6">
      <div className="glass w-full max-w-2xl rounded-2xl p-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Finanças pessoais
        </p>
        <h1 className="gradient-text mb-4 text-4xl font-bold">Money Manager</h1>
        <p className="mb-8 leading-relaxed text-zinc-400">
          Controle despesas, receitas e metas financeiras com clareza. Integração
          com Telegram para registrar gastos por áudio.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/login" className="btn-primary">
            Entrar
          </Link>
          <Link to="/register" className="btn-ghost">
            Criar conta
          </Link>
        </div>
        <p className="mt-8 text-xs text-zinc-600">
          API: <code className="text-zinc-400">{apiUrl}</code>
        </p>
      </div>
    </main>
  );
}

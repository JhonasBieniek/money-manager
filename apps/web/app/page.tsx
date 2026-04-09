import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Money Manager</h1>
      <Link className="text-blue-600 underline" href="/login">
        Entrar
      </Link>
      <Link className="text-blue-600 underline" href="/register">
        Criar conta
      </Link>
      <Link className="text-blue-600 underline" href="/dashboard">
        Dashboard
      </Link>
    </main>
  );
}

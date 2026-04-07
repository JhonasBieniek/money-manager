import Link from "next/link";
import { getSessionUserId } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getSessionUserId();
  if (!userId) {
    return (
      <main className="p-8">
        <p>Sessão necessária.</p>
        <Link className="text-blue-600 underline" href="/login">
          Ir para login
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white px-6 py-3">
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard">Resumo</Link>
          <Link href="/dashboard/expenses">Despesas</Link>
          <Link href="/dashboard/categories">Categorias</Link>
        </nav>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}

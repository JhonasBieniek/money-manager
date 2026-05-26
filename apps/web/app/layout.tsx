import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money Manager",
  description: "Despesas e categorias",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body className="min-h-[100dvh] antialiased selection:bg-emerald-500/30">
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}

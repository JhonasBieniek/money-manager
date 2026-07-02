import { Link } from "react-router-dom";
import { BrandLogo } from "./brand-logo";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandLogo />
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="btn-ghost px-4 py-2 text-sm">
            Entrar
          </Link>
          <Link to="/register" className="btn-primary px-4 py-2 text-sm">
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}

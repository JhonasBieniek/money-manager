import { Link } from "react-router-dom";
import { TagList } from "../components/features/tags/tag-list";
import { Plus, Sparkles, Tags } from "lucide-react";

export function TagsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-10">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Tags className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Organização
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Tags
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Organize receitas e despesas com tags e sub-tags opcionais.
          </p>
        </div>

        <Link
          to="/dashboard/tags/new"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-zinc-950 shadow-[0_20px_40px_-15px_rgba(255,255,255,0.1)] transition-all hover:bg-zinc-200 active:scale-95 sm:w-auto sm:px-8 sm:py-4"
        >
          <Plus className="h-5 w-5" />
          Nova tag
        </Link>
      </div>

      <div className="glass rounded-2xl border-white/5 bg-zinc-900/20 p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center gap-3 sm:mb-10">
          <Sparkles className="h-5 w-5 text-emerald-500/50" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">
            Suas tags
          </h2>
        </div>

        <TagList />
      </div>
    </div>
  );
}

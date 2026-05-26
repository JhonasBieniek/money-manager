import Link from "next/link";
import { Plus } from "lucide-react";
import { TagList } from "@/components/features/tags/tag-list";

export default function TagsPage() {
  return (
    <div className="p-8 lg:p-12 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Tags</h1>
          <p className="text-zinc-500 mt-2">
            Organize receitas e despesas com tags e sub-tags.
          </p>
        </div>
        <Link
          href="/dashboard/tags/new"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-zinc-950 hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Nova tag
        </Link>
      </div>
      <TagList />
    </div>
  );
}

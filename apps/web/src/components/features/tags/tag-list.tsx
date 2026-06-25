import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Tag } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  Plus,
  Trash2,
  Edit3,
  Hash,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export function TagList() {
  const [rootTags, setRootTags] = useState<Tag[]>([]);
  const [subTagsByParent, setSubTagsByParent] = useState<
    Record<string, Tag[]>
  >({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubTags = useCallback(async (parentId: string) => {
    const res = await apiFetch(`/v1/tags?parentId=${parentId}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Tag[] };
    return data.items ?? [];
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/v1/tags?parentId=root");
      if (!res.ok) throw new Error("Falha ao carregar tags");
      const data = (await res.json()) as { items: Tag[] };
      const roots = data.items ?? [];
      setRootTags(roots);

      const subs: Record<string, Tag[]> = {};
      await Promise.all(
        roots.map(async (tag) => {
          subs[tag.id] = await loadSubTags(tag.id);
        }),
      );
      setSubTagsByParent(subs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tags");
    } finally {
      setLoading(false);
    }
  }, [loadSubTags]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta tag?")) return;
    try {
      const res = await apiFetch(`/v1/tags/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = (await res.json()) as { message?: string };
        throw new Error(errData.message || "Erro ao excluir");
      }
      await loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[2rem] bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (rootTags.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/5 py-40 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
          <Hash className="h-8 w-8 text-zinc-700" />
        </div>
        <h3 className="mb-2 text-xl font-bold text-white">Nenhuma tag</h3>
        <p className="mb-8 max-w-[30ch] text-sm text-zinc-500">
          Crie tags para organizar receitas e despesas.
        </p>
        <Link
          to="/dashboard/tags/new"
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Criar primeira tag
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {rootTags.map((tag) => {
        const subs = subTagsByParent[tag.id] ?? [];
        const isOpen = expanded[tag.id] ?? subs.length > 0;
        return (
          <div key={tag.id} className="glass overflow-hidden rounded-[2rem]">
            <div className="flex items-center justify-between p-6">
              <button
                type="button"
                onClick={() => toggleExpand(tag.id)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                {subs.length > 0 ? (
                  isOpen ? (
                    <ChevronDown className="h-5 w-5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-zinc-500" />
                  )
                ) : (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{tag.name}</h3>
                  <p className="text-xs text-zinc-500">
                    {subs.length} sub-tag{subs.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <Link
                  to={`/dashboard/tags/${tag.id}/sub/new`}
                  className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                >
                  + Sub-tag
                </Link>
                <Link
                  to={`/dashboard/tags/${tag.id}/edit`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:text-white"
                >
                  <Edit3 className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(tag.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/5 text-red-400/70 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {isOpen && subs.length > 0 ? (
              <div className="space-y-2 border-t border-white/5 px-6 pb-6">
                {subs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3"
                  >
                    <span className="pl-8 text-sm font-medium text-zinc-200">
                      {sub.name}
                    </span>
                    <div className="flex gap-2">
                      <Link
                        to={`/dashboard/tags/${sub.id}/edit`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(sub.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/5 text-red-400/70"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

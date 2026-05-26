"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit3, Hash, ChevronDown, ChevronRight } from "lucide-react";

interface TagItem {
  id: string;
  name: string;
  parentId: string | null;
}

export function TagList() {
  const [rootTags, setRootTags] = useState<TagItem[]>([]);
  const [subTagsByParent, setSubTagsByParent] = useState<Record<string, TagItem[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubTags = useCallback(async (parentId: string) => {
    const res = await apiFetch(`/v1/tags?parentId=${parentId}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []) as TagItem[];
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/v1/tags?parentId=root");
      if (!res.ok) throw new Error("Falha ao carregar tags");
      const data = await res.json();
      const roots = (data.items ?? []) as TagItem[];
      setRootTags(roots);

      const subs: Record<string, TagItem[]> = {};
      await Promise.all(
        roots.map(async (tag) => {
          subs[tag.id] = await loadSubTags(tag.id);
        })
      );
      setSubTagsByParent(subs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar tags");
    } finally {
      setLoading(false);
    }
  }, [loadSubTags]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta tag?")) return;
    try {
      const res = await apiFetch(`/v1/tags/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
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
          <div key={i} className="h-24 rounded-[2rem] bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (rootTags.length === 0 && !error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/5 py-40 text-center"
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
          <Hash className="h-8 w-8 text-zinc-700" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Nenhuma tag</h3>
        <p className="text-sm text-zinc-500 max-w-[30ch] mb-8">
          Crie tags para organizar receitas e despesas.
        </p>
        <Link
          href="/dashboard/tags/new"
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Criar primeira tag
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {rootTags.map((tag, i) => {
          const subs = subTagsByParent[tag.id] ?? [];
          const isOpen = expanded[tag.id] ?? subs.length > 0;
          return (
            <motion.div
              key={tag.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-[2rem] overflow-hidden"
            >
              <div className="flex items-center justify-between p-6">
                <button
                  type="button"
                  onClick={() => toggleExpand(tag.id)}
                  className="flex items-center gap-3 text-left flex-1"
                >
                  {subs.length > 0 ? (
                    isOpen ? (
                      <ChevronDown className="h-5 w-5 text-zinc-500" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-zinc-500" />
                    )
                  ) : (
                    <Hash className="h-5 w-5 text-emerald-400/80" />
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
                    href={`/dashboard/tags/${tag.id}/sub/new`}
                    className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                  >
                    + Sub-tag
                  </Link>
                  <Link
                    href={`/dashboard/tags/${tag.id}/edit`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:text-white"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(tag.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/5 text-red-400/70 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOpen && subs.length > 0 && (
                <div className="border-t border-white/5 px-6 pb-6 space-y-2">
                  {subs.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-zinc-200 pl-8">
                        {sub.name}
                      </span>
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/tags/${sub.id}/edit`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(sub.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/5 text-red-400/70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

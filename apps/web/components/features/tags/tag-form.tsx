"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { Hash, Check } from "lucide-react";

interface TagFormProps {
  tagId?: string;
  parentId?: string | null;
  parentName?: string;
}

interface TagItem {
  id: string;
  name: string;
  parentId: string | null;
}

export function TagForm({ tagId, parentId, parentName }: TagFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string | "">(
    parentId ?? ""
  );
  const [rootTags, setRootTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(Boolean(tagId));
  const [error, setError] = useState<string | null>(null);

  const isSubTagForm = parentId !== undefined && parentId !== null;

  useEffect(() => {
    async function loadRoots() {
      if (isSubTagForm) return;
      try {
        const res = await apiFetch("/v1/tags?parentId=root");
        if (res.ok) {
          const data = await res.json();
          setRootTags((data.items ?? []).filter((t: TagItem) => t.id !== tagId));
        }
      } catch {
        /* ignore */
      }
    }
    loadRoots();
  }, [tagId, isSubTagForm]);

  useEffect(() => {
    if (!tagId) {
      setFetching(false);
      return;
    }
    async function loadTag() {
      try {
        const res = await apiFetch(`/v1/tags/${tagId}`);
        if (!res.ok) throw new Error("Tag não encontrada");
        const tag = await res.json();
        setName(tag.name);
        setSelectedParentId(tag.parentId ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setFetching(false);
      }
    }
    loadTag();
  }, [tagId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: { name: string; parentId?: string | null } = { name: name.trim() };
    if (isSubTagForm) {
      body.parentId = parentId;
    } else if (selectedParentId) {
      body.parentId = selectedParentId;
    } else {
      body.parentId = null;
    }

    try {
      const method = tagId ? "PATCH" : "POST";
      const path = tagId ? `/v1/tags/${tagId}` : "/v1/tags";
      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Erro ao salvar tag");
      }
      router.push("/dashboard/tags");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-8">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400"
        >
          {error}
        </motion.div>
      )}

      {parentName && (
        <p className="text-sm text-zinc-500">
          Sub-tag de: <span className="font-bold text-emerald-400">{parentName}</span>
        </p>
      )}

      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-400 flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Nome
        </label>
        <input
          type="text"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-5 text-zinc-100 outline-none focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50"
          placeholder="Ex: Mercado"
        />
      </div>

      {!isSubTagForm && !parentId && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-zinc-400">Tag pai (opcional)</label>
          <select
            value={selectedParentId}
            onChange={(e) => setSelectedParentId(e.target.value)}
            className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-5 text-zinc-100 outline-none focus:bg-white/10"
          >
            <option value="">Nenhuma (tag raiz)</option>
            {rootTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-600">
            Sub-tags só podem ter um nível: o pai deve ser uma tag raiz.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-6 border-t border-white/5">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-bold text-zinc-500 hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="flex h-14 items-center gap-3 rounded-2xl bg-white px-8 text-sm font-black text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Salvando..." : tagId ? "Atualizar" : "Criar tag"}
          <Check className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

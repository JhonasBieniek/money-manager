import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Tag } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { SearchableSelect } from "../../ui/searchable-select";
import { Hash, Check, Palette } from "lucide-react";

interface TagFormProps {
  tagId?: string;
  parentId?: string | null;
  parentName?: string;
}

export function TagForm({ tagId, parentId, parentName }: TagFormProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [selectedParentId, setSelectedParentId] = useState<string | "">(
    parentId ?? "",
  );
  const [rootTags, setRootTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(Boolean(tagId));
  const [error, setError] = useState<string | null>(null);

  const isSubTagForm = parentId !== undefined && parentId !== null;

  const parentOptions = useMemo(
    () => [
      { value: "", label: "Nenhuma (tag raiz)" },
      ...rootTags.map((t) => ({ value: t.id, label: t.name })),
    ],
    [rootTags],
  );

  useEffect(() => {
    async function loadRoots() {
      if (isSubTagForm) return;
      try {
        const res = await apiFetch("/v1/tags?parentId=root");
        if (res.ok) {
          const data = (await res.json()) as { items: Tag[] };
          setRootTags((data.items ?? []).filter((t) => t.id !== tagId));
        }
      } catch {
        /* ignore */
      }
    }
    void loadRoots();
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
        const tag = (await res.json()) as Tag;
        setName(tag.name);
        setColor(tag.color);
        setSelectedParentId(tag.parentId ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setFetching(false);
      }
    }
    void loadTag();
  }, [tagId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: {
      name: string;
      color: string;
      parentId?: string | null;
    } = { name: name.trim(), color };

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
        const errData = (await res.json()) as { message?: string };
        throw new Error(errData.message || "Erro ao salvar tag");
      }
      void navigate("/dashboard/tags");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="h-40 animate-pulse rounded-2xl bg-white/5" />;
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-xl space-y-8">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {parentName ? (
        <p className="text-sm text-zinc-500">
          Sub-tag de:{" "}
          <span className="font-bold text-emerald-400">{parentName}</span>
        </p>
      ) : null}

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400">
          <Hash className="h-4 w-4" />
          Nome
        </label>
        <input
          type="text"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-14 w-full rounded-2xl border border-white/5 bg-white/5 px-5 text-zinc-100 outline-none focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50"
          placeholder="Ex: Mercado"
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-bold text-zinc-400">
          <Palette className="h-4 w-4" />
          Cor
        </label>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-14 w-20 cursor-pointer rounded-2xl border border-white/5 bg-transparent"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            pattern="^#[0-9a-fA-F]{6}$"
            className="h-14 flex-1 rounded-2xl border border-white/5 bg-white/5 px-5 font-mono text-sm text-zinc-100 outline-none focus:bg-white/10"
          />
        </div>
      </div>

      {!isSubTagForm && !parentId ? (
        <div className="space-y-3">
          <label className="text-xs font-bold text-zinc-400">
            Tag pai (opcional)
          </label>
          <SearchableSelect
            options={parentOptions}
            value={selectedParentId}
            onChange={setSelectedParentId}
            placeholder="Selecione tag pai…"
          />
          <p className="text-xs text-zinc-600">
            Sub-tags só podem ter um nível: o pai deve ser uma tag raiz.
          </p>
        </div>
      ) : null}

      <div className="flex justify-between border-t border-white/5 pt-6">
        <button
          type="button"
          onClick={() => void navigate(-1)}
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

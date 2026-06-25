import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TagForm } from "../components/features/tags/tag-form";
import { apiFetch } from "../lib/api";
import { ArrowLeft } from "lucide-react";

export function NewSubTagPage() {
  const { parentId } = useParams<{ parentId: string }>();
  const [parentName, setParentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadParent() {
      if (!parentId) return;
      try {
        const res = await apiFetch(`/v1/tags/${parentId}`);
        if (!res.ok) throw new Error("Tag pai não encontrada");
        const parent = (await res.json()) as { name: string };
        setParentName(parent.name);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Tag pai não encontrada");
      }
    }
    void loadParent();
  }, [parentId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl text-red-400">Erro: {error}</div>
    );
  }

  if (!parentName) {
    return (
      <div className="mx-auto h-40 max-w-2xl animate-pulse rounded-xl bg-white/5" />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/dashboard/tags"
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white">Nova sub-tag</h1>
      </div>
      <TagForm parentId={parentId} parentName={parentName} />
    </div>
  );
}

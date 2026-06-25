import { Link } from "react-router-dom";
import { TagForm } from "../components/features/tags/tag-form";
import { ArrowLeft } from "lucide-react";

export function NewTagPage() {
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
        <h1 className="text-2xl font-bold text-white">Nova tag</h1>
      </div>
      <TagForm />
    </div>
  );
}

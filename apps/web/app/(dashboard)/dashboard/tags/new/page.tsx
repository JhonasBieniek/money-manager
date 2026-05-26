import { TagForm } from "@/components/features/tags/tag-form";

export default function NewTagPage() {
  return (
    <div className="p-8 lg:p-12 space-y-8">
      <h1 className="text-3xl font-black text-white">Nova tag</h1>
      <TagForm />
    </div>
  );
}

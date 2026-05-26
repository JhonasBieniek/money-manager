import { TagForm } from "@/components/features/tags/tag-form";

export default async function EditTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="p-8 lg:p-12 space-y-8">
      <h1 className="text-3xl font-black text-white">Editar tag</h1>
      <TagForm tagId={id} />
    </div>
  );
}

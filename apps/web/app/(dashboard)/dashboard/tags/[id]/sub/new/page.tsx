import { TagForm } from "@/components/features/tags/tag-form";
import { notFound } from "next/navigation";

export default async function NewSubTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: parentId } = await params;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/tags/${parentId}`, {
    cache: "no-store",
  });
  if (!res.ok) notFound();
  const parent = await res.json();

  return (
    <div className="p-8 lg:p-12 space-y-8">
      <h1 className="text-3xl font-black text-white">Nova sub-tag</h1>
      <TagForm parentId={parentId} parentName={parent.name} />
    </div>
  );
}

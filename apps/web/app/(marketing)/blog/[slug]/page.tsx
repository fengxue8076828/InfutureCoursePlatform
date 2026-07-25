import { notFound } from "next/navigation";

import { getBlogPost } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BlogDetailPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) {
    notFound();
  }

  return (
    <main className="bg-mist py-10">
      <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <img src={post.cover_url} alt={post.title} className="h-80 w-full rounded-lg object-cover shadow-soft" />
        <p className="mt-8 text-sm font-bold text-coral">{post.author_name}</p>
        <h1 className="mt-3 text-4xl font-black leading-tight text-ink">{post.title}</h1>
        <p className="mt-5 text-lg leading-9 text-slate-600">{post.excerpt}</p>
        <div className="mt-8 rounded-lg bg-white p-6 leading-8 text-slate-700 shadow-soft">
          <p>{post.content}</p>
          <p className="mt-4">
            后续可以在管理员平台接入富文本编辑器、SEO 字段、封面图上传和多语言版本。
          </p>
        </div>
      </article>
    </main>
  );
}

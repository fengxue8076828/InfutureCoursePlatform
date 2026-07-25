import Link from "next/link";

import { SectionTitle } from "@/components/SectionTitle";
import { getBlogPosts } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <main className="bg-mist py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle title="博客" subtitle="海外中文学习、双语成长、在线课程和机构运营经验。" />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="panel overflow-hidden rounded-lg transition hover:-translate-y-1 hover:border-coral">
              <img src={post.cover_url} alt={post.title} className="h-56 w-full object-cover" />
              <div className="p-5">
                <p className="text-sm font-semibold text-coral">{post.author_name}</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{post.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

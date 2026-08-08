import Link from "next/link";
import { Tag } from "lucide-react";

import { SectionTitle } from "@/components/SectionTitle";
import { getBlogPosts, getTags } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const categoryOptions = [
  { value: "language", label: "语言教育类" },
  { value: "it", label: "IT教育类" },
  { value: "tutoring", label: "课外补习类" },
  { value: "art", label: "艺术教育类" }
];

function normalize(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseTagIds(value: string) {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function buildBlogHref(category: string, tagIds: number[]) {
  const params = new URLSearchParams();
  if (category) {
    params.set("institution_category", category);
  }
  if (tagIds.length) {
    params.set("tag_ids", tagIds.join(","));
  }
  const query = params.toString();
  return query ? `/blog?${query}` : "/blog";
}

function toggleTag(tagIds: number[], tagId: number) {
  return tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId];
}

export default async function BlogPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCategory = normalize(params.institution_category) || normalize(params.category);
  const selectedTagIds = parseTagIds(normalize(params.tag_ids));
  const [posts, tags] = await Promise.all([
    getBlogPosts({ institutionCategory: selectedCategory, tagIds: selectedTagIds }),
    selectedCategory ? getTags(selectedCategory) : Promise.resolve([])
  ]);

  return (
    <main className="bg-mist py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          title="博客"
          subtitle="海外中文学习、双语成长、在线课程和机构运营经验。"
        />

        <section className="mt-6 rounded-lg bg-white p-5 shadow-soft ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/blog"
              className={`rounded-full px-4 py-2 text-sm font-black transition ${
                selectedCategory ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-ink text-white"
              }`}
            >
              全部机构类型
            </Link>
            {categoryOptions.map((category) => (
              <Link
                key={category.value}
                href={buildBlogHref(category.value, [])}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  selectedCategory === category.value
                    ? "bg-ink text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {category.label}
              </Link>
            ))}
          </div>

          {selectedCategory ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-3 text-sm font-black text-slate-500">多标签组合筛选</p>
              <div className="flex flex-wrap gap-2">
                {tags.length ? (
                  tags.map((tagItem) => {
                    const nextTagIds = toggleTag(selectedTagIds, tagItem.id);
                    const isSelected = selectedTagIds.includes(tagItem.id);
                    return (
                      <Link
                        key={tagItem.id}
                        href={buildBlogHref(selectedCategory, nextTagIds)}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black transition ${
                          isSelected
                            ? "bg-mint text-white"
                            : "bg-mint/10 text-mint hover:bg-mint/20"
                        }`}
                      >
                        <Tag size={13} />
                        {tagItem.name}
                      </Link>
                    );
                  })
                ) : (
                  <span className="text-sm font-bold text-slate-500">当前机构类型下还没有可用标签。</span>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="panel overflow-hidden rounded-lg transition hover:-translate-y-1 hover:border-coral"
            >
              {post.cover_url ? (
                <img src={post.cover_url} alt={post.title} className="h-56 w-full object-cover" />
              ) : (
                <div className="grid h-56 w-full place-items-center bg-slate-100 text-sm font-black text-slate-400">
                  尚未上传封面
                </div>
              )}
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-coral">{post.author_name}</p>
                  {post.tag_list?.slice(0, 4).map((tagItem) => (
                    <span key={tagItem.id} className="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-black text-mint">
                      {tagItem.name}
                    </span>
                  ))}
                </div>
                <h2 className="mt-2 text-2xl font-bold text-ink">{post.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>

        {!posts.length ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
            没有找到符合条件的文章。
          </div>
        ) : null}
      </div>
    </main>
  );
}

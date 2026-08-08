"use client";

import { ResourceTagFilters, type ResourceTagFilterValue } from "@/components/ResourceTagFilters";
import { API_BASE_URL } from "@/lib/api-config";
import { buildResourceQuery } from "@/lib/api";
import { reorderByRecommendation, useRecommendationFeed } from "@/lib/recommendations";
import type { ResourceTag } from "@/lib/types";
import { ArrowRight, BookOpen, Building2, Layers3, Route, Search, Sparkles, Tag } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type LearningPathCourse = {
  id: number;
  position: number;
  course: {
    id: number;
    slug: string;
    title: string;
    subtitle: string;
    category: string;
    level: string;
    hero_image_url: string;
    teacher?: { name: string; title?: string | null } | null;
  };
};

type LearningPath = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  cover_url: string;
  audience: string;
  level: string;
  course_count: number;
  tag_list?: ResourceTag[];
  institution: {
    name: string;
    slug: string;
    logo_url: string;
  };
  courses: LearningPathCourse[];
};

function pathCover(path: LearningPath) {
  return path.cover_url || path.courses[0]?.course.hero_image_url || "";
}

function appendTagQuery(search: URLSearchParams, filters: ResourceTagFilterValue) {
  const tagQuery = buildResourceQuery({
    institutionCategory: filters.institutionCategory,
    tagIds: filters.tagIds
  });
  const tagParams = new URLSearchParams(tagQuery.replace(/^\?/, ""));
  tagParams.forEach((value, key) => search.set(key, value));
}

export function LearningPathsPage() {
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ResourceTagFilterValue>({ institutionCategory: "", tagIds: [] });
  const [status, setStatus] = useState("正在读取学习路径...");
  const [isLoading, setIsLoading] = useState(true);

  async function loadPaths(nextQuery = query, nextFilters = filters) {
    setIsLoading(true);
    const search = new URLSearchParams();
    if (nextQuery.trim()) {
      search.set("query", nextQuery.trim());
    }
    appendTagQuery(search, nextFilters);

    try {
      const response = await fetch(`${API_BASE_URL}/learning-paths${search.toString() ? `?${search}` : ""}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("Learning path API unavailable");
      }
      const data = (await response.json()) as LearningPath[];
      setPaths(data);
      setStatus(data.length ? "已从平台读取学习路径。" : "暂时没有找到学习路径。");
    } catch {
      setStatus("学习路径读取失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPaths(query, filters);
  }, [filters]);

  const recommendationFeed = useRecommendationFeed();
  const recommendedPaths = useMemo(
    () => reorderByRecommendation(paths, recommendationFeed?.orders.learning_paths, (path) => path.id),
    [paths, recommendationFeed]
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPaths(query, filters);
  }

  return (
    <main className="bg-mist py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-lg bg-gradient-to-br from-ink via-[#22314f] to-[#70c5a7] p-8 text-white shadow-soft md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-coral">Learning Paths</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                从入门到高手，跟随我们的学习路径，一路学习，一路成长。
              </h1>
              <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-white/80">
                每条路径由机构精选课程组成，适合希望系统学习、持续进阶的学生。
              </p>
              <form onSubmit={handleSearch} className="mt-7 flex max-w-2xl flex-col gap-3 rounded-lg bg-white p-2 shadow-lg sm:flex-row">
                <label className="flex flex-1 items-center gap-2 px-3">
                  <Search size={18} className="text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索学习路径、课程主题或机构"
                    className="w-full bg-transparent py-3 text-sm font-semibold text-ink outline-none placeholder:text-slate-400"
                  />
                </label>
                <button className="rounded-lg bg-coral px-6 py-3 text-sm font-black text-white transition hover:bg-coral/90">
                  搜索路径
                </button>
              </form>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Route, label: "清晰路线", value: "按阶段学习" },
                { icon: BookOpen, label: "课程组合", value: "循序渐进" },
                { icon: Layers3, label: "路径资源", value: "课程 + 练习" },
                { icon: Sparkles, label: "成长目标", value: "可追踪" }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg bg-white/12 p-5 ring-1 ring-white/15 backdrop-blur">
                    <Icon size={24} className="text-mint" />
                    <p className="mt-4 text-sm font-bold text-white/70">{item.label}</p>
                    <p className="mt-1 text-2xl font-black">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg bg-white p-5 shadow-soft ring-1 ring-slate-100">
          <ResourceTagFilters
            value={filters}
            onChange={setFilters}
            title="按机构类型和标签筛选学习路径"
          />
        </section>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-coral">Paths</p>
            <h2 className="text-3xl font-black text-ink">学习路径列表</h2>
          </div>
          <p className="text-sm font-bold text-slate-500">{status}</p>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
            正在加载学习路径...
          </div>
        ) : recommendedPaths.length ? (
          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            {recommendedPaths.map((path) => (
              <Link
                key={path.id}
                href={`/learning-paths/${path.slug}`}
                className="group overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:border-coral hover:shadow-soft"
              >
                <div className="grid gap-0 md:grid-cols-[230px_1fr]">
                  <div className="relative min-h-52 overflow-hidden bg-slate-100">
                    {pathCover(path) ? (
                      <img src={pathCover(path)} alt={path.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full min-h-52 place-items-center text-sm font-black text-slate-400">尚未上传封面</div>
                    )}
                    <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-coral">
                      {path.course_count || path.courses.length} 门课程
                    </div>
                  </div>

                  <div className="flex min-h-52 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <span className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-1 text-mint">
                        <Building2 size={13} />
                        {path.institution?.name || "平台机构"}
                      </span>
                      <span className="rounded-full bg-coral/10 px-2 py-1 text-coral">{path.level || "综合"}</span>
                      {path.tag_list?.slice(0, 4).map((tagItem) => (
                        <span key={tagItem.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                          <Tag size={12} />
                          {tagItem.name}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-ink">{path.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{path.subtitle || path.description}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                      <div className="text-sm font-bold text-slate-500">
                        {path.audience || "适合系统进阶学习"}
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-black text-coral">
                        查看路径 <ArrowRight size={16} />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
            没有找到符合条件的学习路径。
          </div>
        )}
      </div>
    </main>
  );
}

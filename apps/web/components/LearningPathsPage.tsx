"use client";

import { API_BASE_URL } from "@/lib/api-config";

import { ArrowRight, BookOpen, Building2, Layers3, Route, Search, Sparkles } from "lucide-react";
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

export function LearningPathsPage() {
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("正在读取学习路径...");
  const [isLoading, setIsLoading] = useState(true);

  async function loadPaths(nextQuery = query) {
    setIsLoading(true);
    const search = new URLSearchParams();
    if (nextQuery.trim()) {
      search.set("query", nextQuery.trim());
    }
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
    void loadPaths("");
  }, []);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPaths(query);
  }

  const featuredPaths = useMemo(() => paths.slice(0, 3), [paths]);

  return (
    <main className="bg-mist pb-16 text-ink">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-[2rem] border border-mint/20 bg-white p-6 shadow-soft lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-mint/12 px-3 py-1 text-sm font-black text-mint">
              <Route size={16} /> 学习路径
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-ink md:text-5xl">
              从入门到高手，跟随我们的学习路径，一路学习，一路成长。
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              每条学习路径由机构精选课程组成，帮助学生从入门到进阶逐步完成学习目标。
            </p>
            <form onSubmit={handleSearch} className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="focus-ring w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none"
                  placeholder="搜索学习路径、适合人群或学习目标"
                />
              </div>
              <button className="focus-ring rounded-xl bg-coral px-6 py-3 text-sm font-black text-white hover:bg-[#f25f54]">
                搜索
              </button>
            </form>
            <p className="mt-4 text-sm font-semibold text-slate-500">{status}</p>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] bg-gradient-to-br from-mint/15 via-white to-coral/10 p-5">
            <div className="rounded-2xl bg-white/85 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-coral">
                <Sparkles size={16} /> 精选路径
              </p>
              <p className="mt-2 text-4xl font-black text-ink">{paths.length}</p>
            </div>
            <div className="rounded-2xl bg-white/85 p-4">
              <p className="text-sm font-bold text-slate-500">路径中的课程</p>
              <p className="mt-2 text-4xl font-black text-mint">
                {paths.reduce((total, path) => total + path.course_count, 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {featuredPaths.length ? (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-3">
            {featuredPaths.map((path) => (
              <FeaturedLearningPathCard key={path.id} path={path} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-black text-coral">Path Catalog</p>
              <h2 className="mt-1 text-3xl font-black text-ink">全部学习路径</h2>
            </div>
            {isLoading ? <p className="text-sm font-bold text-slate-500">正在加载...</p> : null}
          </div>
          <div className="mt-6 grid gap-5">
            {paths.map((path) => (
              <LearningPathRow key={path.id} path={path} />
            ))}
            {!paths.length && !isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                没有找到符合条件的学习路径。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function FeaturedLearningPathCard({ path }: { path: LearningPath }) {
  const cover = pathCover(path);
  return (
    <Link
      href={`/learning-paths/${path.slug}`}
      className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-soft transition hover:-translate-y-1 hover:border-mint"
    >
      {cover ? (
        <img src={cover} alt={path.title} className="h-44 w-full object-cover" />
      ) : (
        <div className="grid h-44 place-items-center bg-gradient-to-br from-mint/20 to-coral/20 text-lg font-black text-slate-500">
          学习路径
        </div>
      )}
      <div className="p-5">
        <p className="text-xs font-black uppercase tracking-wide text-mint">{path.institution.name}</p>
        <h3 className="mt-2 line-clamp-2 text-xl font-black text-ink">{path.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{path.subtitle || path.description}</p>
        <div className="mt-4 flex items-center justify-between text-sm font-bold text-slate-500">
          <span>{path.course_count} 门课程</span>
          <span className="inline-flex items-center gap-1 text-coral">
            查看详情 <ArrowRight size={15} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function LearningPathRow({ path }: { path: LearningPath }) {
  const cover = pathCover(path);
  return (
    <article className="grid gap-5 rounded-[1.25rem] border border-slate-200 bg-white p-5 md:grid-cols-[14rem_1fr_auto]">
      {cover ? (
        <img src={cover} alt={path.title} className="h-40 w-full rounded-2xl object-cover md:h-full" />
      ) : (
        <div className="grid h-40 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-400 md:h-full">
          尚未上传封面
        </div>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-mint/12 px-3 py-1 text-xs font-black text-mint">
            <Building2 size={13} /> {path.institution.name}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-3 py-1 text-xs font-black text-coral">
            <Layers3 size={13} /> {path.course_count} 门课程
          </span>
          {path.level ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{path.level}</span>
          ) : null}
        </div>
        <h3 className="mt-4 text-2xl font-black text-ink">{path.title}</h3>
        <p className="mt-2 text-sm font-bold text-slate-500">{path.audience || "适合人群未设置"}</p>
        <p className="mt-3 line-clamp-2 text-sm leading-7 text-slate-600">{path.description || path.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {path.courses.slice(0, 4).map((item) => (
            <span key={item.id} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
              {item.position}. {item.course.title}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center md:justify-end">
        <Link
          href={`/learning-paths/${path.slug}`}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
        >
          查看路径 <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, PlayCircle, Route } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

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
  intro_video_url: string;
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

export function LearningPathDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [path, setPath] = useState<LearningPath | null>(null);
  const [message, setMessage] = useState("正在读取学习路径...");

  useEffect(() => {
    if (!slug) return;

    async function loadPath() {
      try {
        const response = await fetch(`${API_BASE_URL}/learning-paths/${slug}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Learning path not found");
        }
        const data = (await response.json()) as LearningPath;
        setPath(data);
        setMessage("");
      } catch {
        setMessage("学习路径读取失败，请确认该路径已发布，并且 FastAPI 服务正在运行。");
      }
    }

    void loadPath();
  }, [slug]);

  if (!path) {
    return (
      <main className="bg-mist py-16 text-ink">
        <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link href="/learning-paths" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} /> 返回学习路径
          </Link>
          <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-soft">
            {message}
          </div>
        </section>
      </main>
    );
  }

  const cover = pathCover(path);

  return (
    <main className="bg-mist pb-16 text-ink">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/learning-paths" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-mint">
          <ArrowLeft size={16} /> 返回学习路径
        </Link>

        <div className="mt-5 grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-6 lg:p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-mint/12 px-3 py-1 text-sm font-black text-mint">
              <Route size={16} /> {path.institution.name}
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight text-ink md:text-5xl">{path.title}</h1>
            <p className="mt-4 text-lg font-semibold leading-8 text-slate-600">{path.subtitle}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric icon={<BookOpen size={18} />} label="课程数量" value={`${path.course_count} 门`} />
              <Metric icon={<GraduationCap size={18} />} label="适合人群" value={path.audience || "未设置"} />
              <Metric icon={<Clock3 size={18} />} label="路径级别" value={path.level || "未设置"} />
            </div>
          </div>

          {cover ? (
            <img src={cover} alt={path.title} className="h-80 w-full object-cover lg:h-full" />
          ) : (
            <div className="grid min-h-80 place-items-center bg-gradient-to-br from-mint/20 via-white to-coral/20 text-xl font-black text-slate-500">
              学习路径
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft lg:p-6">
          <div>
            <p className="font-black text-coral">Path Introduction</p>
            <h2 className="mt-1 text-3xl font-black text-ink">路径介绍</h2>
          </div>
          <div className="mt-5">
          {path.intro_video_url ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-ink">
              <video controls src={path.intro_video_url} className="aspect-video w-full object-contain" />
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400">
              <span className="inline-flex items-center gap-2">
                <PlayCircle size={18} /> 暂未上传介绍视频
              </span>
            </div>
          )}
          </div>
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <p className="whitespace-pre-wrap text-base leading-8 text-slate-700">
              {path.description || "该学习路径暂时还没有填写详细介绍。"}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft">
          <div>
            <p className="font-black text-coral">Learning Roadmap</p>
            <h2 className="mt-1 text-3xl font-black text-ink">路径课程</h2>
          </div>
          <div className="mt-6 grid gap-5">
            {path.courses.map((item, index) => (
              <CourseStep key={item.id} item={item} isLast={index === path.courses.length - 1} />
            ))}
            {!path.courses.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                这条学习路径还没有添加已发布课程。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-xs font-black text-coral">
        {icon} {label}
      </p>
      <p className="mt-2 line-clamp-2 text-lg font-black text-ink">{value}</p>
    </div>
  );
}

function CourseStep({ item, isLast }: { item: LearningPathCourse; isLast: boolean }) {
  const course = item.course;
  return (
    <article className="relative grid gap-5 rounded-[1.25rem] border border-slate-200 bg-white p-5 md:grid-cols-[5rem_13rem_1fr_auto]">
      <div className="flex md:block">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint/12 text-lg font-black text-mint">
          {item.position}
        </div>
        {!isLast ? <div className="ml-7 hidden h-full border-l-2 border-dashed border-mint/30 md:block" /> : null}
      </div>

      {course.hero_image_url ? (
        <img src={course.hero_image_url} alt={course.title} className="h-32 w-full rounded-2xl object-cover md:h-full" />
      ) : (
        <div className="grid h-32 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-400 md:h-full">
          无封面
        </div>
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-black text-coral">{course.category}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{course.level}</span>
        </div>
        <h3 className="mt-3 text-2xl font-black text-ink">{course.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-600">{course.subtitle}</p>
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500">
          <CheckCircle2 size={16} className="text-mint" />
          {course.teacher?.name || "授课老师待定"}
        </p>
      </div>

      <div className="flex items-center md:justify-end">
        <Link
          href={`/courses/${course.slug}`}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
        >
          查看课程 <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

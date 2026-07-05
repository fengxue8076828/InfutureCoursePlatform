import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Euro,
  GraduationCap,
  Layers3,
  LibraryBig,
  PlayCircle,
  School,
  Sparkles,
  Users
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourse, getCourses } from "@/lib/api";
import type { Course } from "@/lib/types";

export async function generateStaticParams() {
  const courses = await getCourses();
  return courses.map((course) => ({ slug: course.slug }));
}

function sumCourseMinutes(course: Course) {
  return (
    course.chapters?.reduce(
      (total, chapter) =>
        total +
        chapter.items.reduce((chapterTotal, item) => chapterTotal + (item.required_minutes || 0), 0),
      0
    ) ?? 0
  );
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url) || url.includes("/uploads/video/");
}

function richTextOrFallback(value: string | undefined, fallback: string) {
  const content = value?.trim();
  return content ? content : fallback;
}

function RichTextBlock({
  content,
  fallback,
  className = ""
}: {
  content?: string;
  fallback: string;
  className?: string;
}) {
  return (
    <div
      className={`max-w-none text-slate-600 [&_a]:font-bold [&_a]:text-coral [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-3 [&_p]:leading-8 [&_strong]:text-ink ${className}`}
      dangerouslySetInnerHTML={{ __html: richTextOrFallback(content, fallback) }}
    />
  );
}

function CourseMedia({ course }: { course: Course }) {
  const heroImageUrl = course.hero_image_url?.trim();

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-soft">
      {heroImageUrl ? (
        <img
          src={heroImageUrl}
          alt={course.title}
          className="h-[22rem] w-full object-cover sm:h-[28rem] lg:h-full"
        />
      ) : (
        <div className="grid h-[22rem] w-full place-items-center text-sm font-bold text-slate-500 sm:h-[28rem]">
          尚未上传图片
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent p-5 text-white">
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">{course.category}</span>
          <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">{course.level}</span>
        </div>
      </div>
    </div>
  );
}

function IntroVideo({ url, title }: { url?: string; title: string }) {
  const videoUrl = url?.trim();

  if (!videoUrl) {
    return (
      <div className="mt-5 grid aspect-video place-items-center rounded-lg bg-ink text-center text-white">
        <div>
          <PlayCircle className="mx-auto text-white/70" size={42} />
          <p className="mt-3 text-sm font-bold">暂无课程介绍视频</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-lg bg-ink">
      {isDirectVideoUrl(videoUrl) ? (
        <video
          controls
          preload="metadata"
          src={videoUrl}
          className="aspect-video w-full bg-ink"
        />
      ) : (
        <iframe
          src={videoUrl}
          title={`${title} 课程介绍视频`}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}

function CourseOutline({ course }: { course: Course }) {
  const chapters = course.chapters ?? [];

  if (chapters.length === 0) {
    return (
      <article className="panel rounded-lg p-6">
        <h2 className="text-2xl font-bold text-ink">课程章节</h2>
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          课程章节正在整理中。
        </div>
      </article>
    );
  }

  return (
    <article className="panel rounded-lg p-6">
      <div className="flex items-center gap-2">
        <LibraryBig className="text-mint" size={22} />
        <h2 className="text-2xl font-bold text-ink">课程章节</h2>
      </div>
      <div className="mt-5 grid gap-4">
        {chapters.map((chapter, chapterIndex) => (
          <section key={chapter.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-coral">第 {chapterIndex + 1} 章</p>
                <h3 className="mt-1 text-lg font-black text-ink">{chapter.title}</h3>
              </div>
            </div>
            <RichTextBlock
              content={chapter.summary}
              fallback="本章简介正在整理中。"
              className="mt-3 text-sm"
            />
          </section>
        ))}
      </div>
    </article>
  );
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);

  if (!course) {
    notFound();
  }

  const totalMinutes = sumCourseMinutes(course);
  const lessonCount = course.chapters?.reduce((total, chapter) => total + chapter.items.length, 0) ?? 0;
  const teacherAvatarUrl = course.teacher.avatar_url?.trim();
  const institutionLogoUrl = course.institution.logo_url?.trim();

  return (
    <main className="bg-mist">
      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <Link
              href="/courses"
              className="focus-ring mb-6 inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-mint hover:text-mint"
            >
              <ArrowLeft size={16} />
              返回课程列表
            </Link>

            <p className="text-sm font-black text-coral">{course.category}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-ink sm:text-5xl">
              {course.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{course.subtitle}</p>

            <div className="mt-6 grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2 rounded-lg bg-mint/12 px-3 py-2 text-mint">
                <GraduationCap size={17} />
                {course.level}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-skysoft/18 px-3 py-2 text-blue-700">
                <School size={17} />
                {course.institution.name}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                <Users size={17} />
                {course.students_count} 人学习
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                <Clock3 size={17} />
                约 {totalMinutes} 分钟
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/courses/${course.slug}/register`}
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-coral/90"
              >
                订阅课程 39 欧元/月
                <ArrowRight size={18} />
              </Link>
              <a
                href="#intro-video"
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-mint hover:text-mint"
              >
                <PlayCircle size={18} />
                课程介绍视频
              </a>
            </div>
          </div>

          <CourseMedia course={course} />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem] lg:px-8">
        <div className="grid gap-6">
          <article className="panel rounded-lg p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="text-coral" size={22} />
              <h2 className="text-2xl font-bold text-ink">课程介绍</h2>
            </div>
            <RichTextBlock
              content={course.description}
              fallback={course.subtitle}
              className="mt-4 leading-8"
            />
          </article>

          <article id="intro-video" className="panel rounded-lg p-6">
            <div className="flex items-center gap-2">
              <PlayCircle className="text-coral" size={22} />
              <h2 className="text-2xl font-bold text-ink">课程介绍视频</h2>
            </div>
            <IntroVideo url={course.intro_video_url} title={course.title} />
          </article>

          <CourseOutline course={course} />
        </div>

        <aside className="grid h-fit gap-4 lg:sticky lg:top-24">
          <div className="panel rounded-lg p-5">
            <p className="text-sm font-bold text-slate-500">订阅价格</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-black text-ink">39</span>
              <span className="pb-1 text-sm font-bold text-slate-500">欧元/月</span>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>课程章节</span>
                <span className="font-bold text-ink">{course.chapters?.length ?? 0} 章</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>学习项目</span>
                <span className="font-bold text-ink">{lessonCount} 个</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>课程级别</span>
                <span className="font-bold text-ink">{course.level}</span>
              </div>
            </div>
            <Link
              href={`/courses/${course.slug}/register`}
              className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-ink/90"
            >
              <Euro size={17} />
              立即订阅
            </Link>
          </div>

          <Link
            href={`/teachers/${course.teacher.slug}`}
            className="panel block rounded-lg p-5 transition hover:-translate-y-1 hover:border-coral"
          >
            <p className="text-sm font-bold text-coral">授课老师</p>
            <div className="mt-4 flex items-center gap-3">
              {teacherAvatarUrl ? (
                <img
                  src={teacherAvatarUrl}
                  alt={course.teacher.name}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                  头像
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-ink">{course.teacher.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.teacher.title}</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-600">{course.teacher.bio}</p>
          </Link>

          <div className="panel rounded-lg p-5">
            <div className="flex items-center gap-3">
              {institutionLogoUrl ? (
                <img
                  src={institutionLogoUrl}
                  alt={course.institution.name}
                  className="h-12 w-12 rounded-lg object-contain"
                />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100">
                  <School className="text-slate-400" size={22} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-black text-ink">{course.institution.name}</p>
                <p className="mt-1 text-sm text-slate-500">{course.institution.region}</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-600">
              {course.institution.description}
            </p>
          </div>

          <div className="panel rounded-lg p-5">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Layers3 size={18} />
              学习方式
            </div>
            <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
              <span className="rounded-lg bg-slate-50 px-3 py-2">按章节逐步学习</span>
              <span className="rounded-lg bg-slate-50 px-3 py-2">完成练习后进入测验</span>
              <span className="rounded-lg bg-slate-50 px-3 py-2">支持课程视频和讲义资料</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

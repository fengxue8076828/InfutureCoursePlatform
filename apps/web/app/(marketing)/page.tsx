export const dynamic = "force-dynamic";
export const revalidate = 0;

import {
  ArrowRight,
  Award,
  BookOpenCheck,
  BrainCircuit,
  ChevronRight,
  Globe2,
  GraduationCap,
  PlayCircle,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CourseCard } from "@/components/CourseCard";
import { ScrollRow } from "@/components/ScrollRow";
import { SectionTitle } from "@/components/SectionTitle";
import { TeacherCard } from "@/components/TeacherCard";
import { getBlogPosts, getCourses, getInstitutions, getPublishedQuestions, getStudentLeaderboard, getTeachers } from "@/lib/api";
import type { Institution, Question, StudentLeaderboardEntry } from "@/lib/types";

const platformHighlights = [
  {
    title: "面向海外中文家庭",
    text: "用亲民的价格为华人提供顶级的全球优质教育资源，让学生在家就可以跟着世界级名师进行学习",
    icon: Globe2
  },
  {
    title: "课程、练习、测验一体化",
    text: "学生不只是观看视频，而是在章节、讲义、练习和测验中持续推进。",
    icon: BookOpenCheck
  },
  {
    title: "数据驱动学习动力",
    text: "用进度、积分和排名帮助学生看到自己的成长，让学习目标更具体。",
    icon: ShieldCheck
  }
];

const pointRules = [
  { title: "完成速度", text: "越早完成课程和章节，速度奖励越高。", icon: Rocket },
  { title: "测验表现", text: "测验分数越高，积分加成越明显。", icon: Target },
  { title: "持续学习", text: "近 7 天积分形成上升速度榜。", icon: Zap },
  { title: "课程完成", text: "完成整门课程获得额外成长积分。", icon: Award }
];



const learningSteps = [
  ["选择课程", "按类别、机构、级别快速筛选适合自己的课程。"],
  ["订阅学习", "39 欧元/月/课程，订阅后进入个人课堂。"],
  ["完成章节", "视频、讲义、练习和测验组成清晰学习节奏。"],
  ["获得积分", "越快完成、测验分数越高，积分和排名提升越明显。"]
];


const questionTypeLabels: Record<string, string> = {
  single_choice: "\u5355\u9009\u9898",
  multiple_choice: "\u591a\u9009\u9898",
  fill_blank: "\u586b\u7a7a\u9898",
  coding: "\u4ee3\u7801\u7f16\u5199\u9898",
  true_false: "\u5224\u65ad\u9898",
  reading: "\u9605\u8bfb\u7406\u89e3",
  listening: "\u542c\u529b\u9898",
  pronunciation: "\u53d1\u97f3\u53e3\u8bed\u9898",
  writing: "\u5199\u4f5c\u9898",
  media_upload: "\u7d20\u6750\u4e0a\u4f20\u9898"
};

function getQuestionDisplayTitle(question: Question) {
  const title = question.content?.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  return question.prompt || `\u9898\u76ee ${question.id}`;
}

function LeaderboardCard({
  title,
  subtitle,
  entries,
  metric
}: {
  title: string;
  subtitle: string;
  entries: StudentLeaderboardEntry[];
  metric: "total" | "weekly";
}) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/90 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-coral">{subtitle}</p>
          <h3 className="mt-1 text-xl font-black text-ink">{title}</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-sunshine/25 text-ink">
          <Trophy size={22} />
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {entries.length > 0 ? (
          entries.slice(0, 5).map((entry) => (
            <div
              key={`${metric}-${entry.student_id}`}
              className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-sm font-black text-white">
                {entry.rank}
              </span>
              {entry.avatar_url ? (
                <img
                  src={entry.avatar_url}
                  alt={entry.student_name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint/15 text-sm font-black text-mint">
                  {entry.student_name.trim().slice(0, 1).toUpperCase() || "学"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{entry.student_name}</p>
                <p className="text-xs text-slate-500">
                  完成 {entry.completed_courses} 门 · 平均进度 {entry.average_progress}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-black text-ink">
                  {metric === "total" ? entry.total_points : entry.weekly_points}
                </p>
                <p className="text-xs text-slate-500">积分</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-500">
            暂无学生积分数据，订阅课程并完成学习后会显示排名。
          </div>
        )}
      </div>
    </div>
  );
}

function InstitutionLogo({ institution }: { institution: Institution }) {
  const logoUrl = institution.logo_url?.trim();

  return (
    <Link
      href={`/institutions/${institution.slug}`}
      className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-white/70 hover:text-coral"
    >
      {logoUrl ? (
        <img src={logoUrl} alt={institution.name} className="h-12 w-12 rounded-lg object-contain" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-mint/15 font-black text-mint">
          {institution.name.slice(0, 1)}
        </span>
      )}
      <p className="truncate text-sm font-bold text-ink">{institution.name}</p>
    </Link>
  );
}

export default async function HomePage() {
  const [courses, institutions, teachers, leaderboard, posts, publishedQuestions] = await Promise.all([
    getCourses(),
    getInstitutions(),
    getTeachers(),
    getStudentLeaderboard(),
    getBlogPosts(),
    getPublishedQuestions()
  ]);

  const featuredCourses = [...courses]
    .sort(
      (a, b) =>
        (b.rating_average ?? 0) - (a.rating_average ?? 0) ||
        (b.rating_count ?? 0) - (a.rating_count ?? 0) ||
        (b.students_count || 0) - (a.students_count || 0)
    )
    .slice(0, 10);
  const heroCourse = featuredCourses[0];
  const visibleTeachers = teachers.slice(0, 8);
  const totalStudents = courses.reduce((total, course) => total + (course.students_count || 0), 0);
  const safeLeaderboard = leaderboard ?? { total_points: [], rising: [] };
  const popularPosts = [...posts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);
  const institutionCategoryFilters = Array.from(
    new Set(institutions.map((institution) => institution.category?.trim()).filter(Boolean))
  );
  const questionCategoryFilters = institutionCategoryFilters;
  const hotQuestionItems = publishedQuestions.slice(0, 4).map((question) => ({
    title: getQuestionDisplayTitle(question),
    type: questionTypeLabels[question.type] ?? question.type,
    meta: [question.difficulty, question.skill_area].filter(Boolean).join(" · ") || "综合练习",
    points: question.points
  }));


  return (
    <main className="overflow-hidden bg-[#f7fbfb]">
      <section className="relative overflow-hidden bg-[#eefaf7] text-ink">
        <div className="absolute inset-0">
          <Image
            src="/images/hero-learning.png"
            alt="在线学习场景"
            fill
            priority
            className="object-cover object-[38%_30%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#eefaf7_0%,rgba(238,250,247,0.94)_42%,rgba(255,249,231,0.62)_100%)]" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.94fr_0.72fr] lg:px-8 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-coral shadow-sm">
              <Sparkles size={16} /> Infuture Course Platform
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              整合全球优质教育资源，为华人学习者搭建学习中心！
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-700 sm:text-lg">
              连接优质教育机构、专业老师和互动式的学习平台，让海内外学生在清晰路径、即时练习和积分激励中持续成长。
            </p>
            <div className="mt-7 flex max-w-xl items-center gap-2 rounded-lg border border-white/70 bg-white/95 p-2 text-ink shadow-soft">
              <Search size={20} className="ml-3 text-slate-400" />
              <input
                aria-label="搜索课程"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="搜索中文、语言、IT、艺术课程"
              />
              <Link href="/courses" className="rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white">
                搜索
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
                浏览课程 <ArrowRight size={18} />
              </Link>
              <Link href="/question-bank" className="inline-flex items-center gap-2 rounded-lg border border-mint/35 bg-white/85 px-5 py-3 text-sm font-bold text-mint hover:border-mint">
                进入题库 <BrainCircuit size={18} />
              </Link>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-start lg:-ml-8 lg:pt-2">
            <div className="relative w-full overflow-hidden rounded-lg border border-white/80 bg-white/88 p-3 shadow-soft backdrop-blur sm:p-4 lg:max-w-[25rem]">
              {heroCourse?.hero_image_url ? (
                <img src={heroCourse.hero_image_url} alt={heroCourse.title} className="h-48 w-full rounded-lg object-cover object-[center_30%] sm:h-52" />
              ) : (
                <div className="grid h-48 w-full place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500 sm:h-52">
                  尚未上传课程封面
                </div>
              )}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-coral">Featured Course</p>
                  <h2 className="mt-1 text-xl font-black text-ink">{heroCourse?.title ?? "精选课程即将上线"}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                    {heroCourse?.subtitle ?? "机构发布课程后，将会在这里展示课程亮点。"}
                  </p>
                </div>
                <Link href={heroCourse ? `/courses/${heroCourse.slug}` : "/courses"} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-coral text-white">
                  <PlayCircle size={21} />
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                <div>
                  <p className="text-xl font-black text-ink">{courses.length}</p>
                  <p className="text-xs text-slate-500">课程</p>
                </div>
                <div>
                  <p className="text-xl font-black text-ink">{institutions.length}</p>
                  <p className="text-xs text-slate-500">机构</p>
                </div>
                <div>
                  <p className="text-xl font-black text-ink">{totalStudents}</p>
                  <p className="text-xs text-slate-500">学习人次</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 -mt-10 bg-transparent pb-10 pt-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {platformHighlights.map((highlight) => {
              const Icon = highlight.icon;
              return (
                <div key={highlight.title} className="rounded-lg border border-slate-200 bg-white/95 p-6 shadow-soft backdrop-blur md:p-7">
                  <Icon size={26} className="text-mint" />
                  <h3 className="mt-4 text-xl font-black text-ink">{highlight.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{highlight.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f7fbfb] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Institutions" title="精选入驻机构" subtitle="平台持续连接优质教育机构，让课程、题库和教学服务集中呈现。" />
          <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {institutions.length > 0 ? (
              institutions.slice(0, 8).map((institution) => <InstitutionLogo key={institution.id} institution={institution} />)
            ) : (
              <p className="text-sm text-slate-500">暂无入驻机构。</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle eyebrow="Courses" title="热门课程" subtitle="按月订阅，每门课程 39 欧元/月，发布后的课程会在前台展示。" />
            <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-coral hover:text-coral">
              查看全部 <ChevronRight size={17} />
            </Link>
          </div>
          <div className="mt-7">
            {featuredCourses.length > 0 ? (
              <ScrollRow>
                {featuredCourses.map((course) => (
                  <CourseCard key={course.id} course={course} className="w-[calc((100%-3rem)/4)] min-w-[17rem] shrink-0" />
                ))}
              </ScrollRow>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">暂无已发布课程。</div>
            )}
          </div>
        </div>
      </section>



      <section className="bg-[#eef8f4] py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <SectionTitle title="学习越主动，积分越领先" subtitle="平台会根据课程完成速度、章节进度和测验成绩计算学习积分，帮助学生看到自己的成长节奏。" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {pointRules.map((rule) => {
                const Icon = rule.icon;
                return (
                  <div key={rule.title} className="rounded-lg border border-white/80 bg-white/80 p-4">
                    <Icon size={20} className="text-coral" />
                    <h3 className="mt-3 font-black text-ink">{rule.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{rule.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <LeaderboardCard title="学生总积分排名" subtitle="Total Points" entries={safeLeaderboard.total_points} metric="total" />
            <LeaderboardCard title="上升速度排名" subtitle="Rising Speed" entries={safeLeaderboard.rising} metric="weekly" />
          </div>
        </div>
      </section>

                  <section className="relative -mx-4 overflow-hidden bg-[#fff8df] py-16 sm:-mx-6 md:py-20 lg:-mx-8">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(125deg,#fff8df_0%,#eef8ec_48%,#fff0dd_100%)]" />
        <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-28 w-full text-emerald-300/45" viewBox="0 0 1440 160" preserveAspectRatio="none" fill="none">
          <path d="M0 120C145 82 246 132 399 98C566 61 705 114 864 82C1049 46 1187 80 1440 46V160H0V120Z" fill="currentColor" />
          <path d="M74 119C94 100 113 100 132 122M226 116C249 92 271 98 293 125M1160 93C1184 68 1208 77 1230 105M1307 80C1331 57 1359 67 1382 96" stroke="#71b780" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <svg aria-hidden="true" className="absolute right-0 top-0 h-56 w-[34rem] text-lime-500/40" viewBox="0 0 520 240" fill="none">
          <path d="M28 54C101 96 161 21 232 62C296 99 342 37 488 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <g fill="currentColor">
            <ellipse cx="92" cy="72" rx="24" ry="11" transform="rotate(-27 92 72)" />
            <ellipse cx="146" cy="60" rx="23" ry="10" transform="rotate(29 146 60)" />
            <ellipse cx="215" cy="62" rx="22" ry="10" transform="rotate(-26 215 62)" />
            <ellipse cx="294" cy="80" rx="24" ry="11" transform="rotate(25 294 80)" />
            <ellipse cx="388" cy="60" rx="25" ry="11" transform="rotate(-21 388 60)" />
            <ellipse cx="442" cy="82" rx="20" ry="9" transform="rotate(28 442 82)" />
          </g>
        </svg>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:min-h-[45rem] lg:px-8">
          <div aria-hidden="true" className="pointer-events-none absolute right-[-3rem] top-20 hidden h-[34rem] w-[46rem] max-w-[62%] lg:block">
            <svg className="h-full w-full" viewBox="0 0 760 560" fill="none">
              <path d="M98 268C156 144 270 86 392 102C543 122 665 225 682 350C702 498 533 548 372 529C192 508 35 402 98 268Z" fill="#F5E7C8" opacity="0.72" />
              <path d="M212 214L381 100L552 214V424H212V214Z" fill="#FFF7E5" stroke="#DEBF8E" strokeWidth="6" strokeLinejoin="round" />
              <path d="M184 227L381 92L580 227" stroke="#D9AD72" strokeWidth="12" strokeLinecap="round" />
              <rect x="250" y="248" width="108" height="76" rx="8" fill="#DDEEF9" stroke="#89B7D6" strokeWidth="4" />
              <rect x="407" y="248" width="108" height="76" rx="8" fill="#DDEEF9" stroke="#89B7D6" strokeWidth="4" />
              <path d="M170 431C292 392 475 394 620 432" stroke="#7FC58C" strokeWidth="16" strokeLinecap="round" opacity="0.55" />
              <path d="M222 410H587" stroke="#B58454" strokeWidth="18" strokeLinecap="round" />
              <path d="M278 410L252 505M538 410L570 505" stroke="#8F6846" strokeWidth="10" strokeLinecap="round" />
              <circle cx="316" cy="308" r="38" fill="#FFD7B7" />
              <path d="M279 306C286 258 349 260 358 306C338 289 312 284 279 306Z" fill="#2C2A35" />
              <path d="M279 337C291 374 344 373 357 337" stroke="#2C2A35" strokeWidth="8" strokeLinecap="round" />
              <path d="M268 392C281 354 352 350 370 392L386 441H252L268 392Z" fill="#6FBF9B" />
              <path d="M368 367C403 381 421 392 441 410" stroke="#FFD7B7" strokeWidth="16" strokeLinecap="round" />
              <circle cx="492" cy="306" r="36" fill="#FFE0BE" />
              <path d="M456 306C463 260 529 256 535 314C509 293 483 291 456 306Z" fill="#6B422E" />
              <path d="M462 337C477 370 520 370 535 337" stroke="#6B422E" strokeWidth="8" strokeLinecap="round" />
              <path d="M444 393C464 355 526 356 548 393L564 441H428L444 393Z" fill="#F17873" />
              <path d="M444 366C413 384 391 396 369 410" stroke="#FFE0BE" strokeWidth="16" strokeLinecap="round" />
              <rect x="330" y="356" width="104" height="72" rx="7" fill="#344055" />
              <path d="M316 428H450" stroke="#5A667D" strokeWidth="10" strokeLinecap="round" />
              <path d="M149 336C119 309 106 274 118 234" stroke="#7AB2E8" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
              <path d="M112 233L143 243L119 263" stroke="#7AB2E8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M643 288C677 258 688 224 678 184" stroke="#F0A35E" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
              <path d="M676 181L647 196L675 211" stroke="#F0A35E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M618 172C638 149 657 151 668 174C647 183 631 183 618 172Z" fill="#F17873" opacity="0.75" />
            </svg>
          </div>

          <div className="relative z-10 max-w-2xl rotate-[-0.8deg] pt-2">
            <div className="inline-flex items-center gap-2 rounded-lg bg-white/75 px-4 py-2 text-sm font-bold text-[#5f60c9] shadow-sm ring-1 ring-[#dcd9ff]">
              <Sparkles size={15} className="text-coral" />
              Why Online Learning
            </div>
            <h2 className="mt-6 text-4xl font-black leading-tight tracking-wide text-ink md:text-5xl lg:text-6xl" style={{ fontFamily: 'KaiTi, STKaiti, "Microsoft YaHei", sans-serif' }}>
              {"\u7701\u65f6\u95f4\uff0c\u7701\u7cbe\u529b\uff0c"}
              <span className="text-coral">{"\u66f4\u7701\u94b1\u5305\uff01"}</span>
              {"\u7ebf\u4e0b\u8bfe\u6709\u7684\u5185\u5bb9\uff0c\u6211\u4eec\u5168\u6709\uff01"}
            </h2>
            <p className="mt-5 max-w-xl text-lg font-semibold leading-8 text-slate-700">
              {"\u628a\u597d\u8bfe\u7a0b\u3001\u597d\u8001\u5e08\u548c\u5b66\u4e60\u52a8\u529b\u5e26\u5230\u6bcf\u4e2a\u5bb6\u5ead"}
            </p>
          <p className="relative z-10 mt-7 inline-flex rotate-[-1deg] rounded-lg bg-[#eef9df]/85 px-5 py-3 pl-9 text-xl font-black text-[#6b9f52] shadow-sm ring-1 ring-[#c7e3a6] lg:absolute lg:left-[5%] lg:top-[21rem] lg:mt-0">
            <span aria-hidden="true" className="absolute -left-3 -top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-[#f0a35e] bg-[#fff8d8] text-[#e68b4d] shadow-sm rotate-[-10deg]">
              <Award size={22} />
            </span>
            {"\u5b66\u4e60\u66f4\u6709\u8da3\uff0c\u6210\u957f\u770b\u5f97\u89c1\uff01"}
          </p>
          </div>

          <div className="relative z-10 mt-8 grid gap-5 sm:grid-cols-2 lg:static lg:mt-0 lg:block">
            {[
              {
                title: "结构化学习",
                text: "每门课程按章节推进，视频、讲义、练习和测验形成完整路径。",
                icon: BookOpenCheck,
                className: "lg:absolute lg:left-[2%] lg:top-[28rem] lg:w-[19rem] rotate-[-2deg]",
                border: "border-[#83bf72]",
                tint: "bg-[#fbfff4]/90",
                iconClass: "text-[#63a95b]"
              },
              {
                title: "全球家庭友好",
                text: "适配欧洲和全球华人家庭的学习时间与中文教育需求。",
                icon: Globe2,
                className: "lg:absolute lg:left-[31%] lg:top-[32rem] lg:w-[20rem] rotate-[2deg]",
                border: "border-[#75b5df]",
                tint: "bg-[#f5fbff]/90",
                iconClass: "text-[#5b9bd1]"
              },
              {
                title: "老师与机构协同",
                text: "机构维护课程和题库，老师关注教学反馈与学习结果。",
                icon: Users,
                className: "lg:absolute lg:left-[51%] lg:top-[12.5rem] lg:w-[19rem] rotate-[1.5deg]",
                border: "border-[#78c8b3]",
                tint: "bg-[#f5fffb]/90",
                iconClass: "text-[#4da58f]"
              },
              {
                title: "目标感更强",
                text: "积分榜、完成进度和测验结果让学生看到自己的成长。",
                icon: Target,
                className: "lg:absolute lg:right-[4%] lg:top-[29.5rem] lg:w-[20rem] rotate-[-1.5deg]",
                border: "border-[#f3a76d]",
                tint: "bg-[#fff8f0]/90",
                iconClass: "text-[#e68b4d]"
              }
            ].map(({ title, text, icon: Icon, className, border, tint, iconClass }) => (
              <div key={title} className={`relative z-10 rounded-lg p-5 shadow-[0_18px_45px_rgba(84,93,70,0.12)] backdrop-blur-sm ${tint} ${className}`}>
                <div aria-hidden="true" className={`absolute inset-0 rounded-lg border-2 border-dashed ${border}`} />
                <div aria-hidden="true" className={`absolute -inset-1 rounded-lg border-2 ${border} opacity-45 rotate-[1.8deg]`} />
                <div aria-hidden="true" className="absolute -right-3 -top-3 h-8 w-8 rounded-lg border-2 border-dashed border-coral/50 rotate-[18deg]" />
                <div className="relative">
                  <Icon size={24} className={iconClass} />
                  <h3 className="mt-3 text-xl font-black text-ink">{title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-700">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <svg aria-hidden="true" className="absolute left-[34%] top-[23rem] z-0 hidden h-52 w-72 text-sky-400/60 lg:block" viewBox="0 0 290 210" fill="none">
            <path d="M28 58C87 39 137 58 162 97C184 132 213 145 260 120" stroke="currentColor" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
            <path d="M256 120L229 112L239 141" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M54 157C66 139 83 139 94 158C79 166 66 166 54 157Z" fill="#F17873" opacity="0.72" />
            <path d="M109 179L124 163L140 180M124 163V198" stroke="#F0A35E" strokeWidth="3" strokeLinecap="round" />
          </svg>

        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#f0fbff_0%,#edf9f3_48%,#fff8e8_100%)] py-14">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-slate-200/70" />
        <svg aria-hidden="true" className="absolute -right-24 top-8 hidden h-72 w-72 text-mint/15 lg:block" viewBox="0 0 280 280" fill="none">
          <path d="M32 150C74 78 142 40 213 72C265 96 266 177 215 220C153 273 55 239 32 150Z" fill="currentColor" />
          <path d="M78 124H198M78 158H168M78 192H136" stroke="#6fc9ad" strokeWidth="10" strokeLinecap="round" opacity="0.45" />
        </svg>
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1.5 text-sm font-bold text-mint shadow-sm ring-1 ring-mint/15">
              <BrainCircuit size={16} /> Question Bank
            </p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-ink md:text-4xl">
              {"\u9898\u5e93\u7ec3\u4e60\u4e2d\u5fc3"}
              <span className="mt-2 block text-coral">{"\u641c\u9898\u3001\u5206\u7c7b\u7ec3\u3001\u62ff\u79ef\u5206"}</span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700">
              {"\u6309\u9898\u76ee\u3001\u77e5\u8bc6\u70b9\u548c\u673a\u6784\u7c7b\u522b\u5feb\u901f\u627e\u5230\u9002\u5408\u7684\u7ec3\u4e60\uff0c\u8ba9\u8bfe\u540e\u5de9\u56fa\u548c\u6d4b\u9a8c\u51b2\u523a\u66f4\u6709\u65b9\u5411\u3002"}
            </p>

            <form action="/question-bank" className="mt-7 flex max-w-xl items-center gap-2 rounded-lg border border-white/80 bg-white/95 p-2 shadow-soft">
              <Search size={20} className="ml-3 text-slate-400" />
              <input
                name="q"
                aria-label="\u641c\u7d22\u9898\u76ee"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder={"\u641c\u7d22\u9898\u76ee\u3001\u77e5\u8bc6\u70b9\u3001\u7ea7\u522b"}
              />
              <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                {"\u641c\u7d22"}
              </button>
            </form>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-black text-ink">
                  <Search size={18} className="text-coral" /> {"\u641c\u7d22\u9898\u76ee"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{"\u8f93\u5165\u9898\u5e72\u3001\u77e5\u8bc6\u70b9\u6216\u7ea7\u522b\uff0c\u5feb\u901f\u5b9a\u4f4d\u7ec3\u4e60\u5185\u5bb9\u3002"}</p>
              </div>
              <div className="rounded-lg border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-black text-ink">
                  <Target size={18} className="text-mint" /> {"\u6309\u7c7b\u522b\u627e\u9898"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{"\u4f7f\u7528\u673a\u6784\u7c7b\u522b\u505a\u5206\u7c7b\uff0c\u9002\u5408\u6309\u5b66\u4e60\u573a\u666f\u5feb\u901f\u7b5b\u9009\u3002"}</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-black text-ink">{"\u673a\u6784\u7c7b\u522b"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {questionCategoryFilters.length > 0 ? questionCategoryFilters.map((category) => (
                  <Link
                    key={category}
                    href={`/question-bank?category=${encodeURIComponent(category)}`}
                    className="rounded-lg border border-mint/20 bg-white/80 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-mint hover:text-mint"
                  >
                    {category}
                  </Link>
                )) : (
                  <span className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold text-slate-500">暂无机构类别</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/80 bg-white/72 p-5 shadow-soft backdrop-blur md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-coral">Today Hot</p>
                <h3 className="mt-1 text-2xl font-black text-ink">{"\u4eca\u65e5\u70ed\u95e8\u9898\u76ee"}</h3>
              </div>
              <Link href="/question-bank" className="inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white hover:bg-[#f25f54]">
                {"\u8fdb\u5165\u9898\u5e93"} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-5 grid gap-3">
              {hotQuestionItems.length > 0 ? hotQuestionItems.map((question, index) => (
                <Link
                  key={`${question.title}-${index}`}
                  href="/question-bank"
                  className="group flex items-center gap-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-coral"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-mint/12 px-2 py-1 text-xs font-bold text-mint">{question.type}</span>
                      <span className="rounded-lg bg-coral/10 px-2 py-1 text-xs font-bold text-coral">{question.points} {"\u5206"}</span>
                    </div>
                    <p className="mt-2 truncate text-base font-black text-ink group-hover:text-coral">{question.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{question.meta}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-slate-300 group-hover:text-coral" />
                </Link>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-5 text-sm font-semibold leading-6 text-slate-500">
                  暂无已发布题目，机构发布题目后会自动显示在这里。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffaf0] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle eyebrow="Teachers" title="专业老师" subtitle="老师资料来自机构后台，学生可以在课程详情中了解授课老师。" />
            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">
              <GraduationCap size={18} /> 专业授课团队
            </span>
          </div>
          <div className="mt-7">
            {visibleTeachers.length > 0 ? (
              <ScrollRow>
                {visibleTeachers.map((teacher) => <TeacherCard key={teacher.id} teacher={teacher} />)}
              </ScrollRow>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-500">暂无老师资料。</div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle
              eyebrow="Blog"
              title={"\u70ed\u95e8 Blog \u6587\u7ae0"}
              subtitle={"\u9605\u8bfb\u5728\u7ebf\u5b66\u4e60\u3001\u6d77\u5916\u4e2d\u6587\u6559\u80b2\u548c\u8bfe\u7a0b\u9009\u62e9\u7684\u5b9e\u7528\u5185\u5bb9\u3002"}
            />
            <Link href="/blog" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-coral hover:text-coral">
              {"\u524d\u5f80\u535a\u5ba2\u9875\u9762"} <ChevronRight size={17} />
            </Link>
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {popularPosts.length > 0 ? (
              popularPosts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`} className="group overflow-hidden rounded-lg border border-slate-200 bg-[#f8fbfb] shadow-sm transition hover:-translate-y-1 hover:border-coral hover:shadow-soft">
                  {post.cover_url ? (
                    <img src={post.cover_url} alt={post.title} className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="grid h-44 w-full place-items-center bg-mint/10 text-sm font-bold text-mint">
                      Blog
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                      <span className="text-coral">{post.author_name}</span>
                      <span>{new Date(post.created_at).toLocaleDateString("zh-CN")}</span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-xl font-black leading-7 text-ink">{post.title}</h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{post.excerpt}</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-mint">
                      {"\u9605\u8bfb\u6587\u7ae0"} <ArrowRight size={16} />
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500 md:col-span-3">
                {"\u6682\u65e0\u535a\u5ba2\u6587\u7ae0\u3002"}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,#f7fbfb_0%,#edf9f6_48%,#fff6df_100%)] py-14 text-ink">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="font-bold text-coral">Learning Journey</p>
            <h2 className="mt-3 text-3xl font-black">从选课到积分成长，每一步都更清楚</h2>
            <p className="mt-4 max-w-xl leading-7 text-black">
              首页负责吸引和筛选，课程详情负责建立信任，个人课堂负责完成学习，后台管理负责沉淀内容和运营数据。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {learningSteps.map(([title, text], index) => (
              <div key={title} className="rounded-lg border border-white/70 bg-white/80 p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-mint text-lg font-black text-ink">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-black text-ink">{title}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-black">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}

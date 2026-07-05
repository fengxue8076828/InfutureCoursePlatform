import {
  ArrowRight,
  Award,
  BookOpenCheck,
  BrainCircuit,
  ChevronRight,
  Globe2,
  GraduationCap,
  Layers3,
  Lightbulb,
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
import { getCourses, getInstitutions, getStudentLeaderboard, getTeachers } from "@/lib/api";
import type { Institution, StudentLeaderboardEntry } from "@/lib/types";

const platformHighlights = [
  {
    title: "面向海外中文家庭",
    text: "围绕欧洲和全球华人家庭的学习节奏，连接优质机构、专业老师和可追踪的在线课堂。",
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


const questionBankFeatures = [
  { title: "按级别练", text: "从语言等级到学科年级，按学习阶段逐步提升。", icon: Layers3 },
  { title: "看提示", text: "遇到难题时先获得提示，再继续独立思考。", icon: Lightbulb },
  { title: "拿积分", text: "练习完成和高分测验都会进入积分成长体系。", icon: Trophy }
];

const learningSteps = [
  ["选择课程", "按类别、机构、级别快速筛选适合自己的课程。"],
  ["订阅学习", "39 欧元/月/课程，订阅后进入个人课堂。"],
  ["完成章节", "视频、讲义、练习和测验组成清晰学习节奏。"],
  ["获得积分", "越快完成、测验分数越高，积分和排名提升越明显。"]
];

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
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={institution.name} className="h-12 w-12 rounded-lg object-contain" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-mint/15 font-black text-mint">
          {institution.name.slice(0, 1)}
        </span>
      )}
      <p className="truncate text-sm font-bold text-ink">{institution.name}</p>
    </div>
  );
}

export default async function HomePage() {
  const [courses, institutions, teachers, leaderboard] = await Promise.all([
    getCourses(),
    getInstitutions(),
    getTeachers(),
    getStudentLeaderboard()
  ]);

  const hotCourses = courses.filter((course) => course.is_hot);
  const featuredCourses = (hotCourses.length > 0 ? hotCourses : courses).slice(0, 8);
  const heroCourse = featuredCourses[0];
  const visibleTeachers = teachers.slice(0, 8);
  const totalStudents = courses.reduce((total, course) => total + (course.students_count || 0), 0);
  const safeLeaderboard = leaderboard ?? { total_points: [], rising: [] };

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
              把中文教育做得更系统、更有动力
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-700 sm:text-lg">
              连接优质教育机构、专业老师和可追踪的学习平台，让海外学生在清晰路径、即时练习和积分激励中持续成长。
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
                {featuredCourses.map((course) => <CourseCard key={course.id} course={course} />)}
              </ScrollRow>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">暂无已发布课程。</div>
            )}
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

                  <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff8ff_44%,#fff6df_100%)] shadow-soft lg:grid-cols-[1fr_0.95fr]">
            <div className="relative min-h-[24rem] overflow-hidden bg-slate-100">
              <Image
                src="/images/hero-learning.png"
                alt="在线学习场景"
                fill
                className="object-cover object-[center_32%]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,33,47,0.08)_0%,rgba(255,255,255,0.14)_58%,rgba(255,255,255,0.76)_100%)]" />
              <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["随时学习", "适合欧洲多时区家庭"],
                  ["实时练习", "边学边测更容易坚持"],
                  ["成长记录", "进度、积分、测验都可追踪"]
                ].map(([title, text]) => (
                  <div key={title} className="rounded-lg border border-white/70 bg-white/85 p-3 shadow-sm backdrop-blur">
                    <p className="font-black text-ink">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
              <p className="inline-flex w-fit items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-sm font-bold text-coral">
                <Sparkles size={16} /> Why Online Learning
              </p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-ink md:text-4xl">
                把好课程、好老师和学习动力带到每个家庭
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 md:text-base">
                平台把课程内容、章节练习、测验反馈和积分激励整合在一起，让学生不只是“看课”，而是真正形成可以持续推进的学习节奏。
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["结构化学习", "每门课程按章节推进，视频、讲义、练习和测验形成完整路径。", BookOpenCheck],
                  ["全球家庭友好", "适配欧洲和全球华人家庭的学习时间与中文教育需求。", Globe2],
                  ["老师与机构协同", "机构维护课程和题库，老师关注教学反馈与学习结果。", Users],
                  ["目标感更强", "积分榜、完成进度和测验结果让学生看到自己的成长。", Target]
                ].map(([title, text, Icon]) => (
                  <div key={title as string} className="rounded-lg border border-slate-200 bg-white/80 p-4">
                    <Icon size={20} className="text-mint" />
                    <h3 className="mt-3 font-black text-ink">{title as string}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{text as string}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white hover:bg-[#f25f54]">
                  探索课程 <ArrowRight size={18} />
                </Link>
                <Link href="/learn" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-mint hover:text-mint">
                  查看我的课堂 <BookOpenCheck size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

<section className="bg-[#f6fbff] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 rounded-lg border border-slate-200 bg-white p-6 shadow-soft lg:grid-cols-[0.88fr_1.12fr] lg:p-8">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-mint/12 px-3 py-1 text-sm font-bold text-mint">
                <BrainCircuit size={16} /> Question Bank
              </p>
              <h2 className="mt-4 text-3xl font-black text-ink">题库训练入口</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                题库页面集中展示已发布题目，学生可以按级别、题型和知识点进行针对性练习，也能通过提示继续推进思考。
              </p>
              <Link href="/question-bank" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
                进入题库页面 <ArrowRight size={18} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {questionBankFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Icon size={20} className="text-coral" />
                    <h3 className="mt-3 font-black text-ink">{feature.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{feature.text}</p>
                  </div>
                );
              })}
            </div>
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
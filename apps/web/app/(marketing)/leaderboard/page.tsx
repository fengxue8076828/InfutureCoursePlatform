import {
  ArrowRight,
  Award,
  BookOpenCheck,
  Heart,
  Medal,
  MessageCircle,
  Sparkles,
  Trophy,
  TrendingUp,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";

import { getStudentLeaderboard } from "@/lib/api";
import type { StudentLeaderboardEntry } from "@/lib/types";

type RankingMetric = "total" | "weekly" | "course" | "community" | "competition" | "followers";
type RankingTone = "coral" | "mint" | "blue" | "amber" | "violet" | "rose";

const toneStyles: Record<
  RankingTone,
  {
    panel: string;
    icon: string;
    rank: string;
    badge: string;
    line: string;
  }
> = {
  coral: {
    panel: "border-coral/20 bg-[linear-gradient(135deg,#fffaf7_0%,#ffffff_54%,#fff6f1_100%)]",
    icon: "bg-coral/10 text-coral",
    rank: "bg-coral/10 text-coral",
    badge: "bg-coral/10 text-coral",
    line: "bg-coral/40"
  },
  mint: {
    panel: "border-mint/20 bg-[linear-gradient(135deg,#f7fdfb_0%,#ffffff_58%,#f2faf7_100%)]",
    icon: "bg-mint/10 text-mint",
    rank: "bg-mint/10 text-mint",
    badge: "bg-mint/10 text-mint",
    line: "bg-mint/40"
  },
  blue: {
    panel: "border-sky-100 bg-[linear-gradient(135deg,#f7fbff_0%,#ffffff_55%,#f4f8ff_100%)]",
    icon: "bg-sky-100 text-sky-600",
    rank: "bg-sky-100 text-sky-600",
    badge: "bg-sky-50 text-sky-600",
    line: "bg-sky-300"
  },
  amber: {
    panel: "border-amber-100 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_55%,#fff8e9_100%)]",
    icon: "bg-amber-100 text-amber-700",
    rank: "bg-amber-100 text-amber-700",
    badge: "bg-amber-50 text-amber-700",
    line: "bg-amber-300"
  },
  violet: {
    panel: "border-violet-100 bg-[linear-gradient(135deg,#fbf8ff_0%,#ffffff_55%,#f8f5ff_100%)]",
    icon: "bg-violet-100 text-violet-600",
    rank: "bg-violet-100 text-violet-600",
    badge: "bg-violet-50 text-violet-600",
    line: "bg-violet-300"
  },
  rose: {
    panel: "border-rose-100 bg-[linear-gradient(135deg,#fff8fa_0%,#ffffff_55%,#fff9fb_100%)]",
    icon: "bg-rose-100 text-rose-600",
    rank: "bg-rose-100 text-rose-600",
    badge: "bg-rose-50 text-rose-600",
    line: "bg-rose-300"
  }
};

const levelRows = [
  ["◇", "启航学徒", "0"],
  ["◈", "路径探索者", "300"],
  ["◉", "专注训练师", "800"],
  ["◆", "知识骑士", "1500"],
  ["★", "解题先锋", "2600"],
  ["✶", "学习领航员", "4200"],
  ["✦", "智慧守护者", "6500"],
  ["✧", "星辰导师", "10000"]
];

const ruleRows = [
  ["课程表现", "练习和测验达到 80% 才给分，一次通过积分最高，第二次通过减半，三次及以后通过不再给分。完成整门课程和写课程笔记也会获得积分。"],
  ["社区影响", "提出问题、回答问题、分享笔记都会获得积分；问题、回答和笔记被点赞越多，积分越高。"],
  ["考试竞赛", "模拟考试和竞赛都会按完成数量与成绩计分，竞赛权重更高，高分会获得额外奖励。"],
  ["人气成长", "被同学关注也会计入总积分，人气排行榜直接按关注你的学生人数排序。"]
];

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "学";
}

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("zh-CN");
}

function metricValue(entry: StudentLeaderboardEntry, metric: RankingMetric) {
  if (metric === "weekly") return entry.weekly_points;
  if (metric === "course") return entry.course_points ?? 0;
  if (metric === "community") return entry.community_points ?? 0;
  if (metric === "competition") return entry.competition_points ?? 0;
  if (metric === "followers") return entry.followers_count ?? 0;
  return entry.total_points;
}

function metricLabel(metric: RankingMetric) {
  if (metric === "weekly") return "近 7 天增长";
  if (metric === "followers") return "关注人数";
  return "积分";
}

function StudentAvatar({ entry, compact = false }: { entry: StudentLeaderboardEntry; compact?: boolean }) {
  const size = compact ? "h-9 w-9" : "h-12 w-12";
  if (entry.avatar_url) {
    return <img src={entry.avatar_url} alt={entry.student_name} className={`${size} rounded-lg object-cover`} />;
  }
  return (
    <span className={`${size} grid place-items-center rounded-lg bg-white text-sm font-black text-slate-500 shadow-sm`}>
      {initials(entry.student_name)}
    </span>
  );
}

function RankingEntry({
  entry,
  metric,
  tone,
  featured = false
}: {
  entry: StudentLeaderboardEntry;
  metric: RankingMetric;
  tone: RankingTone;
  featured?: boolean;
}) {
  const styles = toneStyles[tone];
  return (
    <Link
      href={`/leaderboard/${entry.student_id}`}
      className={`group flex items-center gap-3 rounded-lg border border-white/80 bg-white/80 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md ${
        featured ? "p-4" : "p-3"
      }`}
    >
      <span className={`grid shrink-0 place-items-center rounded-lg font-black ${styles.rank} ${featured ? "h-11 w-11 text-base" : "h-8 w-8 text-xs"}`}>
        {entry.rank}
      </span>
      <StudentAvatar entry={entry} compact={!featured} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-black text-ink group-hover:text-coral ${featured ? "text-base" : "text-sm"}`}>{entry.student_name}</p>
        <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ${styles.badge}`}>
          {entry.level.icon} {entry.level.name}
        </p>
        {featured ? (
          <p className="mt-1 text-xs font-semibold text-slate-500">
            已完成 {entry.completed_courses} 门 · 平均进度 {entry.average_progress}%
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className={`${featured ? "text-xl" : "text-base"} font-black text-ink`}>{formatNumber(metricValue(entry, metric))}</p>
        <p className="text-xs font-semibold text-slate-500">{metricLabel(metric)}</p>
      </div>
    </Link>
  );
}

function RankingList({
  title,
  subtitle,
  entries,
  metric,
  icon: Icon,
  tone,
  featured = false
}: {
  title: string;
  subtitle: string;
  entries: StudentLeaderboardEntry[];
  metric: RankingMetric;
  icon: LucideIcon;
  tone: RankingTone;
  featured?: boolean;
}) {
  const styles = toneStyles[tone];
  const visibleEntries = featured ? entries.slice(0, 8) : entries.slice(0, 5);

  return (
    <section className={`relative overflow-hidden rounded-lg border p-4 shadow-soft ${styles.panel} ${featured ? "md:p-7" : "md:p-5"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-white/60">
        <div className={`h-full ${styles.line}`} style={{ width: featured ? "58%" : "38%" }} />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`font-black ${featured ? "text-sm" : "text-xs"} ${styles.badge} inline-flex rounded-full px-3 py-1`}>{subtitle}</p>
          <h2 className={`mt-3 font-black text-ink ${featured ? "text-4xl sm:text-5xl" : "text-xl"}`}>{title}</h2>
        </div>
        <span className={`grid shrink-0 place-items-center rounded-lg shadow-sm ${styles.icon} ${featured ? "h-16 w-16" : "h-11 w-11"}`}>
          <Icon size={featured ? 32 : 22} />
        </span>
      </div>

      <div className={`grid ${featured ? "mt-7 gap-3" : "mt-5 gap-2.5"}`}>
        {visibleEntries.length > 0 ? (
          visibleEntries.map((entry) => <RankingEntry key={`${metric}-${entry.student_id}`} entry={entry} metric={metric} tone={tone} featured={featured} />)
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-5 text-sm leading-6 text-slate-500">
            暂无学生积分数据。
          </div>
        )}
      </div>
    </section>
  );
}

export default async function LeaderboardPage() {
  const leaderboard = await getStudentLeaderboard();
  const totalPoints = leaderboard.total_points ?? [];
  const rising = leaderboard.rising ?? [];
  const coursePoints = leaderboard.course_points ?? [];
  const communityPoints = leaderboard.community_points ?? [];
  const competitionPoints = leaderboard.competition_points ?? [];
  const followers = leaderboard.followers ?? [];
  const topStudent = totalPoints[0] ?? rising[0];

  return (
    <main className="bg-[#f7fbfb]">
      <section className="bg-[linear-gradient(135deg,#e9fff6_0%,#fff3df_48%,#eef5ff_100%)] py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.78fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-coral/15 bg-white/85 px-3 py-1.5 text-sm font-black text-coral shadow-sm">
              <Medal size={16} />
              学习积分榜
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
              每一次通过、分享和进步，都值得被看见
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
              总龙虎榜展示综合实力，其他小榜单记录进步速度、课程努力、社区活跃、考试竞赛和人气影响力。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white hover:bg-[#f25f54]">
                去选课 <ArrowRight size={18} />
              </Link>
              <Link href="/learn" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-ink hover:border-mint hover:text-mint">
                查看我的学习 <BookOpenCheck size={18} />
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-white/80 bg-white/90 p-5 shadow-soft">
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-100/55 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-mint/10 blur-2xl" />
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-500">当前榜首</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                <Sparkles size={14} />
                荣誉席位
              </span>
            </div>
            {topStudent ? (
              <div className="relative mt-4 overflow-hidden rounded-lg border border-amber-200/70 bg-[linear-gradient(135deg,#fffdf7_0%,#ffffff_40%,#f3fbf6_100%)] p-5 shadow-sm">
                <div className="pointer-events-none absolute right-5 top-5 text-[92px] font-black leading-none text-amber-100/70">1</div>
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-amber-200 bg-white text-amber-600 shadow-sm">
                      <Trophy size={28} />
                    </span>
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        <Medal size={14} />
                        总龙虎榜 No.1
                      </div>
                      <p className="mt-3 text-3xl font-black text-ink">{topStudent.student_name}</p>
                      <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-mint/10 px-3 py-1 text-sm font-black text-mint">
                        {topStudent.level.icon} {topStudent.level.name}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white/85 px-5 py-4 text-right shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Total</p>
                    <p className="mt-1 text-4xl font-black text-ink">{formatNumber(topStudent.total_points)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">近 7 天 +{formatNumber(topStudent.weekly_points)}</p>
                  </div>
                </div>

                <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "课程积分", value: topStudent.course_points, icon: BookOpenCheck, style: "bg-sky-50 text-sky-700" },
                    { label: "社区互动", value: topStudent.community_points, icon: MessageCircle, style: "bg-violet-50 text-violet-700" },
                    { label: "考试竞赛", value: topStudent.competition_points, icon: Award, style: "bg-amber-50 text-amber-700" },
                    { label: "人气积分", value: topStudent.follower_points, icon: Heart, style: "bg-rose-50 text-rose-700" }
                  ].map(({ label, value, icon: StatIcon, style }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white/85 p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className={`grid h-9 w-9 place-items-center rounded-lg ${style}`}>
                          <StatIcon size={18} />
                        </span>
                        <span className="text-sm font-black text-slate-600">{label}</span>
                      </div>
                      <span className="text-xl font-black text-ink">{formatNumber(value)}</span>
                    </div>
                  ))}
                </div>

                <div className="relative mt-5 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-600">
                    已完成 {topStudent.completed_courses} 门课程 · {formatNumber(topStudent.followers_count)} 位同学关注
                  </p>
                  <Link
                    href={`/leaderboard/${topStudent.student_id}`}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-coral"
                  >
                    查看详情 <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="relative mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-500">
                暂无领先学生，完成学习后这里会出现排名摘要。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[1.22fr_0.78fr] lg:px-8">
          <RankingList title="总龙虎榜" subtitle="综合总榜" entries={totalPoints} metric="total" icon={Trophy} tone="coral" featured />
          <div className="grid gap-5">
            <RankingList title="进步最快榜" subtitle="冲刺速度" entries={rising} metric="weekly" icon={TrendingUp} tone="mint" />
            <RankingList title="人气排行榜" subtitle="同学关注" entries={followers} metric="followers" icon={Heart} tone="rose" />
          </div>
        </div>
      </section>

      <section className="pb-12">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <RankingList title="勤勉努力榜" subtitle="课程表现" entries={coursePoints} metric="course" icon={BookOpenCheck} tone="blue" />
          <RankingList title="社牛达人榜" subtitle="社区互动" entries={communityPoints} metric="community" icon={MessageCircle} tone="violet" />
          <RankingList title="竞技能手榜" subtitle="考试竞赛" entries={competitionPoints} metric="competition" icon={Award} tone="amber" />
        </div>
      </section>

      <section className="pb-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:p-8">
            <p className="text-sm font-black text-coral">积分规则</p>
            <h2 className="mt-2 text-3xl font-black text-ink">更看重结果，也鼓励分享和互助</h2>
            <div className="mt-6 grid gap-3">
              {ruleRows.map(([title, text]) => (
                <div key={title} className="rounded-lg bg-slate-50 p-4">
                  <p className="font-black text-ink">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:p-8">
            <p className="text-sm font-black text-coral">等级体系</p>
            <h2 className="mt-2 text-3xl font-black text-ink">像游戏一样升级</h2>
            <div className="mt-6 grid gap-2">
              {levelRows.map(([icon, name, points]) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="flex items-center gap-3 font-black text-ink">
                    <span className="text-xl">{icon}</span>
                    {name}
                  </span>
                  <span className="text-sm font-bold text-slate-500">{Number(points).toLocaleString("zh-CN")}+</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

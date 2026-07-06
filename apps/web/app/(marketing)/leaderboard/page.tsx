import { ArrowRight, Award, BookOpenCheck, Medal, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";

import { getStudentLeaderboard } from "@/lib/api";
import type { StudentLeaderboardEntry } from "@/lib/types";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "\u5b66";
}

function formatPoints(points: number) {
  return points.toLocaleString("zh-CN");
}

function RankingList({
  title,
  subtitle,
  entries,
  metric,
  tone
}: {
  title: string;
  subtitle: string;
  entries: StudentLeaderboardEntry[];
  metric: "total" | "weekly";
  tone: "coral" | "mint";
}) {
  const metricLabel = metric === "total" ? "\u603b\u79ef\u5206" : "\u672c\u5468\u589e\u957f";
  const color = tone === "coral" ? "text-coral bg-coral/10" : "text-mint bg-mint/10";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-coral">{subtitle}</p>
          <h2 className="mt-1 text-2xl font-black text-ink">{title}</h2>
        </div>
        <span className={`grid h-12 w-12 place-items-center rounded-lg ${color}`}>
          {metric === "total" ? <Trophy size={24} /> : <TrendingUp size={24} />}
        </span>
      </div>

      <div className="mt-6 grid gap-3">
        {entries.length > 0 ? (
          entries.map((entry) => {
            const points = metric === "total" ? entry.total_points : entry.weekly_points;
            return (
              <Link
                key={`${metric}-${entry.student_id}`}
                href={`/leaderboard/${entry.student_id}`}
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 transition hover:border-mint/40 hover:bg-white"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-sm font-black text-white">
                  {entry.rank}
                </span>
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt={entry.student_name} className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-mint/15 text-sm font-black text-mint">
                    {initials(entry.student_name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{entry.student_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {"\u5df2\u5b8c\u6210 "}
                    {entry.completed_courses}
                    {" \u95e8 \u00b7 \u5e73\u5747\u8fdb\u5ea6 "}
                    {entry.average_progress}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-ink">{formatPoints(points)}</p>
                  <p className="text-xs text-slate-500">{metricLabel}</p>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-500">
            {"\u6682\u65e0\u5b66\u751f\u79ef\u5206\u6570\u636e\uff0c\u8ba2\u9605\u8bfe\u7a0b\u5e76\u5b8c\u6210\u5b66\u4e60\u540e\u4f1a\u663e\u793a\u6392\u540d\u3002"}
          </div>
        )}
      </div>
    </section>
  );
}

export default async function LeaderboardPage() {
  const leaderboard = await getStudentLeaderboard();
  const totalPoints = leaderboard?.total_points ?? [];
  const rising = leaderboard?.rising ?? [];
  const topStudent = totalPoints[0] ?? rising[0];

  return (
    <main className="bg-[#f7fbfb]">
      <section className="bg-[linear-gradient(135deg,#eef8f4_0%,#fff7e9_52%,#f7fbfb_100%)] py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-coral/15 bg-white/80 px-3 py-1.5 text-sm font-bold text-coral shadow-sm">
              <Medal size={16} />
              {"\u79ef\u5206\u699c"}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
              {"\u770b\u89c1\u5b66\u4e60\u8fdb\u5ea6\uff0c\u8ba9\u6bcf\u4e00\u6b65\u52aa\u529b\u90fd\u6709\u56de\u54cd"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
              {"\u5e73\u53f0\u6839\u636e\u8bfe\u7a0b\u5b8c\u6210\u901f\u5ea6\u3001\u7ae0\u8282\u8fdb\u5ea6\u548c\u6d4b\u9a8c\u8868\u73b0\u7edf\u8ba1\u5b66\u4e60\u79ef\u5206\uff0c\u5e2e\u52a9\u5b66\u751f\u548c\u5bb6\u957f\u66f4\u76f4\u89c2\u5730\u770b\u5230\u6210\u957f\u3002"}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white hover:bg-[#f25f54]">
                {"\u53bb\u9009\u8bfe"} <ArrowRight size={18} />
              </Link>
              <Link href="/learn" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-ink hover:border-mint hover:text-mint">
                {"\u67e5\u770b\u6211\u7684\u8bfe\u5802"} <BookOpenCheck size={18} />
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-soft">
            <p className="text-sm font-bold text-slate-500">{"\u5f53\u524d\u9886\u5148\u5b66\u751f"}</p>
            {topStudent ? (
              <div className="mt-4 rounded-lg bg-ink p-5 text-white">
                <div className="flex items-center gap-4">
                  {topStudent.avatar_url ? (
                    <img src={topStudent.avatar_url} alt={topStudent.student_name} className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-lg bg-white/10 text-xl font-black text-mint">
                      {initials(topStudent.student_name)}
                    </span>
                  )}
                  <div>
                    <p className="text-2xl font-black">{topStudent.student_name}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {"\u603b\u79ef\u5206 "}
                      {formatPoints(topStudent.total_points)}
                      {" \u00b7 \u672c\u5468 +"}
                      {formatPoints(topStudent.weekly_points)}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white/10 p-3">
                    <p className="text-xl font-black">{topStudent.completed_courses}</p>
                    <p className="mt-1 text-xs text-slate-300">{"\u5b8c\u6210\u8bfe\u7a0b"}</p>
                  </div>
                  <div className="rounded-lg bg-white/10 p-3">
                    <p className="text-xl font-black">{topStudent.active_courses}</p>
                    <p className="mt-1 text-xs text-slate-300">{"\u5728\u5b66\u8bfe\u7a0b"}</p>
                  </div>
                  <div className="rounded-lg bg-white/10 p-3">
                    <p className="text-xl font-black">{topStudent.average_progress}%</p>
                    <p className="mt-1 text-xs text-slate-300">{"\u5e73\u5747\u8fdb\u5ea6"}</p>
                  </div>
                </div>
                <Link
                  href={`/leaderboard/${topStudent.student_id}`}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-ink hover:bg-mint hover:text-white"
                >
                  {"\u67e5\u770b\u8be6\u60c5"} <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-500">
                {"\u6682\u65e0\u9886\u5148\u5b66\u751f\uff0c\u5b8c\u6210\u5b66\u4e60\u540e\u8fd9\u91cc\u4f1a\u51fa\u73b0\u6392\u540d\u6458\u8981\u3002"}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <RankingList title={"\u5b66\u751f\u603b\u79ef\u5206\u6392\u540d"} subtitle="Total Points" entries={totalPoints} metric="total" tone="coral" />
          <RankingList title={"\u4e0a\u5347\u901f\u5ea6\u6392\u540d"} subtitle="Rising Speed" entries={rising} metric="weekly" tone="mint" />
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:grid-cols-3 md:p-8">
            {[
              ["\u5b8c\u6210\u8d8a\u5feb", "\u6309\u65f6\u5b8c\u6210\u7ae0\u8282\u548c\u8bfe\u7a0b\uff0c\u53ef\u4ee5\u83b7\u5f97\u901f\u5ea6\u5956\u52b1\u3002"],
              ["\u6d4b\u9a8c\u8d8a\u7a33", "\u6d4b\u9a8c\u5206\u6570\u8d8a\u9ad8\uff0c\u79ef\u5206\u52a0\u6210\u8d8a\u660e\u663e\u3002"],
              ["\u5b66\u4e60\u8d8a\u6301\u7eed", "\u8fd1\u671f\u6d3b\u8dc3\u5b66\u4e60\u4f1a\u5e26\u6765\u4e0a\u5347\u901f\u5ea6\u699c\u8868\u73b0\u3002"]
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg bg-slate-50 p-5">
                <Award size={22} className="text-coral" />
                <h3 className="mt-4 font-black text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

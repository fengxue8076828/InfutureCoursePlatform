import { ArrowLeft, Award, BookOpenCheck, CalendarClock, CheckCircle2, Sparkles, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getStudentLeaderboardDetail } from "@/lib/api";
import type { StudentCoursePointBreakdown, StudentPointEvent } from "@/lib/types";

const copy = {
  fallbackInitial: "\u5b66",
  noTime: "\u6682\u65e0\u65f6\u95f4",
  progressPoints: "\u8fdb\u5ea6\u79ef\u5206",
  completionBonus: "\u5b8c\u8bfe\u5956\u52b1",
  videoLearning: "\u89c6\u9891\u5b66\u4e60",
  handoutReading: "\u8bb2\u4e49\u9605\u8bfb",
  exercisePractice: "\u7ec3\u4e60\u63d0\u4ea4",
  quizScore: "\u6d4b\u9a8c\u6210\u7ee9",
  assessment: "\u6d4b\u8bc4\u79ef\u5206",
  learningPoints: "\u5b66\u4e60\u79ef\u5206",
  completed: "\u5df2\u5b8c\u6210",
  studying: "\u5b66\u4e60\u4e2d",
  points: "\u79ef\u5206",
  courseProgress: "\u8bfe\u7a0b\u8fdb\u5ea6",
  progress: "\u8fdb\u5ea6",
  activity: "\u5b66\u4e60",
  quizPractice: "\u7ec3\u4e60/\u6d4b\u9a8c",
  returnLeaderboard: "\u8fd4\u56de\u79ef\u5206\u699c",
  profile: "\u5b66\u751f\u79ef\u5206\u6863\u6848",
  completedCourses: "\u5df2\u5b8c\u6210",
  activeCourses: "\u5728\u5b66",
  averageProgress: "\u5e73\u5747\u8fdb\u5ea6",
  totalPoints: "\u603b\u79ef\u5206",
  weeklyGrowth: "\u672c\u5468\u589e\u957f",
  totalRank: "\u603b\u699c\u6392\u540d",
  completionInsightTitle: "\u5b66\u4e60\u5b8c\u6210\u5ea6",
  completionInsightText: "\u8bfe\u7a0b\u5b8c\u6210\u3001\u7ae0\u8282\u8fdb\u5ea6\u548c\u6d4b\u9a8c\u8868\u73b0\u4f1a\u5171\u540c\u5f71\u54cd\u79ef\u5206\u3002",
  recentGrowthTitle: "\u8fd1\u671f\u6210\u957f",
  recentGrowthText: "\u8fd1 7 \u5929\u79ef\u5206\u8d8a\u9ad8\uff0c\u4e0a\u5347\u901f\u5ea6\u6392\u540d\u8d8a\u9760\u524d\u3002",
  learningTrackTitle: "\u5b66\u4e60\u8f68\u8ff9",
  learningTrackText: "\u8bfe\u7a0b\u3001\u7ec3\u4e60\u3001\u6d4b\u9a8c\u548c\u5956\u52b1\u8bb0\u5f55\u4f1a\u6c89\u6dc0\u4e3a\u53ef\u8ffd\u8e2a\u7684\u6210\u957f\u8f68\u8ff9\u3002",
  courseBreakdownTitle: "\u8bfe\u7a0b\u79ef\u5206\u660e\u7ec6",
  noCourseBreakdown: "\u6682\u65e0\u8bfe\u7a0b\u79ef\u5206\u8bb0\u5f55\u3002",
  recentPointsTitle: "\u6700\u8fd1\u79ef\u5206\u8bb0\u5f55",
  noRecentPoints: "\u6682\u65e0\u79ef\u5206\u8bb0\u5f55\u3002",
  courseSeparator: " \u00b7 "
};

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || copy.fallbackInitial;
}

function formatPoints(points: number) {
  return points.toLocaleString("zh-CN");
}

function formatDate(value?: string | null) {
  if (!value) {
    return copy.noTime;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    progress: copy.progressPoints,
    completion: copy.completionBonus,
    video: copy.videoLearning,
    handout: copy.handoutReading,
    exercise: copy.exercisePractice,
    quiz: copy.quizScore,
    assessment: copy.assessment
  };
  return labels[source] ?? copy.learningPoints;
}

function CourseBreakdownCard({ course }: { course: StudentCoursePointBreakdown }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-coral">{course.status === "completed" ? copy.completed : copy.studying}</p>
          <h3 className="mt-1 text-xl font-black text-ink">{course.course_title}</h3>
        </div>
        <div className="rounded-lg bg-mint/10 px-4 py-2 text-right text-mint">
          <p className="text-xl font-black">{formatPoints(course.total_points)}</p>
          <p className="text-xs font-bold">{copy.points}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm font-bold text-slate-600">
          <span>{copy.courseProgress}</span>
          <span>{course.progress_percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(course.progress_percent, 100)}%` }} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          [copy.progress, course.progress_points],
          [copy.activity, course.activity_points],
          [copy.quizPractice, course.assessment_points],
          [copy.completionBonus, course.completion_bonus]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-ink">{formatPoints(Number(value))}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function EventRow({ event }: { event: StudentPointEvent }) {
  return (
    <article className="flex gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-coral/10 text-coral">
        <Sparkles size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-black text-ink">{event.label}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {sourceLabel(event.source)}{event.course_title ? `${copy.courseSeparator}${event.course_title}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-black text-mint">+{formatPoints(event.points)}</p>
            <p className="text-xs text-slate-500">{formatDate(event.occurred_at)}</p>
          </div>
        </div>
        {event.detail ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{event.detail}</p> : null}
      </div>
    </article>
  );
}

export default async function StudentLeaderboardDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const id = Number(studentId);
  if (!Number.isFinite(id)) {
    notFound();
  }

  const detail = await getStudentLeaderboardDetail(id);
  if (!detail) {
    notFound();
  }

  const { student } = detail;
  return (
    <main className="bg-[#f7fbfb]">
      <section className="bg-[linear-gradient(135deg,#eef8f4_0%,#fff7e9_55%,#f7fbfb_100%)] py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link href="/leaderboard" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-coral">
            <ArrowLeft size={16} /> {copy.returnLeaderboard}
          </Link>
          <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
            <div className="rounded-lg border border-white/80 bg-white/90 p-6 shadow-soft">
              <div className="flex items-center gap-4">
                {student.avatar_url ? (
                  <img src={student.avatar_url} alt={student.student_name} className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-20 w-20 place-items-center rounded-lg bg-mint/15 text-2xl font-black text-mint">
                    {initials(student.student_name)}
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold text-coral">{copy.profile}</p>
                  <h1 className="mt-1 text-3xl font-black text-ink sm:text-4xl">{student.student_name}</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {copy.completedCourses} {student.completed_courses} {copy.courseSeparator}{copy.activeCourses} {student.active_courses} {copy.courseSeparator}{copy.averageProgress} {student.average_progress}%
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-ink p-4 text-white">
                  <Trophy size={20} className="text-sunshine" />
                  <p className="mt-3 text-2xl font-black">{formatPoints(student.total_points)}</p>
                  <p className="text-xs text-slate-300">{copy.totalPoints}</p>
                </div>
                <div className="rounded-lg bg-mint/10 p-4 text-mint">
                  <TrendingUp size={20} />
                  <p className="mt-3 text-2xl font-black">+{formatPoints(student.weekly_points)}</p>
                  <p className="text-xs font-bold">{copy.weeklyGrowth}</p>
                </div>
                <div className="rounded-lg bg-coral/10 p-4 text-coral">
                  <Award size={20} />
                  <p className="mt-3 text-2xl font-black">#{detail.total_rank ?? "-"}</p>
                  <p className="text-xs font-bold">{copy.totalRank}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <CheckCircle2 size={24} className="text-mint" />
                <h2 className="mt-4 text-xl font-black text-ink">{copy.completionInsightTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{copy.completionInsightText}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <CalendarClock size={24} className="text-coral" />
                <h2 className="mt-4 text-xl font-black text-ink">{copy.recentGrowthTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{copy.recentGrowthText}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
                <BookOpenCheck size={24} className="text-sky-600" />
                <h2 className="mt-4 text-xl font-black text-ink">{copy.learningTrackTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{copy.learningTrackText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-bold text-coral">Course Breakdown</p>
                <h2 className="mt-2 text-3xl font-black text-ink">{copy.courseBreakdownTitle}</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {detail.course_breakdown.length ? (
                detail.course_breakdown.map((course) => <CourseBreakdownCard key={course.course_id} course={course} />)
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-500">{copy.noCourseBreakdown}</div>
              )}
            </div>
          </div>

          <div>
            <p className="font-bold text-coral">Recent Points</p>
            <h2 className="mt-2 text-3xl font-black text-ink">{copy.recentPointsTitle}</h2>
            <div className="mt-5 grid gap-3">
              {detail.recent_events.length ? (
                detail.recent_events.map((event, index) => <EventRow key={`${event.source}-${event.occurred_at}-${index}`} event={event} />)
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-500">{copy.noRecentPoints}</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

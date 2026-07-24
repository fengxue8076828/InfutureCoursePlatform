import { ArrowLeft, ArrowRight, BookOpenCheck, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentFollowNetworkPanel } from "@/components/StudentFollowNetworkPanel";
import { StudentProfileActivityTabs } from "@/components/StudentProfileActivityTabs";
import { getStudentLeaderboardDetail, getStudentPublicProfile } from "@/lib/api";
import type { Enrollment, StudentPointLevel } from "@/lib/types";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function Avatar({ name, url, large = false }: { name: string; url?: string | null; large?: boolean }) {
  const size = large ? "h-28 w-28 text-4xl" : "h-11 w-11 text-base";
  return url ? (
    <img src={url} alt={name} className={`${size} rounded-lg object-cover ring-4 ring-white`} />
  ) : (
    <div className={`${size} grid place-items-center rounded-lg bg-slate-100 font-black text-slate-500 ring-4 ring-white`}>
      {initials(name)}
    </div>
  );
}

function LevelPointsBadge({ level, totalPoints }: { level?: StudentPointLevel | null; totalPoints: number }) {
  return (
    <div className="flex overflow-hidden rounded-lg bg-white text-left shadow-sm ring-1 ring-mint/25">
      <div className="flex items-center gap-2 bg-mint/10 px-3 py-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-xl shadow-sm">{level?.icon ?? "✦"}</span>
        <div>
          <p className="text-[11px] font-black text-slate-400">学习等级</p>
          <p className="text-sm font-black text-ink">{level?.name ?? "启航学徒"}</p>
        </div>
      </div>
      <div className="border-l border-slate-100 px-4 py-2">
        <p className="text-[11px] font-black text-slate-400">总积分</p>
        <p className="text-lg font-black text-ink">{formatPoints(totalPoints)}</p>
      </div>
    </div>
  );
}

function ProfileMetric({ icon: Icon, label, value }: { icon: typeof BookOpenCheck; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <Icon size={19} className="text-coral" />
      <p className="mt-3 text-2xl font-black text-ink">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-500">{label}</p>
    </div>
  );
}

function CourseStrip({ title, enrollments, emptyText }: { title: string; enrollments: Enrollment[]; emptyText: string }) {
  return (
    <section className="panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-ink">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{enrollments.length} 门</span>
      </div>
      {enrollments.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {enrollments.slice(0, 4).map((enrollment) => (
            <Link key={enrollment.id} href={`/courses/${enrollment.course.slug}`} className="group flex gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-mint/60 hover:shadow-sm">
              {enrollment.course.hero_image_url ? (
                <img src={enrollment.course.hero_image_url} alt={enrollment.course.title} className="h-16 w-24 rounded-lg object-cover" />
              ) : (
                <div className="grid h-16 w-24 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400">无封面</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-ink group-hover:text-mint">{enrollment.course.title}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{enrollment.course.category} · {enrollment.course.level}</p>
                {enrollment.status === "completed" ? (
                  <p className="mt-2 text-xs font-black text-mint">已完成</p>
                ) : (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(enrollment.progress_percent, 100)}%` }} /></div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function StudentLeaderboardDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const id = Number(studentId);
  if (!Number.isFinite(id)) notFound();

  const [detail, publicProfile] = await Promise.all([
    getStudentLeaderboardDetail(id),
    getStudentPublicProfile(id)
  ]);

  if (!detail) notFound();

  const profile = publicProfile?.profile;
  const student = detail.student;
  const displayName = profile?.full_name || student.student_name;
  const avatarUrl = profile?.avatar_url || student.avatar_url;
  const region = profile?.region || "地区未填写";
  const bio = profile?.bio || "这个同学还没有填写个人简介。";
  const activeCourses = publicProfile?.active_courses ?? [];
  const completedCourses = publicProfile?.completed_courses ?? [];
  const posts = publicProfile?.posts ?? [];
  const questions = publicProfile?.questions ?? [];
  const answeredQuestions = publicProfile?.answered_questions ?? [];
  const notes = publicProfile?.notes ?? [];
  const followingStudents = publicProfile?.following_students ?? [];
  const followerStudents = publicProfile?.follower_students ?? [];
  const followingCount = publicProfile?.following_count ?? followingStudents.length;
  const followersCount = publicProfile?.followers_count ?? followerStudents.length;

  return (
    <main className="min-h-screen bg-[#f6fbf9] py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/community" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-black text-ink shadow-sm ring-1 ring-slate-100">
            <ArrowLeft size={16} /> 返回学习社区
          </Link>
          <Link href="/leaderboard" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white">
            查看积分榜 <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-6">
            <section className="panel overflow-hidden rounded-lg">
              <div className="h-36 bg-[radial-gradient(circle_at_15%_20%,rgba(113,197,170,0.35),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(237,116,98,0.2),transparent_24%),linear-gradient(120deg,#effaf5,#fff8ee)]" />
              <div className="px-6 pb-6">
                <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="-translate-y-9 md:-translate-y-10">
                      <Avatar name={displayName} url={avatarUrl} large />
                    </div>
                    <div className="-translate-y-9 md:-translate-y-10">
                      <h1 className="text-3xl font-black leading-tight text-ink md:text-4xl">{displayName}</h1>
                      <p className="mt-2 text-sm font-bold text-slate-500">{region}</p>
                    </div>
                  </div>
                  <div className="-translate-y-9 md:-translate-y-10">
                    <LevelPointsBadge level={student.level} totalPoints={student.total_points} />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <ProfileMetric icon={BookOpenCheck} label="在学课程" value={student.active_courses} />
                  <ProfileMetric icon={Trophy} label="已完成课程" value={student.completed_courses} />
                  <ProfileMetric icon={TrendingUp} label="本周积分" value={`+${formatPoints(student.weekly_points)}`} />
                </div>

                <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-coral">About</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{bio}</p>
                </div>
              </div>
            </section>

            <StudentProfileActivityTabs
              studentId={id}
              posts={posts}
              questions={questions}
              answeredQuestions={answeredQuestions}
              notes={notes}
            />
            <CourseStrip title="正在学习" enrollments={activeCourses} emptyText="暂时没有公开的在学课程。" />
            <CourseStrip title="已完成课程" enrollments={completedCourses} emptyText="暂时没有公开的已完成课程。" />
          </div>

          <StudentFollowNetworkPanel
            followingStudents={followingStudents}
            followerStudents={followerStudents}
            followingCount={followingCount}
            followersCount={followersCount}
          />
        </div>
      </div>
    </main>
  );
}

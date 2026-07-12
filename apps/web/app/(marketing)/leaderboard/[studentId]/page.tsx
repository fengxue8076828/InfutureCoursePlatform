import { ArrowLeft, ArrowRight, Award, BookOpenCheck, CalendarClock, CheckCircle2, Heart, MessageCircle, Sparkles, Star, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudentLeaderboardDetail, getStudentPublicProfile } from "@/lib/api";
import type { Enrollment, StudentCoursePointBreakdown, StudentPointEvent, StudentPointLevel, StudentPost } from "@/lib/types";

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

function formatDate(value?: string | null) {
  if (!value) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    course_progress: "课程进度",
    exercise_accuracy: "练习正确率",
    quiz_score: "测验成绩",
    speed_bonus: "学习速度",
    note_like: "笔记点赞",
    question_like: "问题点赞",
    answer_count: "回答问题",
    answer_like: "回答获赞",
    community: "社区互动"
  };
  return labels[source] ?? source;
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

function PostImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return <img src={images[0]} alt="学习动态图片" className="mt-3 max-h-[28rem] w-full rounded-lg object-cover" />;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {images.slice(0, 9).map((url, index) => (
        <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-lg bg-slate-50">
          <img src={url} alt={`学习动态图片 ${index + 1}`} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function PostCard({ post }: { post: StudentPost }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={post.student_name} url={post.avatar_url} />
        <div>
          <p className="font-black text-ink">{post.student_name}</p>
          <p className="text-xs font-semibold text-slate-500">{formatDate(post.created_at)}{post.course_title ? ` · ${post.course_title}` : ""}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p>
      <PostImageGrid images={post.image_urls ?? []} />
      <div className="mt-3 flex gap-3 text-xs font-bold text-slate-500">
        <span className="inline-flex items-center gap-1"><Heart size={14} />点赞</span>
        <span className="inline-flex items-center gap-1"><MessageCircle size={14} />评论</span>
      </div>
    </article>
  );
}

function PostFeed({ posts }: { posts: StudentPost[] }) {
  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle size={18} className="text-coral" />
        <h2 className="text-lg font-black text-ink">学习心得</h2>
      </div>
      {posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">这个同学暂时还没有公开学习心得。</p>
      ) : (
        <div className="grid gap-3">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>
      )}
    </section>
  );
}

function EventRow({ event }: { event: StudentPointEvent }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3">
      <div className="min-w-0">
        <p className="font-bold text-ink">{event.label}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{sourceLabel(event.source)}{event.course_title ? ` · ${event.course_title}` : ""}</p>
      </div>
      <span className="shrink-0 rounded-full bg-coral/10 px-2.5 py-1 text-xs font-black text-coral">+{formatPoints(event.points)}</span>
    </li>
  );
}

function CourseBreakdownCard({ item }: { item: StudentCoursePointBreakdown }) {
  return (
    <Link href={`/courses/${item.course_slug}`} className="block rounded-lg border border-slate-100 bg-white p-3 transition hover:border-mint/60 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-black text-ink">{item.course_title}</p>
        <span className="text-sm font-black text-mint">+{formatPoints(item.total_points)}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(item.progress_percent, 100)}%` }} /></div>
      <p className="mt-2 text-xs font-semibold text-slate-500">课程进度 {item.progress_percent}%</p>
    </Link>
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

            <PostFeed posts={posts} />
            <CourseStrip title="正在学习" enrollments={activeCourses} emptyText="暂时没有公开的在学课程。" />
            <CourseStrip title="已完成课程" enrollments={completedCourses} emptyText="暂时没有公开的已完成课程。" />
          </div>

          <aside className="grid content-start gap-6">
            <section className="panel rounded-lg p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-coral/10 text-coral"><Award size={22} /></span>
                <div>
                  <p className="text-sm font-black text-coral">学习成就</p>
                  <h2 className="text-xl font-black text-ink">{student.level.name}</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">总积分排名</p>
                  <p className="mt-1 text-2xl font-black text-ink">#{detail.total_rank ?? "-"}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">上升速度排名</p>
                  <p className="mt-1 text-2xl font-black text-ink">#{detail.rising_rank ?? "-"}</p>
                </div>
                <div className="rounded-lg bg-mint/10 p-4">
                  <div className="flex items-center justify-between text-xs font-black text-mint"><span>下一等级进度</span><span>{student.level.progress_percent}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(student.level.progress_percent, 100)}%` }} /></div>
                </div>
              </div>
            </section>

            <section className="panel rounded-lg p-5">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock size={18} className="text-coral" />
                <h2 className="text-lg font-black text-ink">最近积分动态</h2>
              </div>
              {detail.recent_events.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">暂无公开积分动态。</p>
              ) : (
                <ul className="grid gap-2">
                  {detail.recent_events.slice(0, 6).map((event, index) => (
                    <EventRow
                      key={`${event.label}-${event.source}-${event.occurred_at ?? "time"}-${event.course_title ?? "course"}-${event.points}-${index}`}
                      event={event}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="panel rounded-lg p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-coral" />
                <h2 className="text-lg font-black text-ink">课程积分</h2>
              </div>
              {detail.course_breakdown.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">暂无课程积分记录。</p>
              ) : (
                <div className="grid gap-2">{detail.course_breakdown.slice(0, 5).map((item) => <CourseBreakdownCard key={item.course_id} item={item} />)}</div>
              )}
            </section>

            <section className="rounded-lg border border-dashed border-coral/30 bg-coral/5 p-5">
              <div className="flex items-center gap-2 text-coral"><Star size={18} /><p className="font-black">公开主页</p></div>
              <p className="mt-2 text-sm leading-7 text-slate-600">这里展示的是该同学公开的课程、学习心得和积分成长记录。</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

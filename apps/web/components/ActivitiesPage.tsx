"use client";

import { API_BASE_URL } from "@/lib/api-config";

import { CalendarDays, CheckCircle2, Mail, MapPin, MonitorPlay, Phone, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";


type ActivityMode = "online" | "offline";
type ActivityStatus = "open" | "closed";

type PublicActivity = {
  id: number;
  institution_id: number;
  institution_name: string;
  institution_logo_url?: string | null;
  title: string;
  description: string;
  cover_url?: string | null;
  starts_at: string;
  ends_at?: string | null;
  mode: ActivityMode;
  meeting_url?: string | null;
  location?: string | null;
  audience?: string | null;
  registration_status: ActivityStatus;
  capacity?: number | null;
  registrations_count: number;
};

type ActivityHome = {
  latest: PublicActivity[];
  popular: PublicActivity[];
  activities: PublicActivity[];
};

type RegistrationDraft = {
  student_name: string;
  student_email: string;
  phone: string;
  note: string;
};

const emptyDraft: RegistrationDraft = {
  student_name: "",
  student_email: "",
  phone: "",
  note: ""
};

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusLabel(status: ActivityStatus) {
  return status === "open" ? "开放注册" : "关闭注册";
}

function modeLabel(mode: ActivityMode) {
  return mode === "online" ? "线上活动" : "线下活动";
}

export function ActivitiesPage() {
  const [activityHome, setActivityHome] = useState<ActivityHome>({ latest: [], popular: [], activities: [] });
  const [drafts, setDrafts] = useState<Record<number, RegistrationDraft>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState("正在读取活动...");

  async function loadActivities() {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/activities`, { cache: "no-store" });
      if (!response.ok) throw new Error("Activity API unavailable");
      const data = (await response.json()) as ActivityHome;
      setActivityHome(data);
      setPageMessage(data.activities.length ? "已从平台读取最新活动。" : "暂时还没有发布活动。");
    } catch {
      setPageMessage("活动读取失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadActivities();
  }, []);

  const featuredLatest = activityHome.latest.slice(0, 3);
  const featuredPopular = activityHome.popular.slice(0, 3);

  function updateDraft(activityId: number, field: keyof RegistrationDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [activityId]: {
        ...(current[activityId] ?? emptyDraft),
        [field]: value
      }
    }));
  }

  async function register(activity: PublicActivity) {
    const draft = drafts[activity.id] ?? emptyDraft;
    if (!draft.student_name.trim() || !draft.student_email.trim()) {
      setMessages((current) => ({ ...current, [activity.id]: "请填写学生姓名和 Email。" }));
      return;
    }
    setMessages((current) => ({ ...current, [activity.id]: "正在提交报名..." }));
    try {
      const response = await fetch(`${API_BASE_URL}/activities/${activity.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: draft.student_name.trim(),
          student_email: draft.student_email.trim(),
          phone: draft.phone.trim() || null,
          note: draft.note.trim() || null
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        if (payload?.detail === "This email has already registered") {
          throw new Error("这个 Email 已经报名过该活动。");
        }
        if (payload?.detail === "Activity registration is closed") {
          throw new Error("该活动已关闭报名。");
        }
        if (payload?.detail === "Activity is full") {
          throw new Error("该活动名额已满。");
        }
        throw new Error("报名失败，请稍后再试。");
      }
      setDrafts((current) => ({ ...current, [activity.id]: emptyDraft }));
      setMessages((current) => ({ ...current, [activity.id]: "报名成功，机构后台已经收到你的信息。" }));
      await loadActivities();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [activity.id]: error instanceof Error ? error.message : "报名失败，请稍后再试。"
      }));
    }
  }

  return (
    <main className="bg-mist pb-16 text-ink">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-[2rem] border border-mint/20 bg-white p-6 shadow-soft lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-sm font-black text-coral">
              <Sparkles size={16} /> 平台活动
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-ink md:text-5xl">
              和优秀机构一起参加线上线下学习活动
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              讲座、公开课、工作坊、线下体验营都可以在这里找到。选择适合自己的活动，填写信息即可完成报名。
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500">{pageMessage}</p>
          </div>
          <div className="grid gap-3 rounded-[1.5rem] bg-gradient-to-br from-mint/15 via-sky-50 to-coral/10 p-5">
            <div className="rounded-2xl bg-white/80 p-4">
              <p className="text-sm font-bold text-slate-500">活动总数</p>
              <p className="mt-2 text-4xl font-black text-ink">{activityHome.activities.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4">
              <p className="text-sm font-bold text-slate-500">开放报名</p>
              <p className="mt-2 text-4xl font-black text-mint">
                {activityHome.activities.filter((activity) => activity.registration_status === "open").length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <ActivityPanel title="最新活动" icon={<CalendarDays size={20} />} activities={featuredLatest} />
        <ActivityPanel title="报名最多" icon={<Trophy size={20} />} activities={featuredPopular} />
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-black text-coral">活动列表</p>
              <h2 className="mt-1 text-3xl font-black text-ink">选择你想参加的活动</h2>
            </div>
            {isLoading ? <p className="text-sm font-bold text-slate-500">正在加载...</p> : null}
          </div>

          <div className="mt-6 grid gap-5">
            {activityHome.activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                draft={drafts[activity.id] ?? emptyDraft}
                message={messages[activity.id]}
                onChange={(field, value) => updateDraft(activity.id, field, value)}
                onRegister={() => void register(activity)}
              />
            ))}
            {!activityHome.activities.length && !isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                暂时还没有活动，稍后再来看看。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function ActivityPanel({
  title,
  icon,
  activities
}: {
  title: string;
  icon: React.ReactNode;
  activities: PublicActivity[];
}) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint/12 text-mint">{icon}</span>
        <h2 className="text-xl font-black text-ink">{title}</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {activities.map((activity) => (
          <div key={activity.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-ink">{activity.title}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {activity.institution_name} · {formatActivityDate(activity.starts_at)}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-mint">
                {activity.registrations_count} 人
              </span>
            </div>
          </div>
        ))}
        {!activities.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">暂无活动。</p> : null}
      </div>
    </section>
  );
}

function ActivityCard({
  activity,
  draft,
  message,
  onChange,
  onRegister
}: {
  activity: PublicActivity;
  draft: RegistrationDraft;
  message?: string;
  onChange: (field: keyof RegistrationDraft, value: string) => void;
  onRegister: () => void;
}) {
  const isOpen = activity.registration_status === "open";
  const isOnline = activity.mode === "online";
  const seatsLabel = useMemo(() => {
    if (!activity.capacity) return `${activity.registrations_count} 人已报名`;
    return `${activity.registrations_count}/${activity.capacity} 人已报名`;
  }, [activity.capacity, activity.registrations_count]);

  return (
    <article className="grid gap-5 rounded-[1.25rem] border border-slate-200 bg-white p-5 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${isOpen ? "bg-mint/12 text-mint" : "bg-slate-100 text-slate-500"}`}>
            {statusLabel(activity.registration_status)}
          </span>
          <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-black text-coral">{modeLabel(activity.mode)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{seatsLabel}</span>
        </div>
        {activity.cover_url ? (
          <img src={activity.cover_url} alt={activity.title} className="mt-4 h-48 w-full rounded-2xl object-cover" />
        ) : null}
        <h3 className="mt-4 text-2xl font-black text-ink">{activity.title}</h3>
        <p className="mt-2 text-sm font-bold text-slate-500">{activity.institution_name}</p>
        {activity.description ? (
          <div
            className="rich-content mt-4 text-sm leading-7 text-slate-600"
            dangerouslySetInnerHTML={{ __html: activity.description }}
          />
        ) : null}
        <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-600 md:grid-cols-2">
          <p className="flex items-center gap-2">
            <CalendarDays size={17} className="text-coral" /> {formatActivityDate(activity.starts_at)}
          </p>
          <p className="flex items-center gap-2">
            <Users size={17} className="text-mint" /> {activity.audience || "适合学生人群不限"}
          </p>
          <p className="flex items-center gap-2 md:col-span-2">
            {isOnline ? <MonitorPlay size={17} className="text-sky-500" /> : <MapPin size={17} className="text-sky-500" />}
            {isOnline ? activity.meeting_url || "会议链接待公布" : activity.location || "地点待公布"}
          </p>
        </div>
      </div>

      <aside className="rounded-2xl bg-slate-50 p-4">
        <p className="font-black text-ink">活动报名</p>
        <div className="mt-4 grid gap-3">
          <input
            value={draft.student_name}
            onChange={(event) => onChange("student_name", event.target.value)}
            disabled={!isOpen}
            className="focus-ring rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none disabled:bg-slate-100"
            placeholder="学生姓名"
          />
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={draft.student_email}
              onChange={(event) => onChange("student_email", event.target.value)}
              disabled={!isOpen}
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm font-semibold outline-none disabled:bg-slate-100"
              placeholder="学生 Email"
            />
          </div>
          <div className="relative">
            <Phone size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={draft.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              disabled={!isOpen}
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm font-semibold outline-none disabled:bg-slate-100"
              placeholder="联系电话，可选"
            />
          </div>
          <textarea
            value={draft.note}
            onChange={(event) => onChange("note", event.target.value)}
            disabled={!isOpen}
            className="focus-ring min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none disabled:bg-slate-100"
            placeholder="备注，可选"
          />
          <button
            type="button"
            onClick={onRegister}
            disabled={!isOpen}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-coral px-4 py-3 text-sm font-black text-white hover:bg-[#f25f54] disabled:bg-slate-300"
          >
            <CheckCircle2 size={17} /> {isOpen ? "确认报名" : "报名已关闭"}
          </button>
          {message ? <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600">{message}</p> : null}
        </div>
      </aside>
    </article>
  );
}

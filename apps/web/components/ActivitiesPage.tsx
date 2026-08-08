"use client";

import { ResourceTagFilters, type ResourceTagFilterValue } from "@/components/ResourceTagFilters";
import { buildResourceQuery } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-config";
import { reorderByRecommendation, useRecommendationFeed } from "@/lib/recommendations";
import type { ResourceTag } from "@/lib/types";
import {
  CalendarDays,
  CheckCircle2,
  Mail,
  MapPin,
  MonitorPlay,
  Phone,
  Sparkles,
  Tag,
  Trophy,
  Users
} from "lucide-react";
import type { ReactNode } from "react";
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
  tag_list?: ResourceTag[];
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
  if (Number.isNaN(date.getTime())) {
    return "时间待定";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusLabel(status: ActivityStatus) {
  return status === "open" ? "开放报名" : "关闭报名";
}

function modeLabel(mode: ActivityMode) {
  return mode === "online" ? "线上活动" : "线下活动";
}

function normalizeActivityPayload(payload: ActivityHome | PublicActivity[]): ActivityHome {
  if (!Array.isArray(payload)) {
    return payload;
  }
  const popular = [...payload].sort((left, right) => right.registrations_count - left.registrations_count);
  return {
    latest: payload.slice(0, 3),
    popular: popular.slice(0, 3),
    activities: payload
  };
}

export function ActivitiesPage() {
  const [activityHome, setActivityHome] = useState<ActivityHome>({ latest: [], popular: [], activities: [] });
  const [drafts, setDrafts] = useState<Record<number, RegistrationDraft>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [filters, setFilters] = useState<ResourceTagFilterValue>({ institutionCategory: "", tagIds: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState("正在读取活动...");
  const recommendationFeed = useRecommendationFeed();

  async function loadActivities(nextFilters = filters) {
    setIsLoading(true);
    try {
      const query = buildResourceQuery({
        institutionCategory: nextFilters.institutionCategory,
        tagIds: nextFilters.tagIds
      });
      const response = await fetch(`${API_BASE_URL}/activities${query}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Activity API unavailable");
      }
      const data = normalizeActivityPayload((await response.json()) as ActivityHome | PublicActivity[]);
      setActivityHome(data);
      setPageMessage(data.activities.length ? "已从平台读取最新活动。" : "暂时还没有符合条件的活动。");
    } catch {
      setPageMessage("活动读取失败，请确认 FastAPI 服务正在运行。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadActivities(filters);
  }, [filters]);

  const featuredLatest = activityHome.latest.slice(0, 3);
  const featuredPopular = activityHome.popular.slice(0, 3);
  const recommendedActivities = useMemo(
    () => reorderByRecommendation(activityHome.activities, recommendationFeed?.orders.activities),
    [activityHome.activities, recommendationFeed]
  );

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
      await loadActivities(filters);
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
              <Sparkles size={16} />
              平台活动
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-ink md:text-5xl">
              和优质机构一起参加线上线下学习活动
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              讲座、公开课、工作坊和线下体验营都可以在这里找到。选择适合自己的活动，填写信息即可完成报名。
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

          <ResourceTagFilters
            value={filters}
            onChange={setFilters}
            className="mt-5"
            title="按机构类型和标签筛选活动"
          />

          <div className="mt-6 grid gap-5">
            {recommendedActivities.map((activity) => (
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
                暂时还没有符合条件的活动，稍后再来看看。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function ActivityPanel({ title, icon, activities }: { title: string; icon: ReactNode; activities: PublicActivity[] }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-xl font-black text-ink">
        <span className="text-coral">{icon}</span>
        {title}
      </h2>
      <div className="mt-4 grid gap-3">
        {activities.length ? (
          activities.map((activity) => (
            <div key={activity.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-coral">{activity.institution_name}</p>
                  <h3 className="mt-1 text-base font-black text-ink">{activity.title}</h3>
                  <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                    <CalendarDays size={14} />
                    {formatActivityDate(activity.starts_at)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-mint">
                  {activity.registrations_count} 人
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500">
            暂时还没有活动。
          </p>
        )}
      </div>
    </div>
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

  return (
    <article className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[280px_1fr]">
      <div className="min-h-56 bg-slate-100">
        {activity.cover_url ? (
          <img src={activity.cover_url} alt={activity.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-56 items-center justify-center bg-gradient-to-br from-mint/20 to-coral/15 text-mint">
            <CalendarDays size={56} />
          </div>
        )}
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-black text-coral">
              {modeLabel(activity.mode)}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${isOpen ? "bg-mint/10 text-mint" : "bg-slate-100 text-slate-500"}`}>
              {statusLabel(activity.registration_status)}
            </span>
            {activity.tag_list?.map((tagItem) => (
              <span key={tagItem.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                <Tag size={12} />
                {tagItem.name}
              </span>
            ))}
          </div>
          <h3 className="mt-4 text-2xl font-black text-ink">{activity.title}</h3>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{activity.description}</p>

          <div className="mt-5 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-2">
            <span className="flex items-center gap-2">
              <CalendarDays size={17} className="text-coral" />
              {formatActivityDate(activity.starts_at)}
            </span>
            <span className="flex items-center gap-2">
              <Users size={17} className="text-coral" />
              {activity.registrations_count} 人已报名
              {activity.capacity ? ` / ${activity.capacity} 人` : ""}
            </span>
            <span className="flex items-center gap-2">
              {activity.mode === "online" ? <MonitorPlay size={17} className="text-coral" /> : <MapPin size={17} className="text-coral" />}
              {activity.mode === "online" ? activity.meeting_url || "线上链接报名后通知" : activity.location || "地点待定"}
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-coral" />
              {activity.audience || "适合所有学生"}
            </span>
          </div>
        </div>

        <aside className="rounded-2xl bg-slate-50 p-4">
          <p className="text-base font-black text-ink">活动报名</p>
          <div className="mt-4 grid gap-3">
            <input
              value={draft.student_name}
              onChange={(event) => onChange("student_name", event.target.value)}
              placeholder="学生姓名"
              disabled={!isOpen}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-ink disabled:bg-slate-100"
            />
            <label className="relative block">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={draft.student_email}
                onChange={(event) => onChange("student_email", event.target.value)}
                placeholder="Email"
                disabled={!isOpen}
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-bold text-ink disabled:bg-slate-100"
              />
            </label>
            <label className="relative block">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={draft.phone}
                onChange={(event) => onChange("phone", event.target.value)}
                placeholder="联系电话"
                disabled={!isOpen}
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-bold text-ink disabled:bg-slate-100"
              />
            </label>
            <textarea
              value={draft.note}
              onChange={(event) => onChange("note", event.target.value)}
              placeholder="备注，可选"
              disabled={!isOpen}
              rows={3}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-ink disabled:bg-slate-100"
            />
            <button
              type="button"
              disabled={!isOpen}
              onClick={onRegister}
              className="rounded-xl bg-coral px-5 py-3 text-sm font-black text-white shadow-soft disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isOpen ? "确认报名" : "报名已关闭"}
            </button>
            {message ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">{message}</p> : null}
          </div>
        </aside>
      </div>
    </article>
  );
}

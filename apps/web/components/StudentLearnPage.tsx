"use client";

import { ArrowRight, BookOpenCheck, CalendarCheck, Clock3, Database, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SavedQuestionBankPanel } from "@/components/SavedQuestionBankPanel";
import {
  getStudentRequestHeaders,
  getStudentSessionServerSnapshot,
  getStudentSessionUser,
  subscribeToStudentSession
} from "@/lib/student-session";
import type { Enrollment } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type ClassroomTab = "courses" | "questions";

export function StudentLearnPage() {
  const studentSession = useSyncExternalStore(
    subscribeToStudentSession,
    getStudentSessionUser,
    getStudentSessionServerSnapshot
  );
  const [activeTab, setActiveTab] = useState<ClassroomTab>("courses");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [status, setStatus] = useState("登录或订阅课程后，这里会显示你的个人课程。");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studentSession) {
      return;
    }

    async function loadEnrollments() {
      setIsLoading(true);
      setStatus("正在读取你的课程...");
      try {
        const response = await fetch(`${API_BASE_URL}/learn/me/courses?ts=${Date.now()}`, {
          headers: getStudentRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("load failed");
        }
        const payload = (await response.json()) as Enrollment[];
        setEnrollments(payload);
        setStatus(payload.length > 0 ? "课程已同步到你的个人课堂。" : "你还没有订阅课程。");
      } catch {
        setStatus("课程读取失败，请确认 FastAPI 服务正在运行。");
      } finally {
        setIsLoading(false);
      }
    }

    void loadEnrollments();
  }, [studentSession]);

  const visibleEnrollments = studentSession ? enrollments : [];
  const courseStatus = studentSession ? status : "登录或订阅课程后，这里会显示你的个人课程。";
  const active = visibleEnrollments.filter((item) => item.status === "active");
  const completed = visibleEnrollments.filter((item) => item.status === "completed");
  const tabs: Array<{ id: ClassroomTab; label: string; icon: typeof BookOpenCheck }> = [
    { id: "courses", label: "我的课程", icon: BookOpenCheck },
    { id: "questions", label: "我的题库", icon: Database }
  ];

  return (
    <>
      <Header />
      <main className="bg-mist py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="mb-6 grid gap-4 md:grid-cols-3">
            {[
              { icon: CalendarCheck, label: "已订阅课程", value: active.length },
              { icon: Trophy, label: "已完成课程", value: completed.length },
              { icon: Clock3, label: "本周学习", value: "135 分钟" }
            ].map((stat) => (
              <div key={stat.label} className="panel rounded-lg p-5">
                <stat.icon className="text-coral" size={22} />
                <p className="mt-4 text-3xl font-black text-ink">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </section>

          <section className="panel mb-6 rounded-lg p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-coral">我的课堂</p>
                <h1 className="mt-1 text-2xl font-black text-ink">个人学习中心</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {activeTab === "courses" ? courseStatus : "保存到我的题库的题目，可以在这里集中练习。"}
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`focus-ring inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition ${
                        isActive ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeTab === "courses" ? (
              <CourseListPanel
                enrollments={visibleEnrollments}
                isLoading={isLoading}
                studentSession={Boolean(studentSession)}
              />
            ) : (
              <SavedQuestionBankPanel studentSession={studentSession} />
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function CourseListPanel({
  enrollments,
  isLoading,
  studentSession
}: {
  enrollments: Enrollment[];
  isLoading: boolean;
  studentSession: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        正在加载课程
      </div>
    );
  }

  if (!studentSession) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="font-bold text-ink">请先登录学生账号</p>
        <p className="mt-2 text-sm text-slate-500">登录后可以查看已订阅课程、学习进度和课堂内容。</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white" href="/login">
            登录
          </Link>
          <Link className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700" href="/register">
            注册
          </Link>
        </div>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="font-bold text-ink">还没有订阅课程</p>
        <p className="mt-2 text-sm text-slate-500">订阅后的课程会自动显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {enrollments.map((enrollment) => {
        const imageUrl = enrollment.course.hero_image_url?.trim();
        return (
          <article key={enrollment.id} className="rounded-lg border border-slate-200 bg-white p-3">
            {imageUrl ? (
              <img src={imageUrl} alt={enrollment.course.title} className="h-36 w-full rounded-lg object-cover" />
            ) : (
              <div className="grid h-36 w-full place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
                尚未上传图片
              </div>
            )}
            <div className="p-2">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                <span className="rounded-full bg-mint/12 px-2.5 py-1 text-mint">{enrollment.course.level}</span>
                <span>{enrollment.progress_percent}%</span>
              </div>
              <h2 className="mt-3 line-clamp-2 text-lg font-black text-ink">{enrollment.course.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{enrollment.course.subtitle}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-mint"
                  style={{ width: `${Math.min(enrollment.progress_percent, 100)}%` }}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/learn/${enrollment.course.slug}`}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-ink/90"
                >
                  进入课程
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}


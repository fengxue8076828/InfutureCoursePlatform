"use client";

import { API_BASE_URL } from "@/lib/api-config";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LearnConsole } from "@/components/LearnConsole";
import {
  getStudentRequestHeaders,
  getStudentSessionServerSnapshot,
  getStudentSessionUser,
  subscribeToStudentSession
} from "@/lib/student-session";
import type { Enrollment } from "@/lib/types";


export function StudentCourseRoomPage({ courseSlug }: { courseSlug: string }) {
  const studentSession = useSyncExternalStore(
    subscribeToStudentSession,
    getStudentSessionUser,
    getStudentSessionServerSnapshot
  );
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [status, setStatus] = useState("请先登录学生账号。");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studentSession) {
      return;
    }

    async function loadEnrollments() {
      setIsLoading(true);
      setStatus("正在进入课程...");
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
        setStatus(payload.some((item) => item.course.slug === courseSlug) ? "" : "你还没有订阅这门课程。");
      } catch {
        setStatus("课程读取失败，请确认 FastAPI 服务正在运行。");
      } finally {
        setIsLoading(false);
      }
    }

    void loadEnrollments();
  }, [courseSlug, studentSession]);

  const hasCourse = enrollments.some((item) => item.course.slug === courseSlug);

  return (
    <>
      <Header wide showInstitutionLogin={false} />
      <main className="bg-mist py-6">
        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/learn"
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-mint hover:text-mint"
            >
              <ArrowLeft size={16} />
              返回我的课程
            </Link>
          </div>

          {isLoading ? (
            <div className="panel flex items-center gap-2 rounded-lg p-6 text-sm font-semibold text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              正在加载课程
            </div>
          ) : !studentSession ? (
            <div className="panel rounded-lg p-8 text-center">
              <p className="font-bold text-ink">请先登录学生账号</p>
              <p className="mt-2 text-sm text-slate-500">登录后可以进入已订阅课程的上课界面。</p>
              <Link
                href="/login"
                className="focus-ring mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white"
              >
                登录
              </Link>
            </div>
          ) : !hasCourse ? (
            <div className="panel rounded-lg p-8 text-center">
              <p className="font-bold text-ink">{status}</p>
              <p className="mt-2 text-sm text-slate-500">请先在课程详情页完成订阅。</p>
              <Link
                href="/learn"
                className="focus-ring mt-4 inline-flex rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white"
              >
                回到我的课程
              </Link>
            </div>
          ) : (
            <LearnConsole enrollments={enrollments} initialCourseSlug={courseSlug} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

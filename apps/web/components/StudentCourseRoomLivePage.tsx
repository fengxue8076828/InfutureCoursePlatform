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

const COURSE_REFRESH_INTERVAL_MS = 10_000;
const COURSE_CONTENT_REFRESH_EVENT = "infuture-course-content-change";
const COURSE_CONTENT_REFRESH_STORAGE_KEY = "infuture-course-content-version";
const COURSE_CONTENT_BROADCAST_CHANNEL = "infuture-course-content";

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
      const resetTimer = window.setTimeout(() => {
        setEnrollments([]);
        setStatus("请先登录学生账号。");
        setIsLoading(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    let ignore = false;
    let inFlight = false;
    let hasLoaded = false;

    async function loadEnrollments(silent = false) {
      if (inFlight) {
        return;
      }
      inFlight = true;
      if (!silent || !hasLoaded) {
        setIsLoading(true);
        setStatus("正在进入课程...");
      }

      try {
        const response = await fetch(`${API_BASE_URL}/learn/me/courses?ts=${Date.now()}`, {
          headers: getStudentRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("load failed");
        }
        const payload = (await response.json()) as Enrollment[];
        if (ignore) {
          return;
        }
        hasLoaded = true;
        setEnrollments(payload);
        setStatus(payload.some((item) => item.course.slug === courseSlug) ? "" : "你还没有订阅这门课程。");
      } catch {
        if (!ignore && !hasLoaded) {
          setStatus("课程读取失败，请确认 FastAPI 服务正在运行。");
        }
      } finally {
        inFlight = false;
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    function refreshSilently() {
      void loadEnrollments(true);
    }

    const initialLoadTimer = window.setTimeout(() => {
      void loadEnrollments(false);
    }, 0);
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshSilently();
      }
    }, COURSE_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        refreshSilently();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COURSE_CONTENT_REFRESH_STORAGE_KEY) {
        refreshSilently();
      }
    };
    const handleCourseContentChange = () => refreshSilently();
    const broadcastChannel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(COURSE_CONTENT_BROADCAST_CHANNEL);
    if (broadcastChannel) {
      broadcastChannel.onmessage = () => refreshSilently();
    }

    window.addEventListener("focus", refreshSilently);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(COURSE_CONTENT_REFRESH_EVENT, handleCourseContentChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ignore = true;
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshSilently);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(COURSE_CONTENT_REFRESH_EVENT, handleCourseContentChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      broadcastChannel?.close();
    };
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
              返回我的学习
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
                回到我的学习
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

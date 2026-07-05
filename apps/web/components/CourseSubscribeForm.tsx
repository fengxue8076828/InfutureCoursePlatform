"use client";

import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  getStudentRequestHeaders,
  getStudentSessionUser,
  persistStudentSession,
  type StudentAuthResponse
} from "@/lib/student-session";
import type { Course, Enrollment } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type SubscribeResponse = {
  auth: StudentAuthResponse;
  enrollment: Enrollment;
  subscription_status: string;
};

export function CourseSubscribeForm({ course }: { course: Course }) {
  const router = useRouter();
  const [initialStudent] = useState(() => getStudentSessionUser());
  const [fullName, setFullName] = useState(initialStudent?.full_name ?? "");
  const [email, setEmail] = useState(initialStudent?.email ?? "");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("模拟订阅流程，确认后会把课程加入你的个人课程页。");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setStatus("请填写学生姓名。");
      return;
    }
    if (!email.trim()) {
      setStatus("请填写 Email。");
      return;
    }

    setIsSubmitting(true);
    setStatus("正在模拟支付并创建订阅...");
    try {
      const response = await fetch(`${API_BASE_URL}/learn/courses/${course.slug}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getStudentRequestHeaders()
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          region: region || null,
          phone: phone || null
        })
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(typeof detail?.detail === "string" ? detail.detail : "subscribe failed");
      }

      const payload = (await response.json()) as SubscribeResponse;
      persistStudentSession(payload.auth);
      setStatus("订阅成功，正在进入我的课堂...");
      router.push("/learn");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message === "Failed to fetch"
          ? "无法连接 FastAPI 服务或当前前端地址未被后端 CORS 允许。请确认 http://localhost:8000 正在运行，然后刷新页面重试。"
          : message === "Email belongs to a non-student account"
          ? "这个邮箱属于机构或老师账号，请换一个学生邮箱。"
          : message === "Course not found"
            ? "课程不存在或尚未发布。"
            : message || "订阅失败，请确认 FastAPI 服务正在运行。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_22rem] lg:px-8">
      <section className="panel rounded-lg p-6">
        <p className="text-sm font-bold text-coral">课程订阅</p>
        <h1 className="mt-2 text-3xl font-black text-ink">{course.title}</h1>
        <p className="mt-3 leading-7 text-slate-600">{course.subtitle}</p>

        <form onSubmit={submitSubscription} className="mt-6 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              学生姓名
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Email
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              所在国家/时区
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="例如 Germany / CET"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              联系电话
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+36 ..."
              />
            </label>
          </div>

          <div className="rounded-lg border border-dashed border-mint/50 bg-mint/10 p-4 text-sm leading-6 text-slate-600">
            当前为模拟订阅：点击确认后不会真实扣款，但会在后台数据库创建学生、订阅记录和课程报名记录。
          </div>

          <button
            disabled={isSubmitting}
            className="focus-ring mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
            {isSubmitting ? "处理中" : "确认订阅 39 欧元/月"}
          </button>
        </form>

        <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-500">{status}</p>
      </section>

      <aside className="panel h-fit rounded-lg p-5">
        <div className="flex items-center gap-2 font-bold text-ink">
          <ShieldCheck size={18} />
          订阅摘要
        </div>
        <div className="mt-5 grid gap-3 text-sm text-slate-600">
          <div className="flex justify-between gap-4">
            <span>课程</span>
            <span className="text-right font-semibold text-ink">{course.title}</span>
          </div>
          <div className="flex justify-between">
            <span>周期</span>
            <span className="font-semibold text-ink">按月</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-3">
            <span>每月费用</span>
            <span className="font-black text-ink">39 欧元</span>
          </div>
        </div>
        <Link href="/learn" className="mt-5 block text-sm font-bold text-coral">
          已订阅？进入我的课堂
        </Link>
      </aside>
    </div>
  );
}

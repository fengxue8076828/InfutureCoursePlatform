"use client";

import { Facebook, GraduationCap, Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { persistStudentSession, type StudentAuthResponse } from "@/lib/student-session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type StudentAuthMode = "login" | "register";
type SocialProvider = "google" | "facebook";

const socialProviderLabels: Record<SocialProvider, string> = {
  google: "Google",
  facebook: "Facebook"
};

export function StudentAuthPage({ mode }: { mode: StudentAuthMode }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(isRegister ? "创建学生账号后即可订阅课程。" : "请输入学生账号登录。");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAuthResponse(response: Response) {
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(typeof detail?.detail === "string" ? detail.detail : "auth failed");
    }
    const auth = (await response.json()) as StudentAuthResponse;
    if (auth.user.role !== "student") {
      throw new Error("请使用学生账号登录，机构账号请点击右上角“机构登录”。");
    }
    persistStudentSession(auth);
    router.push("/learn");
  }

  async function submitEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRegister && fullName.trim().length < 2) {
      setStatus("请填写至少 2 个字符的姓名。");
      return;
    }
    if (password.length < 8) {
      setStatus("密码至少需要 8 位。");
      return;
    }
    setIsSubmitting(true);
    setStatus(isRegister ? "正在创建学生账号..." : "正在登录...");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? {
                email,
                full_name: fullName,
                password,
                role: "student"
              }
            : {
                email,
                password
              }
        )
      });
      await handleAuthResponse(response);
      setStatus(isRegister ? "注册成功，正在进入我的课堂..." : "登录成功，正在进入我的课堂...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message === "Email already registered"
          ? "这个邮箱已经注册过，请直接登录。"
          : message === "Invalid email or password"
            ? "邮箱或密码不正确。"
            : message || "认证失败，请确认 FastAPI 服务正在运行。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function continueWithSocial(provider: SocialProvider) {
    setIsSubmitting(true);
    setStatus(`正在连接 ${socialProviderLabels[provider]} 账号...`);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/social-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      await handleAuthResponse(response);
      setStatus(`${socialProviderLabels[provider]} 登录成功，正在进入我的课堂...`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setStatus(message || `${socialProviderLabels[provider]} 登录暂时不可用，请稍后再试。`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="bg-mist py-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_28rem] lg:px-8">
        <section className="grid min-h-[34rem] content-center rounded-lg bg-ink p-8 text-white">
          <div className="max-w-xl">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
              <GraduationCap size={24} />
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">
              {isRegister ? "加入华语云课" : "欢迎回到课堂"}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-white/72">
              {isRegister
                ? "使用学生账号订阅课程、保存学习进度，并进入你的专属上课平台。"
                : "登录后可以查看已注册课程、继续学习进度，并进入课程练习和测验。"}
            </p>
          </div>
        </section>

        <section className="panel h-fit rounded-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-coral">学生账号</p>
              <h2 className="mt-1 text-2xl font-black text-ink">{isRegister ? "注册" : "登录"}</h2>
            </div>
            <Link
              href={isRegister ? "/login" : "/register"}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:border-mint hover:text-mint"
            >
              {isRegister ? "已有账号" : "创建账号"}
            </Link>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => continueWithSocial("google")}
              disabled={isSubmitting}
              className="focus-ring flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-mint disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-sm">G</span>
              使用 Google 继续
            </button>
            <button
              type="button"
              onClick={() => continueWithSocial("facebook")}
              disabled={isSubmitting}
              className="focus-ring flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Facebook size={18} className="text-blue-600" />
              使用 Facebook 继续
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            邮箱方式
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submitEmailAuth} className="grid gap-4">
            {isRegister ? (
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                姓名
                <input
                  className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="请输入姓名"
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Email
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              密码
              <input
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 8 位"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
              />
            </label>
            <button
              disabled={isSubmitting}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
              {isSubmitting ? "处理中" : isRegister ? "注册并进入课堂" : "登录并进入课堂"}
            </button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-500">
            <Mail size={16} className="mt-1 shrink-0 text-slate-400" />
            <p>{status}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

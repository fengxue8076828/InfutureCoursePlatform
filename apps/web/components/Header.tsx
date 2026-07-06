"use client";

import { Facebook, LogIn, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  clearStudentSession,
  getStudentSessionUser,
  persistStudentSession,
  STUDENT_SESSION_EVENT,
  type StudentAuthResponse,
  type StudentSessionUser
} from "@/lib/student-session";

const navItems = [
  { href: "/", label: "\u9996\u9875" },
  { href: "/courses", label: "\u8bfe\u7a0b\u5206\u7c7b" },
  { href: "/leaderboard", label: "\u79ef\u5206\u699c" },
  { href: "/question-bank", label: "\u9898\u5e93" },
  { href: "/blog", label: "\u535a\u5ba2" },
  { href: "/learn", label: "\u6211\u7684\u8bfe\u5802" }
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function Header({
  wide = false,
  showInstitutionLogin = true
}: {
  wide?: boolean;
  showInstitutionLogin?: boolean;
}) {
  const router = useRouter();
  const [student, setStudent] = useState<StudentSessionUser | null>(null);
  const [socialProvider, setSocialProvider] = useState<"google" | "facebook" | null>(null);

  useEffect(() => {
    const syncStudent = () => setStudent(getStudentSessionUser());
    syncStudent();
    window.addEventListener(STUDENT_SESSION_EVENT, syncStudent);
    window.addEventListener("storage", syncStudent);
    return () => {
      window.removeEventListener(STUDENT_SESSION_EVENT, syncStudent);
      window.removeEventListener("storage", syncStudent);
    };
  }, []);

  const initials = student?.full_name?.trim()?.slice(0, 1).toUpperCase() || "学";

  async function continueWithSocial(provider: "google" | "facebook") {
    setSocialProvider(provider);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/social-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      if (!response.ok) {
        router.push("/login");
        return;
      }
      persistStudentSession((await response.json()) as StudentAuthResponse);
      router.push("/learn");
    } finally {
      setSocialProvider(null);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div
        className={`mx-auto flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8 ${
          wide ? "w-full 2xl:px-10" : "max-w-7xl"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center">
          <img
            src="/logos/logo.png"
            alt="英启教育 Logo"
            className="h-9 w-auto max-w-[9.5rem] object-contain"
          />
        </Link>

        <nav className="hidden flex-1 justify-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden min-w-56 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 xl:flex">
          <Search size={16} className="text-slate-400" />
          <input
            aria-label="搜索课程"
            placeholder="搜索课程、老师或机构"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {student ? (
            <>
              <Link
                href="/learn"
                className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-700 hover:border-mint hover:text-mint"
              >
                {student.avatar_url ? (
                  <img
                    src={student.avatar_url}
                    alt={student.full_name}
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-sm text-slate-600">
                    {initials}
                  </span>
                )}
                <span className="hidden max-w-28 truncate sm:inline">{student.full_name}</span>
              </Link>
              <button
                type="button"
                onClick={clearStudentSession}
                className="focus-ring hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-coral hover:text-coral sm:block"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => continueWithSocial("google")}
                disabled={socialProvider !== null}
                className="focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:border-mint hover:text-mint sm:grid"
                title="Google 登录"
              >
                {socialProvider === "google" ? "..." : "G"}
              </button>
              <button
                type="button"
                onClick={() => continueWithSocial("facebook")}
                disabled={socialProvider !== null}
                className="focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-blue-600 sm:grid"
                title="Facebook 登录"
              >
                {socialProvider === "facebook" ? "..." : <Facebook size={16} />}
              </button>
              <Link
                href="/login"
                className="focus-ring hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-coral hover:text-coral sm:flex"
              >
                <LogIn size={16} />
                登录
              </Link>
              <Link
                href="/register"
                className="focus-ring rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54]"
              >
                注册
              </Link>
            </>
          )}
          {showInstitutionLogin ? (
            <Link
              href="/admin/login"
              className="focus-ring hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-mint hover:text-mint sm:flex"
            >
              <ShieldCheck size={16} />
              {"\u673a\u6784\u767b\u5f55"}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

"use client";

import { ChevronDown, Facebook, LogIn, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  clearStudentSession,
  getStudentSessionUser,
  persistStudentSession,
  STUDENT_SESSION_EVENT,
  type StudentAuthResponse,
  type StudentSessionUser
} from "@/lib/student-session";

const navGroups = [
  {
    key: "teaching",
    label: "\u6559\u5b66",
    items: [
      { href: "/learning-paths", label: "\u5b66\u4e60\u8def\u5f84", description: "\u6309\u7cfb\u5217\u8bfe\u7a0b\u5b8c\u6210\u7cfb\u7edf\u5b66\u4e60" },
      { href: "/institutions", label: "\u673a\u6784", description: "\u67e5\u770b\u5e73\u53f0\u5165\u9a7b\u673a\u6784\u548c\u6559\u5b66\u8d44\u6e90" },
      { href: "/courses", label: "\u8bfe\u7a0b", description: "\u67e5\u770b\u548c\u7b5b\u9009\u5168\u90e8\u8bfe\u7a0b" },
      { href: "/activities", label: "\u6d3b\u52a8", description: "\u53c2\u52a0\u7ebf\u4e0a\u548c\u7ebf\u4e0b\u5b66\u4e60\u6d3b\u52a8" }
    ]
  },
  {
    key: "community",
    label: "\u793e\u533a",
    items: [
      { href: "/leaderboard", label: "\u79ef\u5206\u699c", description: "\u67e5\u770b\u5b66\u751f\u79ef\u5206\u548c\u7b49\u7ea7\u6392\u540d" },
      { href: "/community", label: "\u5b66\u4e60\u793e\u533a", description: "\u63d0\u95ee\u3001\u56de\u7b54\u3001\u5206\u4eab\u7b14\u8bb0" }
    ]
  },
  {
    key: "resources",
    label: "\u5b66\u4e60\u8d44\u6e90",
    items: [
      { href: "/question-bank", label: "\u9898\u5e93", description: "\u7ec3\u4e60\u5404\u7c7b\u673a\u6784\u53d1\u5e03\u7684\u9898\u76ee" },
      { href: "/mock-exams", label: "\u6a21\u62df\u8003\u8bd5", description: "\u6309\u771f\u5b9e\u8003\u8bd5\u8282\u594f\u5b8c\u6210\u6574\u5377\u7ec3\u4e60" },
      { href: "/competitions", label: "\u7ade\u8d5b", description: "\u62a5\u540d\u53c2\u52a0\u9650\u65f6\u7ade\u8d5b\u4e0e\u6311\u6218" },
      { href: "/blog", label: "\u535a\u5ba2", description: "\u9605\u8bfb\u5b66\u4e60\u65b9\u6cd5\u548c\u6559\u80b2\u6587\u7ae0" }
    ]
  }
];

const standaloneNavItem = { href: "/learn", label: "\u6211\u7684\u5b66\u4e60" };
const homeNavItem = { href: "/", label: "\u9996\u9875" };

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
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    function closeNavOnOutsideClick(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenNavGroup(null);
      }
    }
    document.addEventListener("pointerdown", closeNavOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeNavOnOutsideClick);
  }, []);

  const initials = student?.full_name?.trim()?.slice(0, 1).toUpperCase() || "\u5b66";

  async function continueWithSocial(provider: "google" | "facebook") {
    if (provider === "google") {
      router.push("/login");
      return;
    }
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
        className={`mx-auto flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 ${
          wide ? "w-full 2xl:px-10" : "max-w-7xl"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center">
          <img
            src="/logos/logo.png"
            alt="InFuture Logo"
            className="h-9 w-auto max-w-[8.75rem] object-contain lg:max-w-[9.5rem]"
          />
        </Link>

        <nav ref={navRef} className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          <Link
            href={homeNavItem.href}
            prefetch={false}
            className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-ink"
          >
            {homeNavItem.label}
          </Link>
          {navGroups.map((group) => {
            const isOpen = openNavGroup === group.key;
            return (
              <div key={group.key} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenNavGroup(isOpen ? null : group.key)}
                  className={`focus-ring inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
                    isOpen ? "bg-slate-100 text-ink" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  }`}
                  aria-expanded={isOpen}
                >
                  {group.label}
                  <ChevronDown size={15} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div className="absolute left-1/2 top-full z-50 mt-3 w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setOpenNavGroup(null)}
                        className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
                      >
                        <span className="block text-sm font-black text-ink">{item.label}</span>
                        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{item.description}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          <Link
            href={standaloneNavItem.href}
            prefetch={false}
            className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-ink"
          >
            {standaloneNavItem.label}
          </Link>
        </nav>

        <div className="hidden min-w-48 max-w-56 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 2xl:flex">
          <Search size={16} className="text-slate-400" />
          <input
            aria-label="\u641c\u7d22\u8bfe\u7a0b"
            placeholder={"\u641c\u7d22\u8bfe\u7a0b\u3001\u8001\u5e08\u6216\u673a\u6784"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
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
                {"\u9000\u51fa"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => continueWithSocial("google")}
                disabled={socialProvider !== null}
                className="focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:border-mint hover:text-mint sm:grid"
                title={"Google \u767b\u5f55"}
              >
                {socialProvider === "google" ? "..." : "G"}
              </button>
              <button
                type="button"
                onClick={() => continueWithSocial("facebook")}
                disabled={socialProvider !== null}
                className="focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-blue-600 sm:grid"
                title={"Facebook \u767b\u5f55"}
              >
                {socialProvider === "facebook" ? "..." : <Facebook size={16} />}
              </button>
              <Link
                href="/login"
                className="focus-ring hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-coral hover:text-coral sm:flex"
              >
                <LogIn size={16} />
                {"\u767b\u5f55"}
              </Link>
              <Link
                href="/register"
                className="focus-ring rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54]"
              >
                {"\u6ce8\u518c"}
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

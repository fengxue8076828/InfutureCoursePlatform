"use client";

import { API_BASE_URL } from "@/lib/api-config";

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LibraryBig,
  Mail,
  MapPin,
  Medal,
  Phone,
  Search,
  Sparkles,
  Star,
  Trophy,
  Users
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type { Course, CourseCategory, ExamPaper, Institution, Teacher } from "@/lib/types";


type InstitutionCard = {
  institution: Institution;
  rating: number;
  students_count: number;
  courses_count: number;
  teachers_count: number;
  resources_count: number;
  created_at: string;
};

type InstitutionDirectory = {
  institutions: InstitutionCard[];
  top_rated: InstitutionCard[];
  newest: InstitutionCard[];
  most_students: InstitutionCard[];
  categories: string[];
};

type LearningPathSummary = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  cover_url: string;
  audience: string;
  level: string;
  course_count: number;
};

type ActivitySummary = {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at?: string | null;
  mode: "online" | "offline";
  audience?: string | null;
  registrations_count: number;
};

type InstitutionProfile = {
  summary: InstitutionCard;
  categories: CourseCategory[];
  teachers: Teacher[];
  courses: Course[];
  learning_paths: LearningPathSummary[];
  activities: ActivitySummary[];
  mock_exams: ExamPaper[];
  competitions: ExamPaper[];
  question_count: number;
};

const categoryLabels: Record<string, string> = {
  language: "\u8bed\u8a00\u6559\u80b2\u7c7b",
  tutoring: "\u8bfe\u5916\u8865\u4e60\u7c7b",
  it: "IT \u6559\u80b2\u7c7b",
  art: "\u827a\u672f\u6559\u80b2\u7c7b",
  other: "\u7efc\u5408\u6559\u80b2\u7c7b"
};

function readabilityScore(value: string) {
  let score = 0;
  for (const char of value) {
    if (/\p{Script=Han}/u.test(char)) {
      score += 3;
    } else if (/[A-Za-z0-9]/.test(char)) {
      score += 1;
    }
    const code = char.charCodeAt(0);
    if ((code >= 0x80 && code <= 0x9f) || char === "\ufffd") {
      score -= 5;
    }
    if (char === "Ã" || char === "Â") {
      score -= 2;
    }
  }
  return score;
}

function decodeEscapedUnicode(value: string) {
  if (!/\\u[0-9a-fA-F]{4}/.test(value)) {
    return value;
  }
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function repairUtf8Mojibake(value: string) {
  if (!/[ÃÂ]|[\u0080-\u009f]|[èåæçäéï]/.test(value)) {
    return value;
  }
  try {
    const bytes = new Uint8Array(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return readabilityScore(decoded) > readabilityScore(value) ? decoded : value;
  } catch {
    return value;
  }
}

function displayText(value: string | null | undefined, fallback = "") {
  const cleaned = repairUtf8Mojibake(decodeEscapedUnicode(value ?? "")).trim();
  return cleaned || fallback;
}

function institutionCategoryLabel(category: string) {
  return categoryLabels[category] ?? displayText(category);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "\u6700\u8fd1\u5165\u9a7b";
  }
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "\u65f6\u95f4\u5f85\u5b9a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "\u65f6\u95f4\u5f85\u5b9a";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function logoUrl(institution: Institution) {
  return institution.logo_url?.trim() || "/logos/logo.png";
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-ink">{value}</p>
    </div>
  );
}

function InstitutionLogo({ institution, className = "h-16 w-16" }: { institution: Institution; className?: string }) {
  return (
    <div className={`${className} overflow-hidden rounded-2xl bg-slate-100`}>
      <img src={logoUrl(institution)} alt={displayText(institution.name)} className="h-full w-full object-contain p-2" />
    </div>
  );
}

function InstitutionCardView({ card }: { card: InstitutionCard }) {
  return (
    <Link
      href={`/institutions/${card.institution.slug}`}
      className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="flex items-start gap-4">
        <InstitutionLogo institution={card.institution} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-ink group-hover:text-coral">{displayText(card.institution.name)}</h3>
            <span className="rounded-full bg-mint/15 px-2.5 py-1 text-xs font-black text-mint">
              {institutionCategoryLabel(card.institution.category)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">
            {displayText(card.institution.description, "\u8be5\u673a\u6784\u6b63\u5728\u5b8c\u5584\u4ecb\u7ecd\u3002")}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-black text-ink">{card.rating.toFixed(1)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">{"\u8bc4\u5206"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-black text-ink">{card.students_count}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">{"\u5b66\u751f"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-black text-ink">{card.courses_count}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">{"\u8bfe\u7a0b"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-black text-ink">{card.resources_count}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">{"\u8d44\u6e90"}</p>
        </div>
      </div>
    </Link>
  );
}

function RankingPanel({
  title,
  icon,
  items,
  metric
}: {
  title: string;
  icon: typeof Star;
  items: InstitutionCard[];
  metric: (item: InstitutionCard) => string;
}) {
  const Icon = icon;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-coral/10 text-coral">
          <Icon size={20} />
        </div>
        <h2 className="text-lg font-black text-ink">{title}</h2>
      </div>
      <div className="mt-5 space-y-3">
        {items.slice(0, 5).map((item, index) => (
          <Link
            key={item.institution.id}
            href={`/institutions/${item.institution.slug}`}
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-mint/10"
          >
            <span className="w-6 text-sm font-black text-coral">{index + 1}</span>
            <InstitutionLogo institution={item.institution} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-ink">{displayText(item.institution.name)}</p>
              <p className="text-xs font-semibold text-slate-500">{institutionCategoryLabel(item.institution.category)}</p>
            </div>
            <span className="text-xs font-black text-slate-500">{metric(item)}</span>
          </Link>
        ))}
        {!items.length ? (
          <p className="text-sm font-semibold text-slate-500">{"\u6682\u65e0\u673a\u6784\u6570\u636e\u3002"}</p>
        ) : null}
      </div>
    </section>
  );
}

export function InstitutionsDirectoryPage() {
  const [directory, setDirectory] = useState<InstitutionDirectory>({
    institutions: [],
    top_rated: [],
    newest: [],
    most_students: [],
    categories: []
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("\u6b63\u5728\u8bfb\u53d6\u673a\u6784...");

  const categoryOptions = useMemo(() => directory.categories, [directory.categories]);

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (query.trim()) {
          params.set("query", query.trim());
        }
        if (category) {
          params.set("category", category);
        }
        const response = await fetch(`${API_BASE_URL}/institutions/directory?${params.toString()}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("API unavailable");
        }
        const nextDirectory = (await response.json()) as InstitutionDirectory;
        setDirectory(nextDirectory);
        setMessage(
          nextDirectory.institutions.length
            ? `\u627e\u5230 ${nextDirectory.institutions.length} \u5bb6\u673a\u6784`
            : "\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u673a\u6784"
        );
      } catch {
        setMessage("\u673a\u6784\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
      }
    }
    const handle = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(handle);
  }, [query, category]);

  return (
    <main className="bg-slate-50">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[30px] bg-gradient-to-br from-mint/20 via-white to-coral/15 p-8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-coral">Institutions</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <h1 className="text-4xl font-black leading-tight text-ink md:text-5xl">
                {"\u627e\u5230\u9002\u5408\u4f60\u7684\u6559\u80b2\u673a\u6784"}
              </h1>
              <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-slate-600">
                {"\u6309\u673a\u6784\u7c7b\u522b\u3001\u8d44\u6e90\u6570\u91cf\u3001\u5b66\u751f\u89c4\u6a21\u548c\u5e73\u53f0\u8868\u73b0\u5feb\u901f\u7b5b\u9009\uff0c\u8fdb\u5165\u673a\u6784\u4e3b\u9875\u540e\u53ef\u4ee5\u67e5\u770b\u5b83\u53d1\u5e03\u7684\u8bfe\u7a0b\u3001\u5b66\u4e60\u8def\u5f84\u3001\u8003\u8bd5\u3001\u7ade\u8d5b\u548c\u6d3b\u52a8\u3002"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatPill label={"\u5165\u9a7b\u673a\u6784"} value={directory.institutions.length} />
              <StatPill label={"\u53ef\u9009\u7c7b\u522b"} value={directory.categories.length} />
              <StatPill label={"\u8bc4\u5206\u6700\u9ad8"} value={directory.top_rated[0]?.rating.toFixed(1) ?? "-"} />
              <StatPill label={"\u5b66\u751f\u6700\u591a"} value={directory.most_students[0]?.students_count ?? "-"} />
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <label className="relative block">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={"\u641c\u7d22\u673a\u6784\u540d\u79f0\u3001\u7b80\u4ecb\u3001\u5730\u533a"}
                className="w-full rounded-xl border border-slate-200 py-4 pl-11 pr-4 text-sm font-bold text-slate-700 focus:border-mint focus:outline-none"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-700 focus:border-mint focus:outline-none"
            >
              <option value="">{"\u5168\u90e8\u673a\u6784\u7c7b\u522b"}</option>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>
                  {institutionCategoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500">{message}</p>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <RankingPanel title={"\u8bc4\u5206\u6700\u9ad8\u6392\u884c"} icon={Star} items={directory.top_rated} metric={(item) => `${item.rating.toFixed(1)} \u5206`} />
          <RankingPanel title={"\u65b0\u6ce8\u518c\u673a\u6784"} icon={Sparkles} items={directory.newest} metric={(item) => formatDate(item.created_at)} />
          <RankingPanel title={"\u5b66\u751f\u6700\u591a"} icon={Users} items={directory.most_students} metric={(item) => `${item.students_count} \u4eba`} />
        </section>

        <section className="mt-8">
          <div>
            <p className="text-sm font-black text-coral">{"\u5168\u90e8\u673a\u6784"}</p>
            <h2 className="mt-1 text-3xl font-black text-ink">{"\u673a\u6784\u5217\u8868"}</h2>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {directory.institutions.map((card) => (
              <InstitutionCardView key={card.institution.id} card={card} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function ResourceSection({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div>
        <p className="text-sm font-black text-coral">{subtitle}</p>
        <h2 className="mt-1 text-2xl font-black text-ink">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyResource({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500">{text}</div>;
}

export function InstitutionProfilePage({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<InstitutionProfile | null>(null);
  const [message, setMessage] = useState("\u6b63\u5728\u8bfb\u53d6\u673a\u6784\u4e3b\u9875...");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/institutions/${slug}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("API unavailable");
        }
        setProfile((await response.json()) as InstitutionProfile);
        setMessage("");
      } catch {
        setMessage("\u673a\u6784\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
      }
    }
    void load();
  }, [slug]);

  if (!profile) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">{message}</div>
      </main>
    );
  }

  const { institution } = profile.summary;

  return (
    <main className="bg-slate-50">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/institutions" className="text-sm font-black text-slate-500 hover:text-coral">
          {"\u8fd4\u56de\u673a\u6784\u5217\u8868"}
        </Link>

        <section className="mt-5 overflow-hidden rounded-[30px] bg-gradient-to-br from-mint/20 via-white to-coral/15 shadow-sm ring-1 ring-slate-100">
          <div className="grid gap-8 p-8 md:p-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex items-center gap-5">
                <InstitutionLogo institution={institution} className="h-24 w-24" />
                <div>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-mint">
                    {institutionCategoryLabel(institution.category)}
                  </span>
                  <h1 className="mt-3 text-4xl font-black text-ink md:text-5xl">{displayText(institution.name)}</h1>
                  <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500">
                    <MapPin size={15} />
                    {displayText(institution.region, "\u5730\u533a\u5f85\u5b8c\u5584")}
                  </p>
                </div>
              </div>
              <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-slate-600">
                {displayText(institution.description, "\u8be5\u673a\u6784\u6b63\u5728\u5b8c\u5584\u4ecb\u7ecd\u3002")}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold text-slate-600">
                {institution.website ? (
                  <a href={institution.website} target="_blank" className="rounded-full bg-white px-4 py-2 hover:text-coral">
                    {"\u5b98\u7f51"}
                  </a>
                ) : null}
                {institution.email ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2">
                    <Mail size={15} />
                    {institution.email}
                  </span>
                ) : null}
                {institution.phone ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2">
                    <Phone size={15} />
                    {institution.phone}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 self-end">
              <StatPill label={"\u5e73\u53f0\u8bc4\u5206"} value={profile.summary.rating.toFixed(1)} />
              <StatPill label={"\u5b66\u751f\u4eba\u6570"} value={profile.summary.students_count} />
              <StatPill label={"\u53d1\u5e03\u8bfe\u7a0b"} value={profile.summary.courses_count} />
              <StatPill label={"\u9898\u5e93\u9898\u76ee"} value={profile.question_count} />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <ResourceSection title={"\u8bfe\u7a0b"} subtitle="Courses">
              <div className="grid gap-4 md:grid-cols-2">
                {profile.courses.map((course) => (
                  <Link key={course.id} href={`/courses/${course.slug}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-mint hover:bg-mint/5">
                    <div className="h-32 overflow-hidden rounded-lg bg-slate-100">
                      <img src={course.hero_image_url} alt={displayText(course.title)} className="h-full w-full object-cover" />
                    </div>
                    <h3 className="mt-4 text-lg font-black text-ink">{displayText(course.title)}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{displayText(course.category)} / {displayText(course.level)}</p>
                  </Link>
                ))}
              </div>
              {!profile.courses.length ? <EmptyResource text={"\u8be5\u673a\u6784\u6682\u672a\u53d1\u5e03\u8bfe\u7a0b\u3002"} /> : null}
            </ResourceSection>

            <ResourceSection title={"\u5b66\u4e60\u8def\u5f84"} subtitle="Learning Paths">
              <div className="grid gap-4 md:grid-cols-2">
                {profile.learning_paths.map((path) => (
                  <Link key={path.id} href={`/learning-paths/${path.slug}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-mint hover:bg-mint/5">
                    <LibraryBig className="text-mint" />
                    <h3 className="mt-3 text-lg font-black text-ink">{displayText(path.title)}</h3>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{displayText(path.subtitle || path.description)}</p>
                    <p className="mt-3 text-xs font-black text-coral">{path.course_count} {"\u95e8\u8bfe\u7a0b"}</p>
                  </Link>
                ))}
              </div>
              {!profile.learning_paths.length ? <EmptyResource text={"\u8be5\u673a\u6784\u6682\u672a\u53d1\u5e03\u5b66\u4e60\u8def\u5f84\u3002"} /> : null}
            </ResourceSection>

            <ResourceSection title={"\u6a21\u62df\u8003\u8bd5\u4e0e\u7ade\u8d5b"} subtitle="Exams">
              <div className="grid gap-4 md:grid-cols-2">
                {profile.mock_exams.map((paper) => (
                  <Link key={paper.id} href={`/mock-exams/${paper.slug}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-mint hover:bg-mint/5">
                    <GraduationCap className="text-coral" />
                    <h3 className="mt-3 text-lg font-black text-ink">{displayText(paper.title)}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{paper.questions_count} {"\u9898 /"} {paper.duration_minutes} {"\u5206\u949f"}</p>
                  </Link>
                ))}
                {profile.competitions.map((paper) => (
                  <Link key={paper.id} href={`/competitions/${paper.slug}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-mint hover:bg-mint/5">
                    <Trophy className="text-mint" />
                    <h3 className="mt-3 text-lg font-black text-ink">{displayText(paper.title)}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{formatDateTime(paper.starts_at)} {"\u5f00\u59cb"}</p>
                  </Link>
                ))}
              </div>
              {!profile.mock_exams.length && !profile.competitions.length ? (
                <EmptyResource text={"\u8be5\u673a\u6784\u6682\u672a\u53d1\u5e03\u6a21\u62df\u8003\u8bd5\u6216\u7ade\u8d5b\u3002"} />
              ) : null}
            </ResourceSection>
          </div>

          <aside className="space-y-6">
            <ResourceSection title={"\u6559\u5e08\u56e2\u961f"} subtitle="Teachers">
              <div className="space-y-3">
                {profile.teachers.map((teacher) => (
                  <Link key={teacher.id} href={`/teachers/${teacher.slug?.trim() || teacher.id}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-mint/10">
                    <img src={teacher.avatar_url || "/avatars/default-teacher.svg"} alt={displayText(teacher.name)} className="h-12 w-12 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-ink">{displayText(teacher.name)}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">{displayText(teacher.title)}</p>
                    </div>
                    <ArrowRight size={16} className="text-slate-400" />
                  </Link>
                ))}
                {!profile.teachers.length ? <EmptyResource text={"\u8be5\u673a\u6784\u6682\u672a\u5c55\u793a\u6559\u5e08\u3002"} /> : null}
              </div>
            </ResourceSection>

            <ResourceSection title={"\u673a\u6784\u7c7b\u522b"} subtitle="Categories">
              <div className="flex flex-wrap gap-2">
                {profile.categories.map((courseCategory) => (
                  <span key={courseCategory.id} className="rounded-full bg-mint/10 px-3 py-2 text-xs font-black text-mint">
                    {displayText(courseCategory.name)}
                  </span>
                ))}
                {!profile.categories.length ? (
                  <span className="text-sm font-semibold text-slate-500">{"\u6682\u65e0\u81ea\u5b9a\u4e49\u7c7b\u522b\u3002"}</span>
                ) : null}
              </div>
            </ResourceSection>

            <ResourceSection title={"\u6d3b\u52a8"} subtitle="Activities">
              <div className="space-y-3">
                {profile.activities.slice(0, 5).map((activity) => (
                  <Link key={activity.id} href="/activities" className="block rounded-xl bg-slate-50 p-4 transition hover:bg-coral/5">
                    <div className="flex items-center gap-2 text-xs font-black text-coral">
                      <CalendarDays size={14} />
                      {formatDateTime(activity.starts_at)}
                    </div>
                    <h3 className="mt-2 text-sm font-black text-ink">{displayText(activity.title)}</h3>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{displayText(activity.description)}</p>
                  </Link>
                ))}
                {!profile.activities.length ? <EmptyResource text={"\u8be5\u673a\u6784\u6682\u672a\u53d1\u5e03\u6d3b\u52a8\u3002"} /> : null}
              </div>
            </ResourceSection>

            <ResourceSection title={"\u8d44\u6e90\u6982\u89c8"} subtitle="Resources">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <span className="flex items-center gap-2 text-sm font-black text-slate-600">
                    <BookOpen size={16} />
                    {"\u8bfe\u7a0b\u8d44\u6e90"}
                  </span>
                  <span className="font-black text-ink">{profile.summary.resources_count}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <span className="flex items-center gap-2 text-sm font-black text-slate-600">
                    <Medal size={16} />
                    {"\u9898\u5e93\u9898\u76ee"}
                  </span>
                  <span className="font-black text-ink">{profile.question_count}</span>
                </div>
              </div>
            </ResourceSection>
          </aside>
        </section>
      </section>
    </main>
  );
}

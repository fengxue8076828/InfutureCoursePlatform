"use client";

import { MathText } from "@/components/MathText";
import { ResourceTagFilters, type ResourceTagFilterValue } from "@/components/ResourceTagFilters";
import { buildResourceQuery } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-config";
import { getStudentSessionUser } from "@/lib/student-session";
import type { CourseCategory, ExamPaper, ExamPaperKind, ExamPaperQuestion, Question } from "@/lib/types";
import {
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Search,
  Send,
  Trophy,
  Users
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type RegistrationDraft = {
  student_name: string;
  student_email: string;
  phone: string;
  note: string;
};

const emptyRegistrationDraft: RegistrationDraft = {
  student_name: "",
  student_email: "",
  phone: "",
  note: ""
};

const kindConfig = {
  mock_exam: {
    title: "\u6a21\u62df\u8003\u8bd5",
    eyebrow: "Exam Practice",
    description: "\u6309\u771f\u5b9e\u8003\u8bd5\u8282\u594f\u5b8c\u6210\u6574\u5377\u7ec3\u4e60\uff0c\u7cfb\u7edf\u4f1a\u8bb0\u5f55\u7b54\u9898\u65f6\u95f4\u3001\u5f97\u5206\u548c\u5b8c\u6210\u60c5\u51b5\u3002",
    listPath: "/mock-exams",
    apiPath: "mock-exams",
    icon: BookOpenCheck
  },
  competition: {
    title: "\u7ade\u8d5b",
    eyebrow: "Competition",
    description: "\u63d0\u524d\u62a5\u540d\uff0c\u5728\u5f00\u653e\u65f6\u95f4\u5185\u8fdb\u5165\u7ade\u8d5b\u5e76\u63d0\u4ea4\u7b54\u5377\uff0c\u6311\u6218\u66f4\u9ad8\u6c34\u5e73\u7684\u5b66\u4e60\u76ee\u6807\u3002",
    listPath: "/competitions",
    apiPath: "competitions",
    icon: Trophy
  }
} satisfies Record<
  ExamPaperKind,
  {
    title: string;
    eyebrow: string;
    description: string;
    listPath: string;
    apiPath: string;
    icon: typeof Trophy;
  }
>;

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

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function categoryLabel(category: CourseCategory | null | undefined) {
  return category?.name ?? "\u7efc\u5408";
}

function examListUrl(
  config: (typeof kindConfig)[ExamPaperKind],
  filters: ResourceTagFilterValue,
  query: string,
  categoryId: string
) {
  const params = new URLSearchParams(buildResourceQuery(filters).replace(/^\?/, ""));
  if (query.trim()) {
    params.set("query", query.trim());
  }
  if (categoryId) {
    params.set("category_id", categoryId);
  }
  const search = params.toString();
  return `${API_BASE_URL}/${config.apiPath}${search ? `?${search}` : ""}`;
}

function isCompetitionOpen(paper: ExamPaper) {
  const now = Date.now();
  const start = paper.starts_at ? new Date(paper.starts_at).getTime() : Number.NaN;
  const end = paper.ends_at ? new Date(paper.ends_at).getTime() : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function answerForQuestion(answers: Record<string, unknown>, questionId: number) {
  return answers[String(questionId)];
}

function toSubmitAnswer(question: Question, value: unknown) {
  if (question.type === "multiple_choice") {
    return { answers: Array.isArray(value) ? value.map(String) : [] };
  }
  if (question.type === "fill_blank") {
    return { answers: typeof value === "string" ? [value] : [] };
  }
  if (question.type === "single_choice" || question.type === "true_false") {
    return { answer: typeof value === "string" ? value : "" };
  }
  return { text: typeof value === "string" ? value : "" };
}

export function ExamPaperListPage({ kind }: { kind: ExamPaperKind }) {
  const config = kindConfig[kind];
  const Icon = config.icon;
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [filters, setFilters] = useState<ResourceTagFilterValue>({ institutionCategory: "", tagIds: [] });
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;
    async function loadCategories() {
      try {
        const response = await fetch(`${API_BASE_URL}/course-categories`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as CourseCategory[];
        if (!ignore) {
          setCategories(data);
        }
      } catch {
        if (!ignore) {
          setCategories([]);
        }
      }
    }
    loadCategories();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadPapers() {
      setIsLoading(true);
      setMessage("");
      try {
        const response = await fetch(examListUrl(config, filters, query, categoryId), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as ExamPaper[];
        if (!ignore) {
          setPapers(data);
        }
      } catch {
        if (!ignore) {
          setPapers([]);
          setMessage("\u8d44\u6e90\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    loadPapers();
    return () => {
      ignore = true;
    };
  }, [categoryId, config, filters, query]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => category.parent_id !== null);
  }, [categories]);

  return (
    <main className="min-h-screen bg-soft">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-[2rem] bg-ink p-8 text-white shadow-soft md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-coral">{config.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-black md:text-5xl">{config.title}</h1>
              <p className="mt-4 text-base font-semibold leading-8 text-white/75">{config.description}</p>
            </div>
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/10">
              <Icon size={34} />
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
          <ResourceTagFilters value={filters} onChange={setFilters} />
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_240px]">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={18} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="\u641c\u7d22\u6807\u9898\u3001\u4ecb\u7ecd\u6216\u673a\u6784"
                className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:text-slate-400"
              />
            </label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none"
            >
              <option value="">\u5168\u90e8\u8bfe\u7a0b\u7c7b\u522b</option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {message ? <p className="mt-6 rounded-xl bg-white px-5 py-4 text-sm font-bold text-slate-500">{message}</p> : null}

        {isLoading ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
            \u6b63\u5728\u52a0\u8f7d...
          </div>
        ) : papers.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {papers.map((paper) => (
              <Link
                key={paper.id}
                href={`${config.listPath}/${paper.slug}`}
                className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-soft"
              >
                <div className="aspect-[16/9] bg-slate-100">
                  {paper.cover_url ? (
                    <img src={paper.cover_url} alt={paper.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-sm font-black text-slate-400">
                      {config.title}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-black text-mint">
                      {categoryLabel(paper.category)}
                    </span>
                    <span className="text-xs font-black text-slate-400">{paper.duration_minutes} \u5206\u949f</span>
                  </div>
                  <h2 className="mt-4 line-clamp-2 text-xl font-black text-ink">{paper.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">{paper.description}</p>
                  {paper.tag_list?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {paper.tag_list.slice(0, 4).map((tag) => (
                        <span key={tag.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={14} />
                      {paper.questions_count} \u9898
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={14} />
                      {paper.registrations_count} \u4eba\u62a5\u540d
                    </span>
                    <ChevronRight size={16} className="text-coral transition group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-lg font-black text-ink">\u6682\u65f6\u6ca1\u6709\u5339\u914d\u7684\u5185\u5bb9</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">\u53ef\u4ee5\u5c1d\u8bd5\u66f4\u6362\u673a\u6784\u7c7b\u578b\u3001\u6807\u7b7e\u6216\u641c\u7d22\u5173\u952e\u8bcd\u3002</p>
          </div>
        )}
      </section>
    </main>
  );
}

export function ExamPaperDetailPage({ kind, slug }: { kind: ExamPaperKind; slug: string }) {
  const config = kindConfig[kind];
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [registration, setRegistration] = useState<RegistrationDraft>(emptyRegistrationDraft);
  const [started, setStarted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const user = getStudentSessionUser();
    if (user) {
      setStudentName(user.full_name);
      setStudentEmail(user.email);
      setRegistration((current) => ({ ...current, student_name: user.full_name, student_email: user.email }));
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadPaper() {
      setIsLoading(true);
      setMessage("");
      try {
        const response = await fetch(`${API_BASE_URL}/${config.apiPath}/${slug}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as ExamPaper;
        if (!ignore) {
          setPaper(data);
          setRemainingSeconds((data.duration_minutes || 0) * 60);
        }
      } catch {
        if (!ignore) {
          setMessage("\u5185\u5bb9\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    loadPaper();
    return () => {
      ignore = true;
    };
  }, [config, slug]);

  useEffect(() => {
    if (!started || isSubmitted || remainingSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitted, remainingSeconds, started]);

  useEffect(() => {
    if (started && !isSubmitted && remainingSeconds === 0) {
      void submitPaper();
    }
  }, [isSubmitted, remainingSeconds, started]);

  const activeQuestion = paper?.questions?.[activeIndex] ?? null;
  const canStartCompetition = kind !== "competition" || (paper ? isCompetitionOpen(paper) : false);
  const submitDisabled = !paper || isSubmitted || !started;

  async function registerCompetition() {
    if (!paper) {
      return;
    }
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/competitions/${paper.slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || "\u62a5\u540d\u5931\u8d25");
      }
      setMessage("\u62a5\u540d\u6210\u529f\uff0c\u8bf7\u5728\u7ade\u8d5b\u5f00\u653e\u65f6\u95f4\u5185\u8fdb\u5165\u7b54\u9898\u3002");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\u62a5\u540d\u5931\u8d25");
    }
  }

  async function submitPaper() {
    if (!paper || isSubmitted) {
      return;
    }
    setMessage("");
    try {
      const payload = {
        student_name: studentName || registration.student_name || "\u533f\u540d\u5b66\u751f",
        student_email: studentEmail || registration.student_email || "student@example.com",
        answers: Object.fromEntries(
          paper.questions.map((item) => [String(item.question.id), toSubmitAnswer(item.question, answerForQuestion(answers, item.question.id))])
        )
      };
      const response = await fetch(`${API_BASE_URL}/${config.apiPath}/${paper.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || "\u63d0\u4ea4\u5931\u8d25");
      }
      const result = await response.json();
      setIsSubmitted(true);
      setMessage(`\u5df2\u63d0\u4ea4\uff0c\u5f97\u5206 ${result.score ?? 0}/${result.total_score ?? 0}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\u63d0\u4ea4\u5931\u8d25");
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-soft px-6 py-16">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-soft">
          \u6b63\u5728\u52a0\u8f7d...
        </div>
      </main>
    );
  }

  if (!paper) {
    return (
      <main className="min-h-screen bg-soft px-6 py-16">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-soft">
          {message || "\u5185\u5bb9\u4e0d\u5b58\u5728"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-soft">
      <section className="mx-auto max-w-7xl px-6 py-8">
        <Link href={config.listPath} className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-ink">
          <ChevronLeft size={16} /> {config.title}
        </Link>

        <section className="mt-5 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl bg-white shadow-soft">
            <div className="border-b border-slate-100 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-black text-coral">{config.title}</span>
                <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-black text-mint">{categoryLabel(paper.category)}</span>
                {paper.tag_list?.map((tag) => (
                  <span key={tag.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                    #{tag.name}
                  </span>
                ))}
              </div>
              <h1 className="mt-4 text-3xl font-black text-ink md:text-4xl">{paper.title}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-500">{paper.description}</p>
            </div>

            {!started ? (
              <div className="p-6">
                {paper.cover_url ? <img src={paper.cover_url} alt={paper.title} className="mb-6 aspect-[16/7] w-full rounded-xl object-cover" /> : null}
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                  <MathText>{paper.instructions || "\u8bf7\u5728\u89c4\u5b9a\u65f6\u95f4\u5185\u5b8c\u6210\u6574\u5f20\u8bd5\u5377\u3002"}</MathText>
                </div>
                {kind === "competition" && !canStartCompetition ? (
                  <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-700">
                    \u5f53\u524d\u4e0d\u5728\u7ade\u8d5b\u5f00\u653e\u65f6\u95f4\u5185\uff0c\u6682\u65f6\u4e0d\u80fd\u5f00\u59cb\u7b54\u9898\u3002
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!canStartCompetition || !paper.questions.length}
                  onClick={() => setStarted(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <CheckCircle2 size={18} />
                  \u5f00\u59cb\u7b54\u9898
                </button>
              </div>
            ) : activeQuestion ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                  <div>
                    <p className="text-xs font-black uppercase text-coral">
                      Question {activeIndex + 1}/{paper.questions.length}
                    </p>
                    <h2 className="mt-1 text-xl font-black text-ink">{activeQuestion.question.skill_area || "\u7efc\u5408\u9898"}</h2>
                  </div>
                  <div className="rounded-xl bg-ink px-4 py-2 text-sm font-black text-white">{formatTimer(remainingSeconds)}</div>
                </div>
                <ExamQuestionPanel
                  item={activeQuestion}
                  value={answerForQuestion(answers, activeQuestion.question.id)}
                  disabled={isSubmitted}
                  onChange={(value) => setAnswers((current) => ({ ...current, [String(activeQuestion.question.id)]: value }))}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5">
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-40"
                  >
                    <ChevronLeft size={17} />
                    \u4e0a\u4e00\u9898
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {paper.questions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`h-9 w-9 rounded-full text-xs font-black ${
                          index === activeIndex
                            ? "bg-ink text-white"
                            : answers[String(item.question.id)] !== undefined
                              ? "bg-mint text-white"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                  {activeIndex < paper.questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setActiveIndex((index) => Math.min(paper.questions.length - 1, index + 1))}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600"
                    >
                      \u4e0b\u4e00\u9898
                      <ChevronRight size={17} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitDisabled}
                      onClick={() => void submitPaper()}
                      className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-3 text-sm font-black text-white disabled:bg-slate-300"
                    >
                      <Send size={17} />
                      \u63d0\u4ea4\u7b54\u5377
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-sm font-bold text-slate-500">\u8fd9\u4efd\u8bd5\u5377\u6682\u65f6\u6ca1\u6709\u9898\u76ee\u3002</div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-soft">
              <h2 className="text-lg font-black text-ink">\u4fe1\u606f</h2>
              <div className="mt-4 grid gap-3">
                <InfoTile icon={<Clock3 size={18} />} label="\u65f6\u957f" value={`${paper.duration_minutes} \u5206\u949f`} />
                <InfoTile icon={<FileText size={18} />} label="\u9898\u76ee" value={`${paper.questions_count} \u9898`} />
                <InfoTile icon={<CalendarClock size={18} />} label="\u5f00\u59cb" value={formatDateTime(paper.starts_at)} />
                <InfoTile icon={<CalendarClock size={18} />} label="\u7ed3\u675f" value={formatDateTime(paper.ends_at)} />
              </div>
            </div>

            {kind === "competition" ? (
              <div className="rounded-2xl bg-white p-5 shadow-soft">
                <h2 className="text-lg font-black text-ink">\u7ade\u8d5b\u62a5\u540d</h2>
                <div className="mt-4 grid gap-3">
                  <input
                    value={registration.student_name}
                    onChange={(event) => setRegistration((current) => ({ ...current, student_name: event.target.value }))}
                    placeholder="\u5b66\u751f\u59d3\u540d"
                    className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-mint"
                  />
                  <input
                    value={registration.student_email}
                    onChange={(event) => setRegistration((current) => ({ ...current, student_email: event.target.value }))}
                    placeholder="Email"
                    className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-mint"
                  />
                  <input
                    value={registration.phone}
                    onChange={(event) => setRegistration((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="\u8054\u7cfb\u7535\u8bdd"
                    className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-mint"
                  />
                  <textarea
                    value={registration.note}
                    onChange={(event) => setRegistration((current) => ({ ...current, note: event.target.value }))}
                    placeholder="\u5907\u6ce8"
                    rows={3}
                    className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-mint"
                  />
                  <button
                    type="button"
                    onClick={() => void registerCompetition()}
                    className="rounded-lg bg-coral px-4 py-3 text-sm font-black text-white"
                  >
                    \u63d0\u4ea4\u62a5\u540d
                  </button>
                </div>
              </div>
            ) : null}

            {message ? <p className="rounded-xl bg-white p-4 text-sm font-bold leading-7 text-slate-600 shadow-soft">{message}</p> : null}
          </aside>
        </section>
      </section>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-coral">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-ink">{value}</p>
    </div>
  );
}

function ExamQuestionPanel({
  item,
  value,
  onChange,
  disabled
}: {
  item: ExamPaperQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const question = item.question;
  const options = question.options ?? [];

  return (
    <div className="p-5">
      <div className="rounded-xl bg-slate-50 p-5 text-base font-semibold leading-8 text-slate-700">
        <MathText className="block whitespace-pre-wrap">{question.prompt}</MathText>
      </div>

      {question.hint ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold leading-7 text-amber-800">
          <p className="font-black">\u63d0\u793a</p>
          <MathText>{question.hint}</MathText>
        </div>
      ) : null}

      {question.type === "single_choice" || question.type === "true_false" ? (
        <div className="mt-5 grid gap-3">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={value === option.label}
                disabled={disabled}
                onChange={() => onChange(option.label)}
              />
              <span className="font-black text-ink">{option.label}.</span>
              <MathText>{option.text}</MathText>
            </label>
          ))}
        </div>
      ) : question.type === "multiple_choice" ? (
        <div className="mt-5 grid gap-3">
          {options.map((option) => {
            const current = Array.isArray(value) ? value.map(String) : [];
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={current.includes(option.label)}
                  disabled={disabled}
                  onChange={(event) => {
                    onChange(
                      event.target.checked ? [...current, option.label] : current.filter((label) => label !== option.label)
                    );
                  }}
                />
                <span className="font-black text-ink">{option.label}.</span>
                <MathText>{option.text}</MathText>
              </label>
            );
          })}
        </div>
      ) : question.type === "fill_blank" ? (
        <input
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="\u586b\u5199\u7b54\u6848"
          className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-mint"
        />
      ) : (
        <textarea
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="\u8f93\u5165\u4f60\u7684\u7b54\u6848"
          rows={8}
          className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-mint"
        />
      )}
    </div>
  );
}

"use client";

import { API_BASE_URL } from "@/lib/api-config";

import { BookOpenCheck, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, Search, Send, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MathText } from "@/components/MathText";
import { getStudentSessionUser } from "@/lib/student-session";
import type { CourseCategory, ExamPaper, ExamPaperKind, ExamPaperQuestion } from "@/lib/types";


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
    title: "模拟考试",
    eyebrow: "Exam Practice",
    description: "按真实考试节奏完成整卷练习，系统会记录时间、得分和完成情况。",
    listPath: "/mock-exams",
    apiPath: "mock-exams",
    icon: BookOpenCheck
  },
  competition: {
    title: "竞赛",
    eyebrow: "Competition",
    description: "提前报名，在开放时间内进入竞赛并提交答卷。",
    listPath: "/competitions",
    apiPath: "competitions",
    icon: Trophy
  }
} satisfies Record<ExamPaperKind, {
  title: string;
  eyebrow: string;
  description: string;
  listPath: string;
  apiPath: string;
  icon: typeof Trophy;
}>;

function formatDateTime(value?: string | null) {
  if (!value) {
    return "时间待定";
  }
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

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function categoryLabel(category: CourseCategory | null | undefined) {
  return category?.name ?? "综合";
}

function isCompetitionOpen(paper: ExamPaper) {
  const now = Date.now();
  const start = paper.starts_at ? new Date(paper.starts_at).getTime() : Number.NaN;
  const end = paper.ends_at ? new Date(paper.ends_at).getTime() : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

export function ExamPaperListPage({ kind }: { kind: ExamPaperKind }) {
  const config = kindConfig[kind];
  const Icon = config.icon;
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [message, setMessage] = useState(`正在读取${config.title}...`);

  useEffect(() => {
    async function load() {
      try {
        const [paperResponse, categoryResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/${config.apiPath}`, { cache: "no-store" }),
          fetch(`${API_BASE_URL}/course-categories`, { cache: "no-store" })
        ]);
        if (!paperResponse.ok) {
          throw new Error("API unavailable");
        }
        const nextPapers = (await paperResponse.json()) as ExamPaper[];
        setPapers(nextPapers);
        if (categoryResponse.ok) {
          setCategories((await categoryResponse.json()) as CourseCategory[]);
        }
        setMessage(nextPapers.length ? `已加载 ${nextPapers.length} 份${config.title}` : `暂无已发布${config.title}`);
      } catch {
        setMessage(`${config.title}读取失败，请确认 FastAPI 服务正在运行。`);
      }
    }
    void load();
  }, [config.apiPath, config.title]);

  const filteredPapers = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return papers.filter((paper) => {
      const matchesCategory = selectedCategoryId ? paper.category?.id === Number(selectedCategoryId) : true;
      const matchesQuery = lowerQuery
        ? [paper.title, paper.description, paper.audience, paper.institution.name, categoryLabel(paper.category)]
            .join(" ")
            .toLowerCase()
            .includes(lowerQuery)
        : true;
      return matchesCategory && matchesQuery;
    });
  }, [papers, query, selectedCategoryId]);

  const categoryOptions = useMemo(() => {
    const categoryIds = new Set(papers.map((paper) => paper.category?.id).filter(Boolean));
    return categories.filter((category) => categoryIds.has(category.id));
  }, [categories, papers]);

  return (
    <main className="bg-slate-50">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[28px] bg-gradient-to-br from-mint/20 via-white to-coral/15 p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-coral">{config.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-black text-ink md:text-5xl">{config.title}</h1>
              <p className="mt-4 text-base font-semibold leading-8 text-slate-600">{config.description}</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-coral shadow-sm">
              <Icon size={36} />
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
                placeholder={`搜索${config.title}、机构、类别`}
                className="w-full rounded-xl border border-slate-200 py-4 pl-11 pr-4 text-sm font-bold text-slate-700 focus:border-mint focus:outline-none"
              />
            </label>
            <select
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-700 focus:border-mint focus:outline-none"
            >
              <option value="">全部类别</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500">{message}</p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredPapers.map((paper) => (
            <Link
              key={paper.id}
              href={`${config.listPath}/${paper.slug}`}
              className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="h-40 bg-gradient-to-br from-ink via-slate-700 to-mint/70">
                {paper.cover_url ? (
                  <img src={paper.cover_url} alt={paper.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-white">
                    <Icon size={44} />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-black text-mint">
                    {categoryLabel(paper.category)}
                  </span>
                  <span className="text-xs font-black text-slate-400">{paper.questions_count} 题</span>
                </div>
                <h2 className="mt-4 text-xl font-black text-ink group-hover:text-coral">{paper.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">{paper.description}</p>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold text-slate-600">
                  <span className="flex items-center gap-2"><Clock3 size={16} />{paper.duration_minutes} 分钟</span>
                  <span className="flex items-center gap-2"><Users size={16} />{paper.institution.name}</span>
                </div>
                {kind === "competition" ? (
                  <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-xs font-black text-coral">
                    {formatDateTime(paper.starts_at)} - {formatDateTime(paper.ends_at)}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}

export function ExamPaperDetailPage({ kind, slug }: { kind: ExamPaperKind; slug: string }) {
  const config = kindConfig[kind];
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [message, setMessage] = useState(`正在读取${config.title}...`);
  const [startedAt, setStartedAt] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>(emptyRegistrationDraft);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const student = getStudentSessionUser();

  useEffect(() => {
    if (student) {
      setRegistrationDraft((current) => ({
        ...current,
        student_name: current.student_name || student.full_name,
        student_email: current.student_email || student.email
      }));
    }
  }, [student?.id]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/${config.apiPath}/${slug}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("API unavailable");
        }
        const nextPaper = (await response.json()) as ExamPaper;
        setPaper(nextPaper);
        setRemainingSeconds(nextPaper.duration_minutes * 60);
        setMessage("");
      } catch {
        setMessage(`${config.title}读取失败，请确认 FastAPI 服务正在运行。`);
      }
    }
    void load();
  }, [config.apiPath, config.title, slug]);

  useEffect(() => {
    if (!isStarted || isSubmitted || remainingSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isStarted, isSubmitted, remainingSeconds]);

  useEffect(() => {
    if (isStarted && !isSubmitted && remainingSeconds === 0 && paper) {
      void submitPaper();
    }
  }, [remainingSeconds, isStarted, isSubmitted, paper?.id]);

  const activeQuestion = paper?.questions[activeIndex] ?? null;
  const answeredCount = useMemo(
    () => paper?.questions.filter((link) => answers[String(link.question.id)] !== undefined).length ?? 0,
    [answers, paper?.questions]
  );

  function startPaper() {
    setStartedAt(new Date().toISOString());
    setRemainingSeconds((paper?.duration_minutes ?? 60) * 60);
    setIsStarted(true);
  }

  function updateAnswer(questionId: number, value: unknown) {
    setAnswers((current) => ({ ...current, [String(questionId)]: value }));
  }

  async function registerCompetition() {
    if (!paper) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/competitions/${paper.slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationDraft)
      });
      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}`);
      }
      setRegistrationMessage("报名成功，竞赛开始后即可进入答题。");
    } catch (error) {
      setRegistrationMessage(error instanceof Error ? error.message : "报名失败，请稍后再试。");
    }
  }

  async function submitPaper() {
    if (!paper || isSubmitted) {
      return;
    }
    try {
      const payload = {
        student_name: registrationDraft.student_name || student?.full_name || "学生",
        student_email: registrationDraft.student_email || student?.email || "student@example.com",
        started_at: startedAt || new Date().toISOString(),
        answers
      };
      const response = await fetch(`${API_BASE_URL}/${config.apiPath}/${paper.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}`);
      }
      const result = (await response.json()) as { score: number; total_score: number; status: string };
      setIsSubmitted(true);
      setMessage(
        result.status === "pending_manual"
          ? `已提交，部分题目等待人工批改。当前自动得分 ${result.score}/${result.total_score}。`
          : `已提交，得分 ${result.score}/${result.total_score}。`
      );
    } catch (error) {
      setMessage(error instanceof Error ? `提交失败：${error.message}` : "提交失败，请稍后再试。");
    }
  }

  if (!paper) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">{message}</div>
      </main>
    );
  }

  const canStartCompetition = kind !== "competition" || isCompetitionOpen(paper);

  return (
    <main className="bg-slate-100">
      {!isStarted ? (
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <Link href={config.listPath} className="inline-flex items-center gap-2 text-sm font-black text-slate-500">
            <ChevronLeft size={16} /> 返回{config.title}
          </Link>
          <div className="mt-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
            <p className="text-sm font-black text-coral">{config.title}</p>
            <h1 className="mt-2 text-4xl font-black text-ink">{paper.title}</h1>
            <p className="mt-4 text-base font-semibold leading-8 text-slate-600">{paper.description}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <Clock3 className="text-coral" />
                <p className="mt-3 text-2xl font-black text-ink">{paper.duration_minutes} 分钟</p>
                <p className="text-sm font-semibold text-slate-500">答题时长</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <FileText className="text-mint" />
                <p className="mt-3 text-2xl font-black text-ink">{paper.questions_count} 题</p>
                <p className="text-sm font-semibold text-slate-500">整卷提交</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <Users className="text-sky-500" />
                <p className="mt-3 text-2xl font-black text-ink">{paper.institution.name}</p>
                <p className="text-sm font-semibold text-slate-500">发布机构</p>
              </div>
            </div>
            {paper.instructions ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-5 text-sm font-semibold leading-7 text-slate-600">
                {paper.instructions}
              </div>
            ) : null}
            {kind === "competition" ? (
              <div className="mt-6 rounded-2xl bg-coral/5 p-5">
                <p className="font-black text-ink">竞赛时间</p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {formatDateTime(paper.starts_at)} - {formatDateTime(paper.ends_at)}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    value={registrationDraft.student_name}
                    onChange={(event) => setRegistrationDraft((current) => ({ ...current, student_name: event.target.value }))}
                    placeholder="学生姓名"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
                  />
                  <input
                    value={registrationDraft.student_email}
                    onChange={(event) => setRegistrationDraft((current) => ({ ...current, student_email: event.target.value }))}
                    placeholder="学生 Email"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void registerCompetition()}
                  className="mt-4 rounded-xl bg-coral px-5 py-3 text-sm font-black text-white"
                >
                  报名竞赛
                </button>
                {registrationMessage ? <p className="mt-3 text-sm font-bold text-slate-600">{registrationMessage}</p> : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={startPaper}
              disabled={!canStartCompetition}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <CalendarClock size={18} />
              {canStartCompetition ? "进入答题界面" : "竞赛尚未开放"}
            </button>
          </div>
        </section>
      ) : (
        <section className="min-h-screen bg-slate-100">
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-black text-coral">{config.title}</p>
                <h1 className="text-lg font-black text-ink">{paper.title}</h1>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-black text-ink">
                  {answeredCount}/{paper.questions.length} 已答
                </span>
                <span className="rounded-xl bg-ink px-4 py-3 text-sm font-black text-white">
                  {formatTimer(remainingSeconds)}
                </span>
                <button
                  type="button"
                  onClick={() => void submitPaper()}
                  disabled={isSubmitted}
                  className="inline-flex items-center gap-2 rounded-xl bg-coral px-5 py-3 text-sm font-black text-white disabled:bg-slate-300"
                >
                  <Send size={16} /> 提交整卷
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
            <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-sm font-black text-ink">题号导航</p>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {paper.questions.map((link, index) => {
                  const answered = answers[String(link.question.id)] !== undefined;
                  return (
                    <button
                      type="button"
                      key={link.id}
                      onClick={() => setActiveIndex(index)}
                      className={`h-10 rounded-lg text-sm font-black ${
                        activeIndex === index
                          ? "bg-ink text-white"
                          : answered
                            ? "bg-mint/15 text-mint"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
              {message ? (
                <div className="mb-4 rounded-xl bg-mint/10 px-4 py-3 text-sm font-black text-mint">{message}</div>
              ) : null}
              {activeQuestion ? (
                <ExamQuestionPanel
                  link={activeQuestion}
                  answer={answers[String(activeQuestion.question.id)]}
                  onChange={(value) => updateAnswer(activeQuestion.question.id, value)}
                  disabled={isSubmitted}
                />
              ) : null}
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600"
                >
                  <ChevronLeft size={16} /> 上一题
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((index) => Math.min(paper.questions.length - 1, index + 1))}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600"
                >
                  下一题 <ChevronRight size={16} />
                </button>
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

function ExamQuestionPanel({
  link,
  answer,
  onChange,
  disabled
}: {
  link: ExamPaperQuestion;
  answer: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const question = link.question;
  const answerObject = answer && typeof answer === "object" ? (answer as Record<string, unknown>) : {};
  const selected = answerObject.selected;
  const selectedList = Array.isArray(selected) ? selected.map(String) : [];
  const blankAnswers = Array.isArray(answerObject.answers) ? answerObject.answers.map(String) : [""];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-coral">第 {link.position} 题 · {question.type}</p>
          <h2 className="mt-2 text-2xl font-black text-ink">
            <MathText>{question.content?.title ? String(question.content.title) : question.prompt}</MathText>
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">{link.points} 分</span>
      </div>
      {question.content?.title ? (
        <div className="mt-4 text-base font-semibold leading-8 text-slate-700">
          <MathText>{question.prompt}</MathText>
        </div>
      ) : null}
      <div className="mt-6">
        {question.type === "single_choice" ? (
          <div className="space-y-3">
            {question.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  disabled={disabled}
                  checked={selected === option.label}
                  onChange={() => onChange({ selected: option.label })}
                />
                <span className="font-black text-ink">{option.label}.</span>
                <span className="font-semibold text-slate-700"><MathText>{option.text}</MathText></span>
              </label>
            ))}
          </div>
        ) : question.type === "multiple_choice" ? (
          <div className="space-y-3">
            {question.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selectedList.includes(option.label)}
                  onChange={(event) => {
                    const nextSelected = event.target.checked
                      ? [...selectedList, option.label]
                      : selectedList.filter((label) => label !== option.label);
                    onChange({ selected: nextSelected });
                  }}
                />
                <span className="font-black text-ink">{option.label}.</span>
                <span className="font-semibold text-slate-700"><MathText>{option.text}</MathText></span>
              </label>
            ))}
          </div>
        ) : question.type === "fill_blank" ? (
          <div className="space-y-3">
            {blankAnswers.map((value, index) => (
              <input
                key={index}
                value={value}
                disabled={disabled}
                onChange={(event) => {
                  const nextAnswers = [...blankAnswers];
                  nextAnswers[index] = event.target.value;
                  onChange({ answers: nextAnswers });
                }}
                placeholder={`空 ${index + 1}`}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold focus:border-mint focus:outline-none"
              />
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ answers: [...blankAnswers, ""] })}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600"
            >
              添加空
            </button>
          </div>
        ) : question.type === "true_false" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {["true", "false"].map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  disabled={disabled}
                  checked={answerObject.answer === value}
                  onChange={() => onChange({ answer: value })}
                />
                <span className="font-black text-ink">{value === "true" ? "正确" : "错误"}</span>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            value={typeof answerObject.text === "string" ? answerObject.text : ""}
            disabled={disabled}
            onChange={(event) => onChange({ text: event.target.value })}
            rows={10}
            placeholder="在这里输入你的答案"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-7 text-slate-700 focus:border-mint focus:outline-none"
          />
        )}
      </div>
      {disabled ? (
        <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-mint/10 px-4 py-3 text-sm font-black text-mint">
          <CheckCircle2 size={16} /> 已提交
        </div>
      ) : null}
    </div>
  );
}

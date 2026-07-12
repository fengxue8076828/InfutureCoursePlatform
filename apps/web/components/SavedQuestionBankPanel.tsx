"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  FileQuestion,
  Lightbulb,
  Loader2,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { CommunityQuestionBox } from "@/components/CommunityQuestionBox";
import { MathText } from "@/components/MathText";
import { getStudentRequestHeaders, type StudentSessionUser } from "@/lib/student-session";
import type { Question, QuestionMedia, QuestionOption, QuestionType } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, "");
const STORAGE_KEY = "infuture-saved-question-bank-items";
const COMPLETED_STORAGE_KEY = "infuture-completed-question-bank-items";
const CHANGE_EVENT = "infuture-saved-question-bank-change";

type SavedQuestion = { id: number; title: string; savedAt: string };
type CompletedQuestion = SavedQuestion & {
  completedAt: string;
  answer: Record<string, unknown>;
  result: string;
  score?: number | null;
  submissionId?: number;
};
type QuestionAnswer = string | string[] | boolean | { fileName: string; fileType: string };
type SubmissionResponse = {
  id: number;
  question_id: number;
  answer: Record<string, unknown>;
  score?: number | null;
  status?: string;
  feedback?: string | null;
  created_at: string;
};
type CodeRunResult = {
  ok: boolean;
  passed: boolean;
  stdout: string;
  stderr: string;
  error?: string | null;
  duration_ms: number;
  tests: Array<{
    test: string;
    passed: boolean;
    message?: string;
  }>;
};
type BankTab = "active" | "completed";

const ui = {
  questionBank: "\u6211\u7684\u9898\u5e93",
  activeQuestions: "\u6211\u7684\u9898\u76ee",
  completedQuestions: "\u5df2\u5b8c\u6210\u9898\u76ee",
  fromBank: "\u4ece\u9898\u5e93\u9875\u6dfb\u52a0\u7684\u9898\u76ee\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  loadingBank: "\u6b63\u5728\u8bfb\u53d6\u6211\u7684\u9898\u5e93...",
  apiFailed: "\u9898\u5e93\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002",
  unpublished: "\u5df2\u6dfb\u52a0\u7684\u9898\u76ee\u53ef\u80fd\u8fd8\u6ca1\u6709\u53d1\u5e03\uff0c\u6682\u65f6\u4e0d\u80fd\u7ec3\u4e60\u3002",
  emptyBank: "\u8fd8\u6ca1\u6709\u6dfb\u52a0\u9898\u76ee\u3002\u4f60\u53ef\u4ee5\u5230\u9898\u5e93\u9875\u628a\u559c\u6b22\u7684\u9898\u76ee\u52a0\u5165\u6211\u7684\u9898\u5e93\u3002",
  loadingQuestions: "\u6b63\u5728\u52a0\u8f7d\u9898\u76ee",
  activeEmptyTitle: "\u6211\u7684\u9898\u76ee\u8fd8\u662f\u7a7a\u7684",
  activeEmptyDescription: "\u5728\u9898\u5e93\u9875\u70b9\u51fb\u201c\u6dfb\u52a0\u5230\u6211\u7684\u9898\u5e93\u201d\u540e\uff0c\u9898\u76ee\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc\u3002",
  completedEmptyTitle: "\u8fd8\u6ca1\u6709\u5df2\u5b8c\u6210\u9898\u76ee",
  completedEmptyDescription: "\u7b54\u9898\u6b63\u786e\u540e\uff0c\u9898\u76ee\u4f1a\u81ea\u52a8\u5f52\u6863\u5230\u8fd9\u91cc\uff0c\u5e76\u4fdd\u7559\u4f60\u7684\u7b54\u9898\u7ed3\u679c\u3002",
  pending: "\u9053\u5f85\u7ec3\u4e60",
  completed: "\u9053\u5df2\u5b8c\u6210",
  question: "\u9898",
  completedStatus: "\u5df2\u5b8c\u6210",
  correct: "\u56de\u7b54\u6b63\u786e",
  wrong: "\u56de\u7b54\u9519\u8bef",
  manual: "\u7b49\u5f85\u8001\u5e08\u6279\u6539",
  loginFirst: "\u8bf7\u5148\u767b\u5f55\u5b66\u751f\u8d26\u53f7\u540e\u518d\u63d0\u4ea4\u7b54\u6848\u3002",
  fillFirst: "\u8bf7\u5148\u586b\u5199\u7b54\u6848\u3002",
  submitting: "\u6b63\u5728\u63d0\u4ea4\u7b54\u6848...",
  submitFailed: "\u7b54\u6848\u63d0\u4ea4\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",
  ungraded: "\u672a\u5206\u7ea7",
  remove: "\u79fb\u51fa",
  hintOpen: "\u67e5\u770b\u63d0\u793a",
  hintClose: "\u6536\u8d77\u63d0\u793a",
  submitAnswer: "\u63d0\u4ea4\u7b54\u6848",
  submittingShort: "\u63d0\u4ea4\u4e2d...",
  yourAnswer: "\u4f60\u7684\u7b54\u6848",
  result: "\u7b54\u9898\u7ed3\u679c",
  completedAt: "\u5b8c\u6210\u65f6\u95f4",
  answerReview: "\u7b54\u6848\u56de\u770b",
  noAnswer: "\u672a\u8bb0\u5f55\u7b54\u6848",
  submittedFile: "\u5df2\u63d0\u4ea4\u6587\u4ef6",
  trueLabel: "\u6b63\u786e",
  falseLabel: "\u9519\u8bef",
  writeAnswer: "\u586b\u5199\u7b54\u6848",
  codeEditor: "\u5728\u7ebf\u4ee3\u7801\u7f16\u8f91",
  codePlaceholder: "\u5728\u8fd9\u91cc\u7f16\u5199\u6216\u4fee\u6539\u4ee3\u7801",
  chooseAudio: "\u9009\u62e9\u53e3\u8bed\u97f3\u9891",
  chooseMedia: "\u9009\u62e9\u56fe\u7247\u3001\u97f3\u9891\u6216\u89c6\u9891",
  selected: "\u5df2\u9009\u62e9\uff1a",
  inputAnswer: "\u8bf7\u8f93\u5165\u4f60\u7684\u7b54\u6848",
  openAsset: "\u6253\u5f00\u7d20\u6750",
  itemDot: " \u00b7 ",
  separator: "\u3001"
};

const questionTypeLabels: Record<QuestionType, string> = {
  fill_blank: "\u586b\u7a7a\u9898",
  single_choice: "\u5355\u9009\u9898",
  multiple_choice: "\u591a\u9009\u9898",
  writing: "\u5f00\u653e\u5f0f\u7b54\u6848\u9898",
  coding: "\u4ee3\u7801\u7f16\u5199\u9898",
  true_false: "\u5224\u65ad\u9898",
  reading: "\u9605\u8bfb\u7406\u89e3\u9898",
  listening: "\u542c\u529b\u9898",
  pronunciation: "\u53e3\u8bed\u9898",
  media_upload: "\u7d20\u6750\u4e0a\u4f20\u9898"
};

function subscribeToSavedQuestions(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function storageSnapshot(key: string) {
  if (typeof window === "undefined") {
    return "[]";
  }
  return window.localStorage.getItem(key) ?? "[]";
}

function parseSavedQuestions(raw: string): SavedQuestion[] {
  try {
    const parsed = JSON.parse(raw) as SavedQuestion[];
    return Array.isArray(parsed) ? parsed.filter((question) => Number.isFinite(question.id)) : [];
  } catch {
    return [];
  }
}

function parseCompletedQuestions(raw: string): CompletedQuestion[] {
  try {
    const parsed = JSON.parse(raw) as CompletedQuestion[];
    return Array.isArray(parsed)
      ? parsed.filter((question) => Number.isFinite(question.id) && Boolean(question.answer))
      : [];
  } catch {
    return [];
  }
}

function emitQuestionBankChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function persistSavedQuestions(questions: SavedQuestion[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  emitQuestionBankChange();
}

function persistCompletedQuestions(questions: CompletedQuestion[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(questions));
  emitQuestionBankChange();
}

function sortedOptions(options: QuestionOption[]) {
  return [...options].sort((left, right) => left.position - right.position || left.label.localeCompare(right.label));
}

function getQuestionTitle(question: Question) {
  const title = question.content?.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  return question.prompt?.trim() || `Question ${question.id}`;
}

function getBlankLabels(question: Question) {
  const optionLabels = sortedOptions(question.options)
    .map((option) => option.label)
    .filter(Boolean);
  if (optionLabels.length) {
    return optionLabels;
  }
  const blankCount = Math.max(question.prompt.match(/_{2,}|\(\s*\)/g)?.length ?? 1, 1);
  return Array.from({ length: blankCount }, (_, index) => `\u7a7a${index + 1}`);
}

function hasAnswer(answer: QuestionAnswer | undefined) {
  if (answer === undefined || answer === null) {
    return false;
  }
  if (typeof answer === "boolean") {
    return true;
  }
  if (typeof answer === "string") {
    return answer.trim().length > 0;
  }
  if (Array.isArray(answer)) {
    return answer.some((item) => item.trim().length > 0);
  }
  return Boolean(answer.fileName);
}

function toSubmissionAnswer(answer: QuestionAnswer) {
  if (Array.isArray(answer)) {
    return { answer, answers: answer };
  }
  if (typeof answer === "object") {
    return { answer: answer.fileName, file: answer };
  }
  return { answer };
}

function answerFromPayload(question: Question | undefined, answerPayload: Record<string, unknown>): QuestionAnswer | undefined {
  const answers = answerPayload.answers;
  const answer = answerPayload.answer;
  if (question && (question.type === "fill_blank" || question.type === "multiple_choice") && Array.isArray(answers)) {
    return answers.map((item) => String(item ?? ""));
  }
  if (Array.isArray(answer)) {
    return answer.map((item) => String(item ?? ""));
  }
  if (typeof answer === "boolean") {
    return answer;
  }
  const file = answerPayload.file;
  if (file && typeof file === "object" && !Array.isArray(file)) {
    const fileRecord = file as Record<string, unknown>;
    const fileName = typeof fileRecord.fileName === "string" ? fileRecord.fileName : "";
    const fileType = typeof fileRecord.fileType === "string" ? fileRecord.fileType : "";
    if (fileName) {
      return { fileName, fileType };
    }
  }
  if (typeof answer === "string" || typeof answer === "number") {
    return String(answer);
  }
  return undefined;
}

function submissionResultText(submission: SubmissionResponse) {
  if (typeof submission.score === "number") {
    return submission.score > 0 ? ui.correct : ui.wrong;
  }
  return ui.manual;
}

function isCorrectSubmission(submission: SubmissionResponse) {
  return typeof submission.score === "number" && submission.score > 0;
}

function formatAnswerValue(answerPayload: Record<string, unknown>) {
  if (Array.isArray(answerPayload.answers)) {
    return answerPayload.answers.map((item) => String(item ?? "")).join(ui.separator);
  }
  const answer = answerPayload.answer;
  if (typeof answer === "boolean") {
    return answer ? ui.trueLabel : ui.falseLabel;
  }
  if (Array.isArray(answer)) {
    return answer.map((item) => String(item ?? "")).join(ui.separator);
  }
  if (answer !== undefined && answer !== null) {
    return String(answer);
  }
  const file = answerPayload.file;
  if (file && typeof file === "object" && !Array.isArray(file)) {
    const fileRecord = file as Record<string, unknown>;
    return typeof fileRecord.fileName === "string" ? fileRecord.fileName : ui.submittedFile;
  }
  return ui.noAnswer;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function resolveResourceUrl(url: string | null | undefined) {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) {
    return "";
  }
  if (/^(https?:|data:|blob:)/i.test(normalizedUrl)) {
    return normalizedUrl;
  }
  if (normalizedUrl.startsWith("/")) {
    return `${API_ORIGIN}${normalizedUrl}`;
  }
  return normalizedUrl;
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url) || url.startsWith("data:application/pdf");
}

function questionTypeLabel(question: Question | undefined) {
  return question ? questionTypeLabels[question.type] ?? question.type : ui.question;
}

export function SavedQuestionBankPanel({ studentSession }: { studentSession: StudentSessionUser | null }) {
  const savedQuestionsRaw = useSyncExternalStore(
    subscribeToSavedQuestions,
    () => storageSnapshot(STORAGE_KEY),
    () => "[]"
  );
  const completedQuestionsRaw = useSyncExternalStore(
    subscribeToSavedQuestions,
    () => storageSnapshot(COMPLETED_STORAGE_KEY),
    () => "[]"
  );
  const savedQuestions = useMemo(() => parseSavedQuestions(savedQuestionsRaw), [savedQuestionsRaw]);
  const completedQuestions = useMemo(() => parseCompletedQuestions(completedQuestionsRaw), [completedQuestionsRaw]);
  const completedIdSet = useMemo(() => new Set(completedQuestions.map((question) => question.id)), [completedQuestions]);
  const activeSavedQuestions = useMemo(
    () => savedQuestions.filter((question) => !completedIdSet.has(question.id)),
    [completedIdSet, savedQuestions]
  );
  const activeIds = useMemo(() => activeSavedQuestions.map((question) => question.id), [activeSavedQuestions]);
  const completedIds = useMemo(() => completedQuestions.map((question) => question.id), [completedQuestions]);
  const allIdsKey = useMemo(() => Array.from(new Set([...activeIds, ...completedIds])).join(","), [activeIds, completedIds]);
  const [activeTab, setActiveTab] = useState<BankTab>("active");
  const [questionsById, setQuestionsById] = useState<Record<number, Question>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(ui.fromBank);
  const [answers, setAnswers] = useState<Record<number, QuestionAnswer>>({});
  const [submissionStatus, setSubmissionStatus] = useState<Record<number, string>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    let ignore = false;
    if (!allIdsKey) {
      return;
    }

    async function loadQuestions() {
      setIsLoading(true);
      setStatus(ui.loadingBank);
      try {
        const response = await fetch(`${API_BASE_URL}/learn/questions?ids=${encodeURIComponent(allIdsKey)}&ts=${Date.now()}`, {
          headers: getStudentRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("load question bank failed");
        }
        const payload = (await response.json()) as Question[];
        if (ignore) {
          return;
        }
        setQuestionsById(Object.fromEntries(payload.map((question) => [question.id, question])));
        setStatus(payload.length ? `\u5df2\u52a0\u8f7d ${payload.length} \u9053\u9898\u3002` : ui.unpublished);
      } catch {
        if (!ignore) {
          setStatus(ui.apiFailed);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadQuestions();
    return () => {
      ignore = true;
    };
  }, [allIdsKey]);

  const activeQuestions = activeIds.map((id) => questionsById[id]).filter((question): question is Question => Boolean(question));
  const completedQuestionRecords = completedQuestions.map((record) => ({ record, question: questionsById[record.id] }));
  const panelStatus = allIdsKey ? status : ui.emptyBank;

  function removeQuestion(questionId: number) {
    persistSavedQuestions(savedQuestions.filter((question) => question.id !== questionId));
    setAnswers((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setSubmissionStatus((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  function removeCompletedQuestion(questionId: number) {
    persistCompletedQuestions(completedQuestions.filter((question) => question.id !== questionId));
  }

  function updateAnswer(questionId: number, answer: QuestionAnswer) {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setSubmissionStatus((current) => ({ ...current, [questionId]: "" }));
  }

  function archiveCorrectQuestion(question: Question, answer: QuestionAnswer, submission: SubmissionResponse) {
    const completedRecord: CompletedQuestion = {
      id: question.id,
      title: getQuestionTitle(question),
      savedAt: activeSavedQuestions.find((item) => item.id === question.id)?.savedAt ?? new Date().toISOString(),
      completedAt: submission.created_at ?? new Date().toISOString(),
      answer: toSubmissionAnswer(answer),
      result: ui.correct,
      score: submission.score ?? null,
      submissionId: submission.id
    };
    persistCompletedQuestions([completedRecord, ...completedQuestions.filter((item) => item.id !== question.id)]);
    persistSavedQuestions(savedQuestions.filter((item) => item.id !== question.id));
    setAnswers((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    setSubmissionStatus((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    setActiveTab("completed");
  }

  async function submitQuestion(question: Question) {
    const answer = answers[question.id];
    if (!studentSession) {
      setSubmissionStatus((current) => ({ ...current, [question.id]: ui.loginFirst }));
      return;
    }
    if (!hasAnswer(answer)) {
      setSubmissionStatus((current) => ({ ...current, [question.id]: ui.fillFirst }));
      return;
    }

    setSubmittingIds((current) => new Set(current).add(question.id));
    setSubmissionStatus((current) => ({ ...current, [question.id]: ui.submitting }));
    try {
      const response = await fetch(`${API_BASE_URL}/learn/questions/${question.id}/submit`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ answer: toSubmissionAnswer(answer) }),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("submit failed");
      }
      const payload = (await response.json()) as SubmissionResponse;
      const resultText = submissionResultText(payload);
      setSubmissionStatus((current) => ({ ...current, [question.id]: resultText }));
      if (isCorrectSubmission(payload)) {
        archiveCorrectQuestion(question, answer, payload);
      }
    } catch {
      setSubmissionStatus((current) => ({ ...current, [question.id]: ui.submitFailed }));
    } finally {
      setSubmittingIds((current) => {
        const next = new Set(current);
        next.delete(question.id);
        return next;
      });
    }
  }

  return (
    <section className="mt-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-mint/10 text-mint"><Database size={20} /></div>
            <div>
              <h2 className="text-lg font-black text-ink">{ui.questionBank}</h2>
              <p className="mt-1 text-sm text-slate-500">{panelStatus}</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-600">
            {activeSavedQuestions.length} {ui.pending} {ui.itemDot} {completedQuestions.length} {ui.completed}
          </span>
        </div>
        <div className="mt-4 inline-flex rounded-lg bg-white p-1 shadow-sm">
          {[
            { id: "active" as const, label: ui.activeQuestions, count: activeSavedQuestions.length },
            { id: "completed" as const, label: ui.completedQuestions, count: completedQuestions.length }
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`focus-ring rounded-md px-4 py-2 text-sm font-bold transition ${activeTab === tab.id ? "bg-ink text-white" : "text-slate-500 hover:text-ink"}`}>
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-white p-4 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />{ui.loadingQuestions}</div>
      ) : activeTab === "active" ? (
        activeQuestions.length === 0 ? (
          <EmptyQuestionBankState title={ui.activeEmptyTitle} description={ui.activeEmptyDescription} />
        ) : (
          <div className="mt-4 grid gap-2">
            {activeQuestions.map((question, index) => (
              <QuestionPracticeCard key={question.id} index={index} question={question} answer={answers[question.id]} status={submissionStatus[question.id]} isSubmitting={submittingIds.has(question.id)} studentSession={studentSession} onChange={(answer) => updateAnswer(question.id, answer)} onRemove={() => removeQuestion(question.id)} onSubmit={() => void submitQuestion(question)} />
            ))}
          </div>
        )
      ) : completedQuestionRecords.length === 0 ? (
        <EmptyQuestionBankState title={ui.completedEmptyTitle} description={ui.completedEmptyDescription} />
      ) : (
        <div className="mt-4 grid gap-2">
          {completedQuestionRecords.map(({ record, question }, index) => (
            <CompletedQuestionCard key={record.id} index={index} record={record} question={question} onRemove={() => removeCompletedQuestion(record.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyQuestionBankState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <FileQuestion className="mx-auto text-slate-300" size={34} />
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function QuestionSummaryBadges({ question }: { question: Question | undefined }) {
  return (
    <>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
        {question?.difficulty || ui.ungraded}
      </span>
      {question?.institution?.name ? (
        <span className="inline-flex max-w-44 items-center rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">
          <span className="truncate">{question.institution.name}</span>
        </span>
      ) : null}
    </>
  );
}

function CompletedQuestionCard({ index, record, question, onRemove }: { index: number; record: CompletedQuestion; question?: Question; onRemove: () => void }) {
  const restoredAnswer = answerFromPayload(question, record.answer);
  const title = question ? getQuestionTitle(question) : record.title;
  return (
    <details className="group rounded-lg bg-white shadow-sm ring-1 ring-mint/20 transition open:ring-mint/50 hover:bg-slate-50/70">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] gap-3 px-4 py-4 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-mint/10 text-xs font-black text-mint">{index + 1}</span>
          <ChevronDown size={17} className="text-slate-400 transition group-open:rotate-180" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-bold text-mint">{ui.completedStatus}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{questionTypeLabel(question)}</span>
          </div>
          <h3 className="mt-2 truncate text-base font-black text-ink md:text-lg">{title}</h3>
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-start gap-2 md:col-span-1 md:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint"><CheckCircle2 size={14} />{record.result || ui.correct}</span>
          <QuestionSummaryBadges question={question} />
          <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(); }} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-coral/30 bg-white px-3 py-2 text-sm font-bold text-coral transition hover:bg-coral/10"><Trash2 size={15} />{ui.remove}</button>
        </div>
      </summary>
      <div className="border-t border-slate-100 px-4 pb-5 pt-4 md:ml-14">
        {question ? <MathText className="block whitespace-pre-wrap text-sm leading-7 text-slate-700">{question.prompt}</MathText> : null}
        {question ? <QuestionMediaList mediaAssets={question.media_assets} /> : null}
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
          <div><p className="font-bold text-ink">{ui.yourAnswer}</p><p className="mt-1 whitespace-pre-wrap leading-7">{formatAnswerValue(record.answer)}</p></div>
          <div>
            <p className="font-bold text-ink">{ui.result}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 font-bold text-mint"><CheckCircle2 size={16} />{record.result || ui.correct}</p>
            <p className="mt-2 text-xs text-slate-500">{ui.completedAt}: {formatDateTime(record.completedAt)}</p>
          </div>
        </div>
        {question && restoredAnswer !== undefined ? (
          <div className="mt-4 opacity-80">
            <p className="mb-2 text-sm font-bold text-slate-500">{ui.answerReview}</p>
            <QuestionAnswerInput question={question} answer={restoredAnswer} onChange={() => undefined} disabled />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function QuestionPracticeCard({ index, question, answer, status, isSubmitting, studentSession, onChange, onRemove, onSubmit }: { index: number; question: Question; answer: QuestionAnswer | undefined; status?: string; isSubmitting: boolean; studentSession: StudentSessionUser | null; onChange: (answer: QuestionAnswer) => void; onRemove: () => void; onSubmit: () => void }) {
  const [isHintVisible, setIsHintVisible] = useState(false);
  const hint = question.hint?.trim() ?? "";
  return (
    <details className="group rounded-lg bg-white shadow-sm ring-1 ring-slate-100 transition open:ring-mint/40 hover:bg-slate-50/70">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] gap-3 px-4 py-4 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span>
          <ChevronDown size={17} className="text-slate-400 transition group-open:rotate-180" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{questionTypeLabel(question)}</span>
            {status ? <QuestionSubmissionStatus status={status} compact /> : null}
          </div>
          <h3 className="mt-2 truncate text-base font-black text-ink md:text-lg">{getQuestionTitle(question)}</h3>
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-start gap-2 md:col-span-1 md:justify-end">
          <QuestionSummaryBadges question={question} />
          <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(); }} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-coral/30 bg-white px-3 py-2 text-sm font-bold text-coral transition hover:bg-coral/10"><Trash2 size={15} />{ui.remove}</button>
        </div>
      </summary>
      <div className="border-t border-slate-100 px-4 pb-5 pt-4 md:ml-14">
        <MathText className="block whitespace-pre-wrap text-sm leading-7 text-slate-700">{question.prompt}</MathText>
        <QuestionMediaList mediaAssets={question.media_assets} />
        <QuestionAnswerInput question={question} answer={answer} onChange={onChange} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <QuestionSubmissionStatus status={status} />
          <div className="flex flex-wrap items-center gap-2">
            {hint ? <button type="button" onClick={() => setIsHintVisible((current) => !current)} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-bold text-mint"><Lightbulb size={16} />{isHintVisible ? ui.hintClose : ui.hintOpen}</button> : null}
            <button type="button" onClick={onSubmit} disabled={isSubmitting} className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{isSubmitting ? ui.submittingShort : ui.submitAnswer}</button>
          </div>
        </div>
        {hint && isHintVisible ? <div className="mt-3 whitespace-pre-wrap rounded-lg border border-mint/30 bg-mint/10 p-4 text-sm leading-7 text-slate-700"><MathText>{hint}</MathText></div> : null}
        {studentSession ? (
          <div className="mt-4">
            <CommunityQuestionBox
              compact
              title={"\u9488\u5bf9\u8fd9\u9053\u9898\u63d0\u95ee"}
              description={"\u95ee\u9898\u4f1a\u81ea\u52a8\u5173\u8054\u5230\u5f53\u524d\u9898\u76ee\u3002"}
              initialTitle={`${getQuestionTitle(question)} \u7684\u95ee\u9898`}
              linkedQuestionId={question.id}
              tags={[questionTypeLabel(question), question.difficulty, question.skill_area].filter(Boolean)}
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function QuestionSubmissionStatus({ status, compact = false }: { status?: string; compact?: boolean }) {
  if (!status) {
    return <p className="text-sm font-semibold text-slate-500" />;
  }
  const baseClass = compact
    ? "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold"
    : "inline-flex items-center gap-1.5 text-sm font-bold";
  if (status === ui.correct) {
    return <p className={`${baseClass} ${compact ? "bg-mint/10" : ""} text-mint`}><CheckCircle2 size={compact ? 13 : 16} />{status}</p>;
  }
  if (status === ui.wrong) {
    return <p className={`${baseClass} ${compact ? "bg-coral/10" : ""} text-coral`}><AlertTriangle size={compact ? 13 : 16} />{status}</p>;
  }
  return <p className="text-sm font-semibold text-slate-500">{status}</p>;
}

function QuestionMediaList({ mediaAssets }: { mediaAssets: QuestionMedia[] }) {
  const sortedMedia = [...mediaAssets].sort((left, right) => left.position - right.position);
  if (!sortedMedia.length) {
    return null;
  }
  return <div className="mt-4 grid gap-3">{sortedMedia.map((media) => <QuestionMediaPreview key={media.id} media={media} />)}</div>;
}

function QuestionMediaPreview({ media }: { media: QuestionMedia }) {
  const url = resolveResourceUrl(media.url);
  if (!url) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-bold text-ink">{media.title}</p>
      {media.media_type === "image" ? (
        <img src={url} alt={media.title} className="max-h-96 rounded-lg object-contain" />
      ) : media.media_type === "audio" ? (
        <audio controls src={url} className="w-full" />
      ) : media.media_type === "video" ? (
        <video controls src={url} className="max-h-96 w-full rounded-lg bg-ink" />
      ) : isPdfUrl(url) ? (
        <iframe src={url} title={media.title} className="h-96 w-full rounded-lg border border-slate-200 bg-white" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-coral">{ui.openAsset}</a>
      )}
    </div>
  );
}

function SavedCodeRunResultPanel({ result }: { result: CodeRunResult }) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-[#0b1220] p-3 text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 font-bold ${result.passed ? "text-mint" : "text-coral"}`}>
          {result.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {result.passed ? "\u6d4b\u8bd5\u901a\u8fc7" : "\u6d4b\u8bd5\u672a\u901a\u8fc7"}
        </span>
        <span className="text-slate-400">{result.duration_ms}ms</span>
      </div>
      {result.error ? <pre className="mt-2 whitespace-pre-wrap rounded bg-coral/10 p-2 font-mono text-coral">{result.error}</pre> : null}
      {result.stdout ? (
        <div className="mt-2">
          <p className="mb-1 font-bold text-slate-400">stdout</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono">{result.stdout}</pre>
        </div>
      ) : null}
      {result.stderr ? (
        <div className="mt-2">
          <p className="mb-1 font-bold text-slate-400">stderr</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-coral/10 p-2 font-mono text-coral">{result.stderr}</pre>
        </div>
      ) : null}
      {result.tests.length ? (
        <div className="mt-2 grid gap-1.5">
          {result.tests.map((test, index) => (
            <div key={`${test.test}-${index}`} className="rounded border border-white/10 bg-white/5 p-2">
              <p className={`font-bold ${test.passed ? "text-mint" : "text-coral"}`}>
                {test.passed ? "\u901a\u8fc7" : "\u672a\u901a\u8fc7"} · {test.test}
              </p>
              {test.message ? <p className="mt-1 text-slate-300">{test.message}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuestionAnswerInput({ question, answer, onChange, disabled = false }: { question: Question; answer: QuestionAnswer | undefined; onChange: (answer: QuestionAnswer) => void; disabled?: boolean }) {
  const options = sortedOptions(question.options);
  const disabledClass = disabled ? " cursor-not-allowed opacity-80" : "";
  const [codeRunResult, setCodeRunResult] = useState<CodeRunResult | null>(null);
  const [codeRunStatus, setCodeRunStatus] = useState("");
  const [codeRunning, setCodeRunning] = useState(false);

  async function runQuestionCode(code: string) {
    if (!code.trim() || disabled) {
      return;
    }
    setCodeRunning(true);
    setCodeRunStatus("\u6b63\u5728\u8fd0\u884c\u4ee3\u7801...");
    setCodeRunResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/learn/questions/${question.id}/run-code`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: "python" })
      });
      if (!response.ok) {
        throw new Error("run failed");
      }
      const payload = (await response.json()) as CodeRunResult;
      setCodeRunResult(payload);
      setCodeRunStatus(
        payload.ok
          ? payload.passed
            ? "\u8fd0\u884c\u5b8c\u6210\uff0c\u6d4b\u8bd5\u5df2\u901a\u8fc7\u3002"
            : "\u8fd0\u884c\u5b8c\u6210\uff0c\u8fd8\u6709\u6d4b\u8bd5\u672a\u901a\u8fc7\u3002"
          : "\u8fd0\u884c\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u4ee3\u7801\u3002"
      );
    } catch {
      setCodeRunStatus("\u4ee3\u7801\u8fd0\u884c\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    } finally {
      setCodeRunning(false);
    }
  }

  if (question.type === "single_choice") {
    return (
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm${disabledClass}`}>
            <input type="radio" name={`saved-question-${question.id}`} value={option.label} checked={answer === option.label} disabled={disabled} onChange={() => onChange(option.label)} className="mt-1" />
            <span><span className="font-bold text-ink">{option.label}.</span> <MathText>{option.text}</MathText></span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    const selectedAnswers = Array.isArray(answer) ? answer : [];
    return (
      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const checked = selectedAnswers.includes(option.label);
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm${disabledClass}`}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onChange(checked ? selectedAnswers.filter((item) => item !== option.label) : [...selectedAnswers, option.label])} className="mt-1" />
              <span><span className="font-bold text-ink">{option.label}.</span> <MathText>{option.text}</MathText></span>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "fill_blank") {
    const labels = getBlankLabels(question);
    const values = Array.isArray(answer) ? answer : [];
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {labels.map((label, index) => (
          <label key={`${question.id}-${label}`} className="grid gap-1.5 text-sm font-semibold text-slate-700">
            {label}
            <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" value={values[index] ?? ""} disabled={disabled} onChange={(event) => { const nextValues = [...values]; nextValues[index] = event.target.value; onChange(nextValues); }} placeholder={ui.writeAnswer} />
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "true_false") {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {[{ label: ui.trueLabel, value: true }, { label: ui.falseLabel, value: false }].map((item) => (
          <button key={item.label} type="button" onClick={() => onChange(item.value)} disabled={disabled} className={`focus-ring rounded-lg border px-4 py-2 text-sm font-bold disabled:cursor-not-allowed ${answer === item.value ? "border-mint bg-mint text-white" : "border-slate-200 bg-white text-slate-700"}`}>{item.label}</button>
        ))}
      </div>
    );
  }

  if (question.type === "coding") {
    const starterCode = typeof question.content?.starter_code === "string" ? question.content.starter_code : "";
    const value = typeof answer === "string" ? answer : starterCode;
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-[#111827] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-skysoft"><Code2 size={16} />{ui.codeEditor}</div>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} spellCheck={false} className="h-72 w-full resize-y rounded-lg border border-white/10 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-80" placeholder={ui.codePlaceholder} />
        {!disabled ? (
          <button
            type="button"
            onClick={() => void runQuestionCode(value)}
            disabled={codeRunning || !value.trim()}
            className="focus-ring mt-3 rounded-lg bg-mint px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {codeRunning ? "\u8fd0\u884c\u4e2d..." : "\u8fd0\u884c\u4ee3\u7801"}
          </button>
        ) : null}
        {codeRunStatus ? <p className="mt-3 text-sm font-semibold text-slate-200">{codeRunStatus}</p> : null}
        {codeRunResult ? <SavedCodeRunResultPanel result={codeRunResult} /> : null}
      </div>
    );
  }

  if (question.type === "pronunciation" || question.type === "media_upload") {
    const accept = question.type === "pronunciation" ? "audio/*" : "image/*,video/*,audio/*";
    const currentFile = typeof answer === "object" && !Array.isArray(answer) ? answer : null;
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
        {!disabled ? (
          <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            <Upload size={16} />{question.type === "pronunciation" ? ui.chooseAudio : ui.chooseMedia}
            <input type="file" accept={accept} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onChange({ fileName: file.name, fileType: file.type }); }} />
          </label>
        ) : null}
        {currentFile ? <p className="mt-3 text-sm font-semibold text-slate-600">{ui.selected}{currentFile.fileName}</p> : null}
      </div>
    );
  }

  return <textarea value={typeof answer === "string" ? answer : ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="focus-ring mt-4 h-44 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7 disabled:cursor-not-allowed disabled:bg-slate-100" placeholder={ui.inputAnswer} />;
}


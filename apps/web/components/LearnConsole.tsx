"use client";

import { API_BASE_URL } from "@/lib/api-config";

import {
  Bold,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  Highlighter,
  Italic,
  List,
  ListVideo,
  Lock,
  MessageSquareText,
  NotebookPen,
  Palette,
  Send,
  Star,
  Type,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, SyntheticEvent as ReactSyntheticEvent } from "react";

import { CommunityQuestionBox } from "@/components/CommunityQuestionBox";
import { MathText } from "@/components/MathText";
import { getStudentRequestHeaders } from "@/lib/student-session";
import type { Chapter, CourseReview, Enrollment, LessonItem, Question, QuestionMedia, QuestionOption } from "@/lib/types";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const LEARN_LAYOUT_STORAGE_KEY = "infuture-learn-console-layout";
const STUDENT_NOTES_UPDATED_EVENT = "infuture-student-notes-updated";
const COURSE_REVIEW_ITEM_ID = -9001;
const DEFAULT_SIDEBAR_WIDTH = 304;
const DEFAULT_NOTES_WIDTH = 352;
const DEFAULT_NOTE_EDITOR_HEIGHT = 420;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 440;
const MIN_NOTES_WIDTH = 280;
const MAX_NOTES_WIDTH = 560;
const MIN_NOTE_EDITOR_HEIGHT = 220;
const MAX_NOTE_EDITOR_HEIGHT = 760;

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readStoredLearnLayout() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const rawLayout = window.localStorage.getItem(LEARN_LAYOUT_STORAGE_KEY);
    if (!rawLayout) return null;
    const layout = JSON.parse(rawLayout) as { sidebarWidth?: number; notesWidth?: number; noteEditorHeight?: number };
    return {
      sidebarWidth: typeof layout.sidebarWidth === "number" ? clampPanelWidth(layout.sidebarWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) : null,
      notesWidth: typeof layout.notesWidth === "number" ? clampPanelWidth(layout.notesWidth, MIN_NOTES_WIDTH, MAX_NOTES_WIDTH) : null,
      noteEditorHeight: typeof layout.noteEditorHeight === "number" ? clampPanelWidth(layout.noteEditorHeight, MIN_NOTE_EDITOR_HEIGHT, MAX_NOTE_EDITOR_HEIGHT) : null
    };
  } catch {
    return null;
  }
}

const questionTypeLabels: Record<string, string> = {
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

const iconMap = {
  video: ListVideo,
  handout: FileText,
  exercise: Code2,
  quiz: CheckCircle2,
  review: Star
};

type QuestionAnswer = string | string[] | boolean | { fileName: string; fileType: string };

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

type SubmissionRecord = {
  id: number;
  question_id: number;
  answer: Record<string, unknown>;
  score?: number | null;
  status?: string;
  feedback?: string | null;
  created_at: string;
};

type ItemSubmissionState = {
  item_id: number;
  enrollment_id: number;
  score: number;
  total_score: number;
  passed?: boolean | null;
  pending_manual_count?: number;
  completed_at?: string | null;
  submissions: SubmissionRecord[];
};

function lessonItemQuestionIds(item: LessonItem | undefined) {
  const questionIds = item?.body?.question_ids;
  return Array.isArray(questionIds)
    ? questionIds.filter((questionId): questionId is number => typeof questionId === "number")
    : [];
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

function isVideoResourceUrl(url: string) {
  if (!url) return false;
  return /^(blob:|data:video\/)/i.test(url) || /\/uploads\/video\//i.test(url) || /\.(mp4|webm|ogg|mov|m4v)([?#].*)?$/i.test(url);
}

type LessonItemProgressState = "completed" | "warning" | "pending";

function completedItemIdSet(enrollment: Enrollment | undefined) {
  return new Set(
    (enrollment?.progress_records ?? [])
      .filter((record) => Boolean(record.completed_at))
      .map((record) => record.lesson_item_id)
  );
}
export function LearnConsole({
  enrollments,
  initialCourseSlug
}: {
  enrollments: Enrollment[];
  initialCourseSlug?: string;
}) {
  const selectedEnrollment =
    enrollments.find((item) => item.course.slug === initialCourseSlug) ?? enrollments[0];
  const isCourseCompleted = selectedEnrollment?.status === "completed";
  const course = selectedEnrollment?.course;
  const courseReviewItem = useMemo<LessonItem | undefined>(
    () =>
      course
        ? {
            id: COURSE_REVIEW_ITEM_ID,
            title: "\u8bfe\u7a0b\u8bc4\u5206\u4e0e\u8bc4\u8bed",
            item_type: "review",
            content_url: null,
            body: {},
            required_minutes: 0,
            position: Number.MAX_SAFE_INTEGER
          }
        : undefined,
    [course]
  );
  const courseItems = useMemo(() => course?.chapters?.flatMap((chapter) => chapter.items) ?? [], [course]);
  const items = useMemo(() => (courseReviewItem ? [...courseItems, courseReviewItem] : courseItems), [courseItems, courseReviewItem]);
  const itemIdsKey = useMemo(() => items.map((item) => item.id).join(","), [items]);
  const firstItemId = items[0]?.id;
  const [itemId, setItemId] = useState<number | undefined>(items[0]?.id);
  const [notesOpen, setNotesOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [notesWidth, setNotesWidth] = useState(DEFAULT_NOTES_WIDTH);
  const [noteEditorHeight, setNoteEditorHeight] = useState(DEFAULT_NOTE_EDITOR_HEIGHT);
  const [resizingPanel, setResizingPanel] = useState<"sidebar" | "notes" | "noteQuestion" | null>(null);
  const resizeStateRef = useRef<{
    panel: "sidebar" | "notes" | "noteQuestion";
    startX: number;
    startY: number;
    sidebarWidth: number;
    notesWidth: number;
    noteEditorHeight: number;
  } | null>(null);
  const [questionsByItemId, setQuestionsByItemId] = useState<Record<number, Question[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsStatus, setQuestionsStatus] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [notesStatus, setNotesStatus] = useState("");
  const [completionStatus, setCompletionStatus] = useState("");
  const [completedItemIds, setCompletedItemIds] = useState<Set<number>>(() => completedItemIdSet(selectedEnrollment));
  const completedItemIdsRef = useRef(completedItemIds);
  const completedProgressKey = (selectedEnrollment?.progress_records ?? [])
    .filter((record) => Boolean(record.completed_at))
    .map((record) => record.lesson_item_id)
    .join(",");
  const [warningItemIds, setWarningItemIds] = useState<Set<number>>(() => new Set());
  const [completionBusyIds, setCompletionBusyIds] = useState<Set<number>>(() => new Set());
  const completionBusyIdsRef = useRef(completionBusyIds);
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<number>>(() => new Set());
  const [courseReview, setCourseReview] = useState<CourseReview | null>(null);
  const [courseReviewStatus, setCourseReviewStatus] = useState("");
  const [courseReviewLoading, setCourseReviewLoading] = useState(false);
  const activeItem = items.find((item) => item.id === itemId) ?? items[0];
  const activeItemId = activeItem?.id;
  const activeItemType = activeItem?.item_type;
  const activeChapter = useMemo(
    () => course?.chapters?.find((chapter) => chapter.items.some((item) => item.id === activeItem?.id)),
    [activeItem?.id, course?.chapters]
  );
  const activeChapterId = activeChapter?.id;
  const activeQuestionIds = useMemo(() => lessonItemQuestionIds(activeItem), [activeItem]);
  const activeQuestionKey = activeQuestionIds.join(",");
  const activeQuestions = activeItem && activeQuestionIds.length ? questionsByItemId[activeItem.id] ?? [] : [];

  const completeLessonItem = useCallback(
    async (item: LessonItem, score?: number) => {
      if (isCourseCompleted) {
        setCompletionStatus("\u8bfe\u7a0b\u5df2\u5b8c\u6210\uff0c\u5f53\u524d\u4e3a\u590d\u4e60\u6a21\u5f0f\u3002");
        return;
      }
      if (completedItemIdsRef.current.has(item.id) || completionBusyIdsRef.current.has(item.id)) {
        return;
      }
      completionBusyIdsRef.current = new Set(completionBusyIdsRef.current).add(item.id);
      setCompletionBusyIds((current) => new Set(current).add(item.id));
      setCompletionStatus("\u6b63\u5728\u66f4\u65b0\u5b66\u4e60\u8fdb\u5ea6...");
      try {
        const response = await fetch(`${API_BASE_URL}/learn/items/${item.id}/complete`, {
          method: "POST",
          headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ notes: null, score: typeof score === "number" ? score : null })
        });
        if (!response.ok) {
          throw new Error("complete failed");
        }
        completedItemIdsRef.current = new Set(completedItemIdsRef.current).add(item.id);
        setCompletedItemIds((current) => new Set(current).add(item.id));
        setWarningItemIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setCompletionStatus("\u9879\u76ee\u5df2\u81ea\u52a8\u6807\u8bb0\u4e3a\u5b8c\u6210\u3002");
      } catch {
        setCompletionStatus("\u8fdb\u5ea6\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
      } finally {
        const nextBusyIds = new Set(completionBusyIdsRef.current);
        nextBusyIds.delete(item.id);
        completionBusyIdsRef.current = nextBusyIds;
        setCompletionBusyIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [isCourseCompleted]
  );

  useEffect(() => {
    if (isCourseCompleted || !activeItem || activeItem.item_type !== "handout" || completedItemIds.has(activeItem.id)) {
      return;
    }
    const waitMs = Math.max(activeItem.required_minutes || 0, 0) * 60_000;
    const timer = window.setTimeout(() => {
      void completeLessonItem(activeItem);
    }, waitMs > 0 ? waitMs : 1000);
    return () => window.clearTimeout(timer);
  }, [activeItem, completedItemIds, completeLessonItem, isCourseCompleted]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const layout = readStoredLearnLayout();
      if (!layout) return;
      if (typeof layout.sidebarWidth === "number") {
        setSidebarWidth(layout.sidebarWidth);
      }
      if (typeof layout.notesWidth === "number") {
        setNotesWidth(layout.notesWidth);
      }
      if (typeof layout.noteEditorHeight === "number") {
        setNoteEditorHeight(layout.noteEditorHeight);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEARN_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth, notesWidth, noteEditorHeight }));
    } catch {
      // Layout persistence is optional.
    }
  }, [noteEditorHeight, notesWidth, sidebarWidth]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      const validItemIds = new Set(
        itemIdsKey
          .split(",")
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );
      setItemId((currentItemId) =>
        currentItemId && validItemIds.has(currentItemId) ? currentItemId : firstItemId
      );
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [firstItemId, itemIdsKey]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      const nextCompletedIds = new Set(
        completedProgressKey
          .split(",")
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );
      completedItemIdsRef.current = nextCompletedIds;
      setCompletedItemIds(nextCompletedIds);
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [completedProgressKey]);

  useEffect(() => {
    if (!resizingPanel) return;

    function handlePointerMove(event: PointerEvent) {
      const state = resizeStateRef.current;
      if (!state) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (state.panel === "sidebar") {
        setSidebarWidth(clampPanelWidth(state.sidebarWidth + deltaX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
      } else if (state.panel === "notes") {
        setNotesWidth(clampPanelWidth(state.notesWidth - deltaX, MIN_NOTES_WIDTH, MAX_NOTES_WIDTH));
      } else {
        setNoteEditorHeight(clampPanelWidth(state.noteEditorHeight + deltaY, MIN_NOTE_EDITOR_HEIGHT, MAX_NOTE_EDITOR_HEIGHT));
      }
    }

    function stopResize() {
      resizeStateRef.current = null;
      setResizingPanel(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
    document.body.style.cursor = resizingPanel === "noteQuestion" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingPanel]);

  useEffect(() => {
    if (!activeChapterId) {
      return;
    }

    let ignore = false;
    async function loadChapterNote() {
      setNotesStatus("\u6b63\u5728\u52a0\u8f7d\u672c\u7ae0\u7b14\u8bb0...");
      try {
        const response = await fetch(
          `${API_BASE_URL}/learn/chapters/${activeChapterId}/notes?enrollment_id=${selectedEnrollment.id}`,
          { headers: getStudentRequestHeaders(), cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("load note failed");
        }
        const payload = (await response.json()) as { content?: string };
        if (!ignore) {
          setNotesHtml(payload.content ?? "");
          setNotesStatus("");
        }
      } catch {
        if (!ignore) {
          setNotesHtml("");
          setNotesStatus("\u7b14\u8bb0\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      }
    }

    void loadChapterNote();
    return () => {
      ignore = true;
    };
  }, [activeChapterId, selectedEnrollment.id]);

  useEffect(() => {
    if (!course?.slug || !selectedEnrollment?.id) {
      return;
    }
    let ignore = false;
    async function loadCourseReview() {
      setCourseReviewLoading(true);
      setCourseReviewStatus("\u6b63\u5728\u8bfb\u53d6\u8bfe\u7a0b\u8bc4\u4ef7...");
      try {
        const response = await fetch(
          `${API_BASE_URL}/learn/courses/${course.slug}/review?enrollment_id=${selectedEnrollment.id}`,
          { headers: getStudentRequestHeaders(), cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("load course review failed");
        }
        const payload = (await response.json()) as CourseReview;
        if (!ignore) {
          setCourseReview(payload);
          setCourseReviewStatus("");
        }
      } catch {
        if (!ignore) {
          setCourseReview(null);
          setCourseReviewStatus("\u8bfe\u7a0b\u8bc4\u4ef7\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      } finally {
        if (!ignore) {
          setCourseReviewLoading(false);
        }
      }
    }
    void loadCourseReview();
    return () => {
      ignore = true;
    };
  }, [course?.slug, selectedEnrollment?.id]);

  useEffect(() => {
    if (!activeItemId || (activeItemType !== "exercise" && activeItemType !== "quiz")) {
      return;
    }
    const requestQuestionIds = activeQuestionKey
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (!requestQuestionIds.length) {
      const clearTimer = window.setTimeout(() => {
        setQuestionsByItemId((current) => {
          if (!current[activeItemId]) {
            return current;
          }
          const next = { ...current };
          delete next[activeItemId];
          return next;
        });
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }

    let ignore = false;
    async function loadQuestions() {
      setQuestionsLoading(true);
      setQuestionsStatus("\u6b63\u5728\u52a0\u8f7d\u9898\u76ee...");
      try {
        const response = await fetch(`${API_BASE_URL}/learn/questions?ids=${activeQuestionKey}`, {
          headers: getStudentRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("load failed");
        }
        const payload = (await response.json()) as Question[];
        const sortedQuestions = requestQuestionIds
          .map((questionId) => payload.find((question) => question.id === questionId))
          .filter((question): question is Question => Boolean(question));
        if (!ignore) {
          setQuestionsByItemId((current) => ({ ...current, [activeItemId]: sortedQuestions }));
          setQuestionsStatus(sortedQuestions.length ? "" : "\u5f53\u524d\u9879\u76ee\u914d\u7f6e\u7684\u9898\u76ee\u8fd8\u6ca1\u6709\u53d1\u5e03\u3002");
        }
      } catch {
        if (!ignore) {
          setQuestionsStatus("\u9898\u76ee\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      } finally {
        if (!ignore) {
          setQuestionsLoading(false);
        }
      }
    }

    void loadQuestions();
    return () => {
      ignore = true;
    };
  }, [activeItemId, activeItemType, activeQuestionKey]);

  const completeVideoItem = useCallback(
    (item: LessonItem | undefined) => {
      if (!item || item.item_type !== "video") {
        return;
      }
      void completeLessonItem(item);
    },
    [completeLessonItem]
  );

  const handleVideoTimeUpdate = useCallback(
    (event: ReactSyntheticEvent<HTMLVideoElement>, item: LessonItem) => {
      const video = event.currentTarget;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }
      const watchedRatio = video.currentTime / duration;
      const remainingSeconds = duration - video.currentTime;
      if (watchedRatio >= 0.98 || remainingSeconds <= 1) {
        completeVideoItem(item);
      }
    },
    [completeVideoItem]
  );

  if (!course || !activeItem) {
    return <div className="panel rounded-lg p-8 text-center text-slate-500">{"\u5f53\u524d\u8bfe\u7a0b\u8fd8\u6ca1\u6709\u53ef\u5b66\u4e60\u7684\u7ae0\u8282\u5185\u5bb9\u3002"}</div>;
  }

  const videoUrl = resolveResourceUrl(activeItem.content_url ?? course.intro_video_url);
  const isDirectVideo = isVideoResourceUrl(videoUrl);
  const activeQuestionStatus =
    activeQuestionIds.length === 0 && (activeItem.item_type === "exercise" || activeItem.item_type === "quiz")
      ? "\u5f53\u524d\u9879\u76ee\u8fd8\u6ca1\u6709\u914d\u7f6e\u9898\u76ee\u3002"
      : questionsStatus;

  function itemProgressState(item: LessonItem): LessonItemProgressState {
    if (isCourseCompleted) {
      return "completed";
    }
    if (completedItemIds.has(item.id)) {
      return "completed";
    }
    if (warningItemIds.has(item.id)) {
      return "warning";
    }
    return "pending";
  }

  function isChapterCompleted(chapter: Chapter) {
    if (isCourseCompleted) {
      return true;
    }
    return chapter.items.every((item) => completedItemIds.has(item.id));
  }

  function isCourseWorkCompleted() {
    if (isCourseCompleted) {
      return true;
    }
    if (courseItems.length === 0) {
      return true;
    }
    return courseItems.every((item) => completedItemIds.has(item.id));
  }

  function isChapterUnlocked(chapter: Chapter) {
    if (isCourseCompleted) {
      return true;
    }
    const chapters = course.chapters ?? [];
    const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
    if (chapterIndex <= 0) {
      return true;
    }
    return chapters.slice(0, chapterIndex).every(isChapterCompleted);
  }

  function toggleChapter(chapterId: number) {
    setCollapsedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  function startResize(panel: "sidebar" | "notes" | "noteQuestion", event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeStateRef.current = { panel, startX: event.clientX, startY: event.clientY, sidebarWidth, notesWidth, noteEditorHeight };
    setResizingPanel(panel);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  async function saveChapterNote() {
    if (!activeChapter) {
      return;
    }
    setNotesStatus("\u6b63\u5728\u4fdd\u5b58\u672c\u7ae0\u7b14\u8bb0...");
    try {
      const response = await fetch(`${API_BASE_URL}/learn/chapters/${activeChapter.id}/notes`, {
        method: "PATCH",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ enrollment_id: selectedEnrollment.id, content: notesHtml })
      });
      if (!response.ok) {
        throw new Error("save note failed");
      }
      setNotesStatus("\u672c\u7ae0\u5b66\u4e60\u7b14\u8bb0\u5df2\u4fdd\u5b58\u3002");
      window.dispatchEvent(new Event(STUDENT_NOTES_UPDATED_EVENT));
    } catch {
      setNotesStatus("\u7b14\u8bb0\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    }
  }

  const layoutStyle = {
    "--learn-grid-columns": `${sidebarWidth}px 0.625rem minmax(0,1fr)`,
    "--learn-notes-width": `${notesWidth}px`,
    "--learn-note-editor-height": `${noteEditorHeight}px`
  } as CSSProperties;

  return (
    <div className="grid min-h-[calc(100vh-11rem)] gap-5 lg:grid-cols-[var(--learn-grid-columns)] lg:gap-0" style={layoutStyle}>
      <aside className="panel min-w-0 rounded-lg p-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase text-slate-400">{"\u5f53\u524d\u8bfe\u7a0b"}</p>
          <p className="mt-1 line-clamp-2 text-sm font-bold text-ink">{course.title}</p>
        </div>

        <div className="mt-5 grid gap-3">
          {course.chapters?.map((chapter) => {
            const collapsed = collapsedChapterIds.has(chapter.id);
            const chapterUnlocked = isChapterUnlocked(chapter);
            return (
              <section key={chapter.id} className="rounded-lg border border-slate-200 bg-white p-2">
                <button
                  type="button"
                  onClick={() => toggleChapter(chapter.id)}
                  className={`focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                    chapterUnlocked ? "" : "text-slate-400"
                  }`}
                  aria-expanded={!collapsed}
                >
                  <ChevronRight
                    size={16}
                    className={`shrink-0 text-slate-500 transition ${collapsed ? "" : "rotate-90"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{chapter.title}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                      {`${chapter.items.length} \u4e2a\u9879\u76ee`}
                    </span>
                  </span>
                  {!chapterUnlocked ? <Lock size={16} className="shrink-0 text-slate-400" /> : null}
                </button>

                {!collapsed ? (
                  <div className="mt-1 grid gap-1.5">
                    {chapter.items.map((item) => {
                      const Icon = iconMap[item.item_type];
                      const unlocked = chapterUnlocked;
                      const state = itemProgressState(item);
                      const active = activeItem.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => unlocked && setItemId(item.id)}
                          disabled={!unlocked}
                          className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
                            active
                              ? "bg-ink text-white"
                              : unlocked
                                ? "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                : "bg-slate-50 text-slate-400"
                          }`}
                        >
                          {unlocked ? <Icon size={16} className="shrink-0" /> : <Lock size={16} className="shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{item.title || "\u672a\u547d\u540d\u9879\u76ee"}</span>
                          {state === "completed" ? (
                            <CheckCircle2 size={16} className="shrink-0 text-mint" />
                          ) : state === "warning" ? (
                            <AlertTriangle size={16} className="shrink-0 text-coral" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
          {courseReviewItem ? (
            <section className="rounded-lg border border-amber-100 bg-amber-50/50 p-2">
              <button
                type="button"
                onClick={() => isCourseWorkCompleted() && setItemId(COURSE_REVIEW_ITEM_ID)}
                disabled={!isCourseWorkCompleted()}
                className={`focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
                  activeItem.id === COURSE_REVIEW_ITEM_ID
                    ? "bg-ink text-white"
                    : isCourseWorkCompleted()
                      ? "bg-white text-slate-700 hover:bg-amber-50"
                      : "bg-white/70 text-slate-400"
                }`}
              >
                {isCourseWorkCompleted() ? <Star size={16} className="shrink-0" /> : <Lock size={16} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{courseReviewItem.title}</span>
                {courseReview?.rating ? <CheckCircle2 size={16} className="shrink-0 text-mint" /> : null}
              </button>
            </section>
          ) : null}
        </div>
      </aside>

      <ResizeHandle active={resizingPanel === "sidebar"} label={"\u8c03\u6574\u7ae0\u8282\u76ee\u5f55\u5bbd\u5ea6"} onPointerDown={(event) => startResize("sidebar", event)} />

      <main
        className={`grid gap-5 xl:gap-0 ${
          notesOpen
            ? "xl:grid-cols-[minmax(0,1fr)_0.625rem_var(--learn-notes-width)]"
            : "xl:grid-cols-[minmax(0,1fr)_0.625rem_4.25rem]"
        }`}
      >
        <section className="panel rounded-lg p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-coral">{course.title}</p>
              <h1 className="mt-1 text-2xl font-bold text-ink">{activeItem.title || "\u672a\u547d\u540d\u9879\u76ee"}</h1>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
              {activeItem.item_type === "review" && courseReview?.rating ? (
                <>
                  <CheckCircle2 size={16} className="text-mint" />
                  <span>{"\u5df2\u63d0\u4ea4\u8bc4\u4ef7"}</span>
                </>
              ) : activeItem.item_type === "review" ? (
                <span>{"\u5f85\u8bc4\u4ef7"}</span>
              ) : isCourseCompleted ? (
                <>
                  <CheckCircle2 size={16} className="text-mint" />
                  <span>{"\u590d\u4e60\u6a21\u5f0f"}</span>
                </>
              ) : completedItemIds.has(activeItem.id) ? (
                <>
                  <CheckCircle2 size={16} className="text-mint" />
                  <span>{"\u5df2\u5b8c\u6210"}</span>
                </>
              ) : warningItemIds.has(activeItem.id) ? (
                <>
                  <AlertTriangle size={16} className="text-coral" />
                  <span>{"\u9700\u91cd\u65b0\u5c1d\u8bd5"}</span>
                </>
              ) : (
                <span>{"\u5b66\u4e60\u4e2d"}</span>
              )}
            </div>
          </div>
          {completionStatus ? <p className="mt-3 text-sm font-semibold text-slate-500">{completionStatus}</p> : null}

          {activeItem.item_type === "video" ? (
            <div className="mt-5 overflow-hidden rounded-lg bg-ink">
              {videoUrl ? (
                isDirectVideo ? (
                  <video
                    controls
                    src={videoUrl}
                    className="aspect-video w-full bg-ink"
                    onEnded={() => completeVideoItem(activeItem)}
                    onTimeUpdate={(event) => handleVideoTimeUpdate(event, activeItem)}
                  />
                ) : (
                  <iframe src={videoUrl} title={activeItem.title} className="aspect-video w-full" allowFullScreen />
                )
              ) : (
                <div className="grid aspect-video place-items-center text-sm font-bold text-white">
                  {"\u6682\u65e0\u89c6\u9891"}
                </div>
              )}
            </div>
          ) : null}

          {activeItem.item_type === "handout" ? <LessonHandout item={activeItem} /> : null}

          {activeItem.item_type === "review" ? (
            <CourseReviewPanel
              courseTitle={course.title}
              review={courseReview}
              status={courseReviewStatus}
              isLoading={courseReviewLoading}
              readOnly={false}
              onSubmit={async ({ rating, comment }) => {
                setCourseReviewStatus("\u6b63\u5728\u4fdd\u5b58\u8bfe\u7a0b\u8bc4\u4ef7...");
                const response = await fetch(`${API_BASE_URL}/learn/courses/${course.slug}/review`, {
                  method: "PUT",
                  headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({ enrollment_id: selectedEnrollment.id, rating, comment })
                });
                if (!response.ok) {
                  throw new Error("save course review failed");
                }
                const payload = (await response.json()) as CourseReview;
                setCourseReview(payload);
                setCourseReviewStatus("\u8bfe\u7a0b\u8bc4\u4ef7\u5df2\u4fdd\u5b58\uff0c\u611f\u8c22\u4f60\u7684\u53cd\u9988\u3002");
              }}
            />
          ) : null}

          {activeItem.item_type === "exercise" || activeItem.item_type === "quiz" ? (
            <QuestionSet
              key={activeItem.id}
              enrollmentId={selectedEnrollment.id}
              item={activeItem}
              questions={activeQuestions}
              isLoading={questionsLoading}
              status={activeQuestionStatus}
              onItemComplete={(score) => void completeLessonItem(activeItem, score)}
              onQuizComplete={() => {
                completedItemIdsRef.current = new Set(completedItemIdsRef.current).add(activeItem.id);
                setCompletedItemIds((current) => new Set(current).add(activeItem.id));
                setWarningItemIds((current) => {
                  const next = new Set(current);
                  next.delete(activeItem.id);
                  return next;
                });
                setCompletionStatus("\u6d4b\u9a8c\u5df2\u901a\u8fc7\uff0c\u540e\u7eed\u7ae0\u8282\u5df2\u89e3\u9501\u3002");
              }}
              onQuizWarning={() => {
                setWarningItemIds((current) => new Set(current).add(activeItem.id));
                setCompletionStatus("\u6d4b\u9a8c\u672a\u8fbe\u5230\u603b\u5206\u7684 80%\uff0c\u8bf7\u91cd\u65b0\u5c1d\u8bd5\u3002");
              }}
              onItemReset={() => {
                const nextCompletedIds = new Set(completedItemIdsRef.current);
                nextCompletedIds.delete(activeItem.id);
                completedItemIdsRef.current = nextCompletedIds;
                setCompletedItemIds((current) => {
                  const next = new Set(current);
                  next.delete(activeItem.id);
                  return next;
                });
                setWarningItemIds((current) => {
                  const next = new Set(current);
                  next.delete(activeItem.id);
                  return next;
                });
                setCompletionStatus("\u5df2\u6e05\u9664\u4e0a\u6b21\u7b54\u9898\u8bb0\u5f55\uff0c\u53ef\u4ee5\u91cd\u65b0\u5b8c\u6210\u8be5\u9879\u76ee\u3002");
              }}
              readOnly={isCourseCompleted}
            />
          ) : null}
        </section>

        <ResizeHandle
          active={resizingPanel === "notes"}
          disabled={!notesOpen}
          label={"\u8c03\u6574\u7b14\u8bb0\u680f\u5bbd\u5ea6"}
          onPointerDown={(event) => startResize("notes", event)}
          scope="xl"
        />

        <aside className={`panel min-w-0 rounded-lg ${notesOpen ? "flex min-h-[32rem] flex-col p-5" : "grid place-items-start p-3"}`}>
          <button
            type="button"
            onClick={() => setNotesOpen((current) => !current)}
            className={`focus-ring flex items-center rounded-lg text-sm font-bold text-ink ${
              notesOpen ? "w-full shrink-0 justify-between gap-3" : "h-11 w-11 justify-center border border-slate-200 bg-white"
            }`}
            aria-expanded={notesOpen}
            aria-label={notesOpen ? "\u6298\u53e0\u5b66\u4e60\u7b14\u8bb0" : "\u5c55\u5f00\u5b66\u4e60\u7b14\u8bb0"}
          >
            <span className="flex items-center gap-2">
              <NotebookPen size={18} />
              {notesOpen ? "\u672c\u7ae0\u7b14\u8bb0" : <span className="sr-only">{"\u672c\u7ae0\u7b14\u8bb0"}</span>}
            </span>
            {notesOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>

          {notesOpen ? (
            <>
              {activeChapter ? (
                <p className="mt-3 shrink-0 text-xs font-bold text-slate-400">{activeChapter.title}</p>
              ) : null}
              <div className="mt-3 grid min-h-0 flex-1" style={{ gridTemplateRows: activeChapter ? "minmax(13rem,var(--learn-note-editor-height)) 0.625rem minmax(11rem,1fr)" : "minmax(0,1fr)" }}>
                <div className="min-h-0 overflow-auto pr-1">
                  <StudentNotesEditor value={notesHtml} onChange={setNotesHtml} />
                  {notesStatus ? <p className="mt-3 text-sm font-semibold text-slate-500">{notesStatus}</p> : null}
                  <button
                    type="button"
                    onClick={() => void saveChapterNote()}
                    className="focus-ring mt-3 w-full rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white"
                  >
                    {"\u4fdd\u5b58\u672c\u7ae0\u7b14\u8bb0"}
                  </button>
                </div>
                {activeChapter ? (
                  <ResizeHandle
                    active={resizingPanel === "noteQuestion"}
                    direction="row"
                    label={"\u8c03\u6574\u7b14\u8bb0\u548c\u63d0\u95ee\u533a\u57df\u9ad8\u5ea6"}
                    onPointerDown={(event) => startResize("noteQuestion", event)}
                    scope="always"
                  />
                ) : null}
                {activeChapter ? (
                  <div className="min-h-0 overflow-auto pr-1">
                    <CommunityQuestionBox
                      compact
                      title={"\u672c\u7ae0\u63d0\u95ee"}
                      description={"\u95ee\u9898\u4f1a\u81ea\u52a8\u5173\u8054\u5230\u5f53\u524d\u8bfe\u7a0b\u548c\u7ae0\u8282\u3002"}
                      initialTitle={`${activeChapter.title} \u7684\u95ee\u9898`}
                      courseId={course.id}
                      chapterId={activeChapter.id}
                      tags={[course.title, activeChapter.title]}
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

function CourseReviewPanel({
  courseTitle,
  review,
  status,
  isLoading,
  readOnly,
  onSubmit
}: {
  courseTitle: string;
  review: CourseReview | null;
  status: string;
  isLoading: boolean;
  readOnly: boolean;
  onSubmit: (payload: { rating: number; comment: string }) => Promise<void>;
}) {
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [submitStatus, setSubmitStatus] = useState("");

  useEffect(() => {
    setRating(review?.rating ?? 0);
    setComment(review?.comment ?? "");
  }, [review?.comment, review?.rating]);

  async function handleSubmit() {
    if (readOnly || rating < 1) {
      return;
    }
    setSubmitStatus("");
    try {
      await onSubmit({ rating, comment });
    } catch {
      setSubmitStatus("\u8bc4\u4ef7\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-amber-100 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_52%,#f4fbf7_100%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
            <MessageSquareText size={14} />
            {"\u8bfe\u7a0b\u53cd\u9988"}
          </p>
          <h2 className="mt-3 text-2xl font-black text-ink">{"\u7ed9\u8fd9\u95e8\u8bfe\u7559\u4e0b\u8bc4\u5206\u548c\u8bc4\u8bed"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {"\u4f60\u7684\u8bc4\u4ef7\u4f1a\u5e2e\u52a9\u5176\u4ed6\u540c\u5b66\u66f4\u597d\u5730\u9009\u8bfe\uff0c\u4e5f\u4f1a\u5e2e\u52a9\u673a\u6784\u6301\u7eed\u4f18\u5316\u300a"}
            {courseTitle}
            {"\u300b\u3002"}
          </p>
        </div>
        {review?.rating ? (
          <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-black text-mint">{"\u5df2\u63d0\u4ea4"}</span>
        ) : null}
      </div>

      <div className="mt-6 rounded-lg border border-white bg-white/80 p-4 shadow-sm">
        <p className="text-sm font-black text-slate-600">{"\u8bfe\u7a0b\u8bc4\u5206"}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => !readOnly && setRating(value)}
              disabled={readOnly}
              className={`focus-ring grid h-11 w-11 place-items-center rounded-lg border text-lg transition ${
                value <= rating
                  ? "border-amber-200 bg-amber-100 text-amber-600"
                  : "border-slate-200 bg-white text-slate-300 hover:border-amber-200 hover:text-amber-500"
              }`}
              aria-label={`${value} \u661f`}
            >
              <Star size={22} fill={value <= rating ? "currentColor" : "none"} />
            </button>
          ))}
          <span className="ml-1 text-sm font-bold text-slate-500">
            {rating > 0 ? `${rating} / 5` : "\u8bf7\u9009\u62e9\u8bc4\u5206"}
          </span>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-black text-slate-600">{"\u8bc4\u8bed"}</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={readOnly}
          className="focus-ring mt-2 min-h-36 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-ink disabled:bg-slate-50"
          placeholder={"\u53ef\u4ee5\u5199\u5199\u4f60\u6700\u559c\u6b22\u7684\u90e8\u5206\u3001\u8bfe\u7a0b\u96be\u5ea6\u6216\u5efa\u8bae\u3002"}
          maxLength={2000}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{submitStatus || status}</p>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={readOnly || rating < 1 || isLoading}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Send size={16} />
          {review?.rating ? "\u66f4\u65b0\u8bc4\u4ef7" : "\u63d0\u4ea4\u8bc4\u4ef7"}
        </button>
      </div>
    </div>
  );
}

function ResizeHandle({
  active,
  disabled = false,
  direction = "column",
  label,
  onPointerDown,
  scope = "lg"
}: {
  active: boolean;
  disabled?: boolean;
  direction?: "column" | "row";
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  scope?: "always" | "lg" | "xl";
}) {
  const visibilityClass = scope === "always" ? "flex" : scope === "xl" ? "hidden xl:flex" : "hidden lg:flex";
  const directionClass =
    direction === "row"
      ? "h-2.5 w-full cursor-row-resize items-center justify-stretch"
      : "h-full min-h-0 w-2.5 cursor-col-resize items-stretch justify-center";
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={`${visibilityClass} ${directionClass} rounded-lg bg-transparent outline-none transition disabled:cursor-default disabled:opacity-30`}
      data-resizing={active ? "true" : undefined}
    />
  );
}

function getFileExtension(url: string) {
  const cleanUrl = url.split("?")[0]?.toLowerCase() ?? "";
  return cleanUrl.slice(cleanUrl.lastIndexOf(".") + 1);
}

function StudentNotesEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const hasContent = value.replace(/<[^>]*>/g, "").trim().length > 0;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) {
      return;
    }
    if (editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  function syncValue() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (editor.contains(container.nodeType === Node.TEXT_NODE ? container.parentElement : container)) {
      savedSelectionRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const range = savedSelectionRef.current;
    if (!range) {
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, commandValue);
    syncValue();
    saveSelection();
  }

  function applyHighlight(color: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    if (!document.execCommand("hiliteColor", false, color)) {
      document.execCommand("backColor", false, color);
    }
    syncValue();
    saveSelection();
  }

  const toolbarButtonClass =
    "focus-ring grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            {"\u5b57\u4f53"}
            <select
              className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
              defaultValue="Microsoft YaHei"
              onChange={(event) => runCommand("fontName", event.target.value)}
            >
              <option value="Microsoft YaHei">{"\u5fae\u8f6f\u96c5\u9ed1"}</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times</option>
              <option value="Courier New">Courier</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            {"\u5b57\u53f7"}
            <select
              className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
              defaultValue="3"
              onChange={(event) => runCommand("fontSize", event.target.value)}
            >
              <option value="2">{"\u5c0f"}</option>
              <option value="3">{"\u6b63\u6587"}</option>
              <option value="4">{"\u5927"}</option>
              <option value="5">{"\u6807\u9898"}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => runCommand("bold")} className={toolbarButtonClass} aria-label="\u7c97\u4f53">
            <Bold size={16} />
          </button>
          <button type="button" onClick={() => runCommand("italic")} className={toolbarButtonClass} aria-label="\u659c\u4f53">
            <Italic size={16} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("insertUnorderedList")}
            className={toolbarButtonClass}
            aria-label="\u9879\u76ee\u7b26\u53f7"
          >
            <List size={16} />
          </button>
          <label className={`${toolbarButtonClass} cursor-pointer`} title="\u6587\u5b57\u989c\u8272" onMouseDown={saveSelection}>
            <Palette size={16} />
            <input
              type="color"
              className="sr-only"
              defaultValue="#1f2937"
              onChange={(event) => runCommand("foreColor", event.target.value)}
            />
          </label>
          <label className={`${toolbarButtonClass} cursor-pointer`} title="\u9ad8\u4eae\u989c\u8272" onMouseDown={saveSelection}>
            <Highlighter size={16} />
            <input
              type="color"
              className="sr-only"
              defaultValue="#fef3c7"
              onChange={(event) => applyHighlight(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => runCommand("removeFormat")} className={toolbarButtonClass} aria-label="\u6e05\u9664\u683c\u5f0f">
            <Type size={16} />
          </button>
        </div>
      </div>
      <div className="relative">
        {!hasContent && !focused ? (
          <span className="pointer-events-none absolute left-3 top-3 text-sm font-semibold text-slate-400">
            {"\u8bb0\u5f55\u672c\u7ae0\u8bfe\u7684\u91cd\u70b9\u3001\u95ee\u9898\u548c\u4f5c\u4e1a\u60f3\u6cd5"}
          </span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            syncValue();
            saveSelection();
          }}
          onBlur={() => {
            setFocused(false);
            syncValue();
          }}
          onFocus={() => {
            setFocused(true);
            saveSelection();
          }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          className="focus-ring min-h-72 w-full overflow-y-auto rounded-b-lg bg-slate-50 px-3 py-3 text-sm leading-7 text-slate-700 outline-none [&_font]:leading-7 [&_li]:ml-5 [&_ul]:list-disc"
        />
      </div>
    </div>
  );
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) || url.startsWith("data:image/");
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url) || url.startsWith("data:application/pdf");
}

type HandoutPreviewPayload = {
  supported: boolean;
  kind: string;
  content: string;
  message: string;
};

function DocumentHandoutPreview({
  url,
  title,
  fileExtension
}: {
  url: string;
  title: string;
  fileExtension: string;
}) {
  const [preview, setPreview] = useState<HandoutPreviewPayload | null>(null);
  const [status, setStatus] = useState("\u6b63\u5728\u89e3\u6790\u8bb2\u4e49\u5185\u5bb9...");

  useEffect(() => {
    let ignore = false;
    fetch(`${API_BASE_URL}/learn/handouts/preview?url=${encodeURIComponent(url)}`, {
      headers: getStudentRequestHeaders(),
      cache: "no-store"
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("handout preview failed");
        }
        return response.json() as Promise<HandoutPreviewPayload>;
      })
      .then((payload) => {
        if (!ignore) {
          setPreview(payload);
          setStatus("");
        }
      })
      .catch(() => {
        if (!ignore) {
          setStatus("\u8bb2\u4e49\u5185\u5bb9\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      });
    return () => {
      ignore = true;
    };
  }, [url]);

  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-skysoft/20 text-xs font-black text-blue-700">
            {fileExtension || "DOC"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{title}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {"\u8bb2\u4e49\u5185\u5bb9\u5c06\u76f4\u63a5\u663e\u793a\u5728\u9875\u9762\u4e2d"}
            </p>
          </div>
        </div>
      </div>

      {status ? (
        <div className="p-5 text-sm font-semibold text-slate-500">{status}</div>
      ) : preview?.supported ? (
        <MarkdownHandout markdown={preview.content} embedded />
      ) : (
        <div className="p-5 text-sm font-semibold leading-7 text-slate-500">
          {preview?.message || "\u8be5\u8bb2\u4e49\u6682\u65f6\u65e0\u6cd5\u76f4\u63a5\u9884\u89c8\u3002"}
        </div>
      )}
    </div>
  );
}

function LessonHandout({ item }: { item: LessonItem }) {
  const rawUrl = getStringBodyValue(item.body, ["url", "file_url", "handout_url", "content_url"]);
  const url = resolveResourceUrl(item.content_url ?? rawUrl);
  const markdown = getStringBodyValue(item.body, ["markdown", "text", "content"]);
  const fileExtension = url ? getFileExtension(url).toUpperCase() : "";

  return (
    <article className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{"\u672c\u8bfe\u8bb2\u4e49"}</h2>
          <p className="mt-1 text-sm text-slate-500">{item.title}</p>
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            {"\u6253\u5f00\u539f\u6587\u4ef6"}
          </a>
        ) : null}
      </div>

      {url ? (
        isImageUrl(url) ? (
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <img src={url} alt={item.title} className="max-h-[72vh] w-full object-contain" />
          </div>
        ) : isPdfUrl(url) ? (
          <iframe
            src={url}
            title={item.title}
            className="mt-5 h-[72vh] w-full rounded-lg border border-slate-200 bg-white"
          />
        ) : (
          <DocumentHandoutPreview key={url} url={url} title={item.title} fileExtension={fileExtension} />
        )
      ) : markdown ? (
        <MarkdownHandout markdown={markdown} />
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          {"\u5f53\u524d\u8bb2\u4e49\u8fd8\u6ca1\u6709\u4e0a\u4f20\u56fe\u7247\u6216\u6587\u6863\u3002"}
        </div>
      )}
    </article>
  );
}

function getStringBodyValue(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; language: string; content: string }
  | { type: "math"; content: string }
  | { type: "table"; rows: string[][] }
  | { type: "rule" };

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownBlockStart(line: string, nextLine = "") {
  const trimmed = line.trim();
  return (
    !trimmed ||
    trimmed.startsWith("```") ||
    trimmed.startsWith("$$") ||
    trimmed.startsWith("\\[") ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
    (trimmed.includes("|") && isTableDivider(nextLine))
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const nextLine = lines[index + 1] ?? "";

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, content: codeLines.join("\n") });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const endMarker = trimmed.startsWith("$$") ? "$$" : "\\]";
      const mathLines: string[] = [];
      const firstContent = trimmed.replace(/^\$\$|^\\\[/, "").replace(/\$\$$|\\\]$/, "").trim();
      if (firstContent) {
        mathLines.push(firstContent);
      }
      index += 1;
      while (index < lines.length) {
        const mathLine = lines[index] ?? "";
        if (mathLine.trim().endsWith(endMarker)) {
          const lastContent = mathLine.trim().replace(/\$\$$|\\\]$/, "").trim();
          if (lastContent) {
            mathLines.push(lastContent);
          }
          index += 1;
          break;
        }
        mathLines.push(mathLine);
        index += 1;
      }
      blocks.push({ type: "math", content: mathLines.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (trimmed.includes("|") && isTableDivider(nextLine)) {
      const rows = [splitTableRow(trimmed)];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").trim().includes("|")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test((lines[index] ?? "").trim())) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    const listMatch = trimmed.match(/^(([-*+])|(\d+[.)]))\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[3]);
      const items: string[] = [];
      const itemPattern = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (index < lines.length) {
        const itemMatch = (lines[index] ?? "").trim().match(itemPattern);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [line.trimEnd()];
    index += 1;
    while (index < lines.length && !isMarkdownBlockStart(lines[index] ?? "", lines[index + 1] ?? "")) {
      paragraphLines.push((lines[index] ?? "").trimEnd());
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|\\\(.+?\\\)|\$[^$\n]+\$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-ink">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(token.slice(2, -2), `${key}-bold`)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{renderInlineMarkdown(token.slice(1, -1), `${key}-italic`)}</em>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch?.[2] ?? "#";
      const safeHref = /^(https?:|mailto:|\/)/i.test(href) ? href : "#";
      nodes.push(
        <a key={key} href={safeHref} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">
          {linkMatch?.[1] ?? token}
        </a>
      );
    } else if (token.startsWith("$")) {
      nodes.push(
        <span key={key} className="rounded bg-skysoft/30 px-1.5 py-0.5 font-serif text-ink">
          {token.slice(1, -1)}
        </span>
      );
    } else {
      nodes.push(
        <span key={key} className="rounded bg-skysoft/30 px-1.5 py-0.5 font-serif text-ink">
          {token.slice(2, -2)}
        </span>
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function renderInlineLines(lines: string[], keyPrefix: string) {
  return lines.flatMap((line, index) => [
    ...renderInlineMarkdown(line, `${keyPrefix}-${index}`),
    index < lines.length - 1 ? <br key={`${keyPrefix}-br-${index}`} /> : null
  ]);
}

function renderHeading(block: Extract<MarkdownBlock, { type: "heading" }>, index: number) {
  const content = renderInlineMarkdown(block.text, `heading-${index}`);
  if (block.level <= 1) {
    return <h2 className="text-2xl font-bold leading-tight text-ink">{content}</h2>;
  }
  if (block.level === 2) {
    return <h3 className="text-xl font-bold leading-tight text-ink">{content}</h3>;
  }
  if (block.level === 3) {
    return <h4 className="text-lg font-bold leading-tight text-ink">{content}</h4>;
  }
  return <h5 className="text-base font-bold leading-tight text-ink">{content}</h5>;
}

function MarkdownHandout({ markdown, embedded = false }: { markdown: string; embedded?: boolean }) {
  const blocks = parseMarkdownBlocks(markdown);
  if (blocks.length === 0) {
    return <MarkdownHandoutLegacy markdown={markdown} />;
  }

  return (
    <div className={embedded ? "p-5 text-slate-700" : "mt-5 rounded-lg border border-slate-200 bg-white p-5 text-slate-700"}>
      <div className="space-y-4">
        {blocks.map((block, index) => {
          if (block.type === "heading") {
            return <div key={index}>{renderHeading(block, index)}</div>;
          }
          if (block.type === "paragraph") {
            return (
              <p key={index} className="text-sm leading-7">
                {renderInlineLines(block.lines, `paragraph-${index}`)}
              </p>
            );
          }
          if (block.type === "list") {
            const items = block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInlineMarkdown(item, `list-${index}-${itemIndex}`)}</li>
            ));
            return block.ordered ? (
              <ol key={index} className="list-decimal pl-6 text-sm leading-7">
                {items}
              </ol>
            ) : (
              <ul key={index} className="list-disc pl-6 text-sm leading-7">
                {items}
              </ul>
            );
          }
          if (block.type === "quote") {
            return (
              <blockquote key={index} className="border-l-4 border-mint bg-mint/10 px-4 py-3 text-sm leading-7 text-slate-700">
                {renderInlineLines(block.lines, `quote-${index}`)}
              </blockquote>
            );
          }
          if (block.type === "code") {
            return (
              <div key={index} className="overflow-hidden rounded-lg border border-slate-200 bg-ink">
                {block.language ? (
                  <div className="border-b border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                    {block.language}
                  </div>
                ) : null}
                <pre className="overflow-x-auto p-4 text-sm leading-7 text-slate-100">
                  <code>{block.content}</code>
                </pre>
              </div>
            );
          }
          if (block.type === "math") {
            return (
              <pre key={index} className="overflow-x-auto rounded-lg border border-skysoft bg-skysoft/25 p-4 font-serif text-sm leading-7 text-ink">
                {block.content}
              </pre>
            );
          }
          if (block.type === "table") {
            const [header, ...rows] = block.rows;
            return (
              <div key={index} className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-ink">
                    <tr>
                      {header.map((cell, cellIndex) => (
                        <th key={cellIndex} className="border-b border-slate-200 px-3 py-2 font-bold">
                          {renderInlineMarkdown(cell, `table-head-${index}-${cellIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-slate-100 last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2 align-top leading-7">
                            {renderInlineMarkdown(cell, `table-cell-${index}-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return <hr key={index} className="border-slate-200" />;
        })}
      </div>
    </div>
  );
}

function MarkdownHandoutLegacy({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 text-slate-700">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          return <div key={index} className="h-3" />;
        }
        if (trimmedLine.startsWith("### ")) {
          return (
            <h4 key={index} className="mt-4 text-base font-bold text-ink first:mt-0">
              {trimmedLine.slice(4)}
            </h4>
          );
        }
        if (trimmedLine.startsWith("## ")) {
          return (
            <h3 key={index} className="mt-4 text-lg font-bold text-ink first:mt-0">
              {trimmedLine.slice(3)}
            </h3>
          );
        }
        if (trimmedLine.startsWith("# ")) {
          return (
            <h2 key={index} className="mt-4 text-xl font-bold text-ink first:mt-0">
              {trimmedLine.slice(2)}
            </h2>
          );
        }
        if (trimmedLine.startsWith("- ")) {
          return (
            <p key={index} className="ml-4 text-sm leading-7 before:mr-2 before:content-['鈥?]">
              {trimmedLine.slice(2)}
            </p>
          );
        }
        return (
          <p key={index} className="text-sm leading-7">
            {trimmedLine}
          </p>
        );
      })}
    </div>
  );
}

function getQuestionTitle(question: Question) {
  const title = question.content?.title;
  return typeof title === "string" && title.trim() ? title : `\u9898\u76ee ${question.id}`;
}

function sortedOptions(options: QuestionOption[]) {
  return [...options].sort((left, right) => left.position - right.position || left.label.localeCompare(right.label));
}

function getBlankLabels(question: Question) {
  const optionLabels = sortedOptions(question.options)
    .map((option) => option.label)
    .filter(Boolean);
  if (optionLabels.length) {
    return optionLabels;
  }
  const blankCount = Math.max(question.prompt.match(/_{2,}|\(\s*\)/g)?.length ?? 1, 1);
  const labels: string[] = [];
  for (let index = 0; index < blankCount; index += 1) {
    labels.push(`\u7a7a${index + 1}`);
  }
  return labels;
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

function answerFromSubmission(question: Question, answerPayload: Record<string, unknown>): QuestionAnswer | undefined {
  const answers = answerPayload.answers;
  const answer = answerPayload.answer;
  if ((question.type === "fill_blank" || question.type === "multiple_choice") && Array.isArray(answers)) {
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

function submissionResultText(submission: { score?: number | null }) {
  if (typeof submission.score === "number") {
    return submission.score > 0 ? "鍥炵瓟姝ｇ‘" : "鍥炵瓟閿欒";
  }
  return "绛夊緟鑰佸笀鎵规敼";
}

function QuestionSet({
  enrollmentId,
  item,
  questions,
  isLoading,
  status,
  onItemComplete,
  onQuizComplete,
  onQuizWarning,
  onItemReset,
  readOnly = false
}: {
  enrollmentId: number;
  item: LessonItem;
  questions: Question[];
  isLoading: boolean;
  status: string;
  onItemComplete: (score?: number) => void;
  onQuizComplete?: (score?: number) => void;
  onQuizWarning: () => void;
  onItemReset: () => void;
  readOnly?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, QuestionAnswer>>({});
  const [submittedScores, setSubmittedScores] = useState<Record<number, number | null>>({});
  const [submissionStatus, setSubmissionStatus] = useState<Record<number, string>>({});
  const [submissionState, setSubmissionState] = useState<ItemSubmissionState | null>(null);
  const [hasSubmissionHistory, setHasSubmissionHistory] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [quizSubmitStatus, setQuizSubmitStatus] = useState("");
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const questionKey = questions.map((question) => question.id).join(",");
  const hasSavedSubmissions = hasSubmissionHistory || Object.keys(submittedScores).length > 0;
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const quizScorePercent =
    submissionState && submissionState.total_score > 0
      ? Math.round((submissionState.score / submissionState.total_score) * 100)
      : 0;

  function updateAnswer(questionId: number, answer: QuestionAnswer) {
    if (readOnly) {
      return;
    }
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setSubmissionStatus((current) => ({ ...current, [questionId]: "" }));
    setSubmittedScores((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setSubmissionState(null);
    setHistoryStatus("");
    setQuizSubmitStatus("");
  }

  useEffect(() => {
    let ignore = false;
    async function loadSubmissionState() {
      setAnswers({});
      setSubmittedScores({});
      setSubmissionStatus({});
      setSubmissionState(null);
      setHasSubmissionHistory(false);
      setHistoryStatus("");
      setQuizSubmitStatus("");

      if (!questionKey) {
        return;
      }

      setHistoryLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/learn/items/${item.id}/submissions?enrollment_id=${enrollmentId}`,
          { headers: getStudentRequestHeaders(), cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("load submissions failed");
        }
        const payload = (await response.json()) as ItemSubmissionState;
        if (ignore) {
          return;
        }

        const nextAnswers: Record<number, QuestionAnswer> = {};
        const nextScores: Record<number, number | null> = {};
        const nextStatuses: Record<number, string> = {};
        payload.submissions.forEach((submission) => {
          const question = questionById.get(submission.question_id);
          if (!question) {
            return;
          }
          const restoredAnswer = answerFromSubmission(question, submission.answer);
          if (restoredAnswer !== undefined) {
            nextAnswers[question.id] = restoredAnswer;
          }
          nextScores[question.id] = submission.score ?? null;
          nextStatuses[question.id] = submissionResultText(submission);
        });

        setAnswers(nextAnswers);
        setSubmittedScores(nextScores);
        setSubmissionStatus(nextStatuses);
        setSubmissionState(payload.submissions.length ? payload : null);
        setHasSubmissionHistory(payload.submissions.length > 0);

        if (payload.submissions.length && item.item_type === "quiz") {
          const percent = payload.total_score > 0 ? Math.round((payload.score / payload.total_score) * 100) : 0;
          if (payload.pending_manual_count || payload.passed === null) {
            const pendingText = payload.pending_manual_count
              ? `${payload.pending_manual_count} \u9053\u9898`
              : "\u9898\u76ee";
            setQuizSubmitStatus(`\u6d4b\u9a8c\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u7b49\u5f85\u8001\u5e08\u6279\u6539 ${pendingText}\u3002`);
          } else {
            setQuizSubmitStatus(
              payload.passed
                ? `\u4e0a\u6b21\u6d4b\u9a8c\u5df2\u901a\u8fc7\uff1a${payload.score} / ${payload.total_score} \u5206\uff08${percent}%\uff09\u3002`
                : `\u4e0a\u6b21\u6d4b\u9a8c\u672a\u901a\u8fc7\uff1a${payload.score} / ${payload.total_score} \u5206\uff08${percent}%\uff09\u3002`
            );
          }
        } else if (payload.submissions.length) {
          setHistoryStatus("\u5df2\u6062\u590d\u4e0a\u6b21\u7ec3\u4e60\u7ed3\u679c\u3002");
        }
      } catch {
        if (!ignore) {
          setHistoryStatus("\u4e0a\u6b21\u7b54\u9898\u8bb0\u5f55\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
        }
      } finally {
        if (!ignore) {
          setHistoryLoading(false);
        }
      }
    }

    void loadSubmissionState();
    return () => {
      ignore = true;
    };
  }, [enrollmentId, item.id, item.item_type, questionById, questionKey]);

  useEffect(() => {
    if (item.item_type !== "quiz" || submissionState?.passed !== null || !hasSubmissionHistory) {
      return;
    }

    let ignore = false;
    async function pollManualGradingState() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/learn/items/${item.id}/submissions?enrollment_id=${enrollmentId}`,
          { headers: getStudentRequestHeaders(), cache: "no-store" }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ItemSubmissionState;
        if (ignore || !payload.submissions.length) {
          return;
        }

        const nextScores: Record<number, number | null> = {};
        const nextStatuses: Record<number, string> = {};
        payload.submissions.forEach((submission) => {
          const question = questionById.get(submission.question_id);
          if (!question) {
            return;
          }
          nextScores[question.id] = submission.score ?? null;
          nextStatuses[question.id] = submissionResultText(submission);
        });
        setSubmittedScores(nextScores);
        setSubmissionStatus(nextStatuses);
        setSubmissionState(payload);

        if (payload.pending_manual_count || payload.passed === null) {
          const pendingText = payload.pending_manual_count
            ? `${payload.pending_manual_count} \u9053\u9898`
            : "\u9898\u76ee";
          setQuizSubmitStatus(`\u6d4b\u9a8c\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u7b49\u5f85\u8001\u5e08\u6279\u6539 ${pendingText}\u3002`);
          return;
        }

        const percent = payload.total_score > 0 ? Math.round((payload.score / payload.total_score) * 100) : 0;
        setQuizSubmitStatus(
          payload.passed
            ? `\u8001\u5e08\u5df2\u5b8c\u6210\u6279\u6539\uff0c\u6d4b\u9a8c\u5df2\u901a\u8fc7\uff1a${payload.score} / ${payload.total_score} \u5206\uff08${percent}%\uff09\u3002`
            : `\u8001\u5e08\u5df2\u5b8c\u6210\u6279\u6539\uff0c\u6d4b\u9a8c\u672a\u901a\u8fc7\uff1a${payload.score} / ${payload.total_score} \u5206\uff08${percent}%\uff09\u3002`
        );
        if (payload.passed) {
          onQuizComplete?.(payload.score);
        } else {
          onQuizWarning();
        }
      } catch {
        // Keep the current pending state if the background refresh fails.
      }
    }

    void pollManualGradingState();
    const timer = window.setInterval(() => void pollManualGradingState(), 15000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [
    enrollmentId,
    hasSubmissionHistory,
    item.id,
    item.item_type,
    onQuizComplete,
    onQuizWarning,
    questionById,
    submissionState?.passed
  ]);

  function evaluateItemCompletion(nextScores: Record<number, number | null>) {
    const allQuestionsSubmitted = questions.length > 0 && questions.every((question) => question.id in nextScores);
    if (!allQuestionsSubmitted) {
      return;
    }
    if (item.item_type === "exercise") {
      onItemComplete();
      return;
    }
    const earnedScore = Object.values(nextScores).reduce<number>(
      (total, score) => total + (typeof score === "number" ? score : 0),
      0
    );
    const totalScore = questions.reduce((total, question) => total + Math.max(question.points || 0, 0), 0);
    if (totalScore > 0 && earnedScore / totalScore >= 0.8) {
      onItemComplete(earnedScore);
    } else {
      onQuizWarning();
    }
  }

  async function submitQuestion(question: Question) {
    if (readOnly) {
      setHistoryStatus("\u8bfe\u7a0b\u5df2\u5b8c\u6210\uff0c\u5f53\u524d\u4e3a\u590d\u4e60\u6a21\u5f0f\uff0c\u4e0d\u80fd\u91cd\u65b0\u63d0\u4ea4\u7ec3\u4e60\u3002");
      return;
    }
    const answer = answers[question.id];
    if (!hasAnswer(answer)) {
      setSubmissionStatus((current) => ({ ...current, [question.id]: "\u8bf7\u5148\u586b\u5199\u7b54\u6848\u3002" }));
      return;
    }
    setSubmissionStatus((current) => ({ ...current, [question.id]: "\u6b63\u5728\u63d0\u4ea4..." }));
    try {
      const response = await fetch(`${API_BASE_URL}/learn/questions/${question.id}/submit`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollment_id: enrollmentId,
          lesson_item_id: item.id,
          answer: toSubmissionAnswer(answer as QuestionAnswer)
        })
      });
      if (!response.ok) {
        throw new Error("submit failed");
      }
      const payload = (await response.json()) as { score?: number | null; status?: string };
      const resultText =
        typeof payload.score === "number"
          ? payload.score > 0
            ? "\u56de\u7b54\u6b63\u786e"
            : "\u56de\u7b54\u9519\u8bef"
          : "\u7b49\u5f85\u8001\u5e08\u6279\u6539";
      const nextScores = { ...submittedScores, [question.id]: payload.score ?? null };
      setSubmittedScores(nextScores);
      setSubmissionStatus((current) => ({ ...current, [question.id]: resultText }));
      setHasSubmissionHistory(true);
      setHistoryStatus("\u7b54\u6848\u5df2\u4fdd\u5b58\u3002");
      evaluateItemCompletion(nextScores);
    } catch {
      setSubmissionStatus((current) => ({
        ...current,
        [question.id]: "\u63d0\u4ea4\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002"
      }));
    }
  }

  async function submitQuizPaper() {
    if (readOnly) {
      setQuizSubmitStatus("\u8bfe\u7a0b\u5df2\u5b8c\u6210\uff0c\u5f53\u524d\u4e3a\u590d\u4e60\u6a21\u5f0f\uff0c\u4e0d\u80fd\u91cd\u65b0\u63d0\u4ea4\u6d4b\u9a8c\u3002");
      return;
    }
    const missingQuestions = questions.filter((question) => !hasAnswer(answers[question.id]));
    if (missingQuestions.length) {
      setSubmissionStatus((current) => {
        const nextStatus = { ...current };
        missingQuestions.forEach((question) => {
          nextStatus[question.id] = "\u8bf7\u5148\u586b\u5199\u7b54\u6848\u3002";
        });
        return nextStatus;
      });
      setQuizSubmitStatus(`\u8fd8\u6709 ${missingQuestions.length} \u9053\u9898\u672a\u4f5c\u7b54\uff0c\u8bf7\u5b8c\u6210\u540e\u518d\u63d0\u4ea4\u8bd5\u5377\u3002`);
      return;
    }

    setQuizSubmitting(true);
    setQuizSubmitStatus("\u6b63\u5728\u63d0\u4ea4\u8bd5\u5377...");

    try {
      const response = await fetch(`${API_BASE_URL}/learn/items/${item.id}/submit-quiz`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollment_id: enrollmentId,
          answers: questions.map((question) => ({
            question_id: question.id,
            answer: toSubmissionAnswer(answers[question.id] as QuestionAnswer)
          }))
        })
      });

      if (!response.ok) {
        throw new Error("submit failed");
      }

      const payload = (await response.json()) as {
        score?: number;
        total_score?: number;
        passed?: boolean | null;
        status?: string;
        pending_manual_count?: number;
        submissions?: SubmissionRecord[];
      };
      const nextScores: Record<number, number | null> = {};
      const nextStatuses: Record<number, string> = {};
      (payload.submissions ?? []).forEach((submission) => {
        nextScores[submission.question_id] = submission.score ?? null;
        nextStatuses[submission.question_id] =
          typeof submission.score === "number" ? (submission.score > 0 ? "鍥炵瓟姝ｇ‘" : "鍥炵瓟閿欒") : "绛夊緟鑰佸笀鎵规敼";
      });

      setSubmittedScores(nextScores);
      setSubmissionStatus((current) => ({ ...current, ...nextStatuses }));

      const earnedScore = Object.values(nextScores).reduce<number>(
        (total, score) => total + (typeof score === "number" ? score : 0),
        0
      );
      const totalScore = questions.reduce((total, question) => total + Math.max(question.points || 0, 0), 0);
      const pendingManualCount =
        typeof payload.pending_manual_count === "number"
          ? payload.pending_manual_count
          : (payload.submissions ?? []).filter((submission) => submission.status === "pending_manual").length;
      const passedByRatio = pendingManualCount === 0 && totalScore > 0 && earnedScore / totalScore >= 0.8;

      if (pendingManualCount > 0 || payload.status === "pending_manual" || payload.passed === null) {
        setQuizSubmitStatus(`\u6d4b\u9a8c\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u7b49\u5f85\u8001\u5e08\u6279\u6539 ${pendingManualCount || ""} \u9053\u9898\u3002`);
      } else if (payload.passed || passedByRatio) {
        setQuizSubmitStatus("\u6d4b\u9a8c\u5df2\u901a\u8fc7\uff0c\u540e\u7eed\u7ae0\u8282\u5df2\u89e3\u9501\u3002");
        onQuizComplete?.(earnedScore);
      } else {
        setQuizSubmitStatus("\u6d4b\u9a8c\u672a\u901a\u8fc7\uff0c\u9700\u8981\u8fbe\u5230\u603b\u5206\u7684 80% \u540e\u624d\u80fd\u7ee7\u7eed\u3002");
        onQuizWarning();
      }
      setSubmissionState({
        item_id: item.id,
        enrollment_id: enrollmentId,
        score: typeof payload.score === "number" ? payload.score : earnedScore,
        total_score: typeof payload.total_score === "number" ? payload.total_score : totalScore,
        passed: pendingManualCount > 0 || payload.passed === null ? null : Boolean(payload.passed || passedByRatio),
        pending_manual_count: pendingManualCount,
        completed_at: payload.passed || passedByRatio ? new Date().toISOString() : null,
        submissions: payload.submissions ?? []
      });
      setHasSubmissionHistory(true);
    } catch {
      setQuizSubmitStatus("\u8bd5\u5377\u63d0\u4ea4\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    } finally {
      setQuizSubmitting(false);
    }
  }

  async function resetSubmissions() {
    if (readOnly) {
      setHistoryStatus("\u8bfe\u7a0b\u5df2\u5b8c\u6210\uff0c\u5f53\u524d\u4e3a\u590d\u4e60\u6a21\u5f0f\uff0c\u4e0d\u80fd\u6e05\u9664\u7b54\u9898\u8bb0\u5f55\u3002");
      return;
    }
    setResetting(true);
    setHistoryStatus("");
    setQuizSubmitStatus("");
    try {
      const response = await fetch(`${API_BASE_URL}/learn/items/${item.id}/submissions?enrollment_id=${enrollmentId}`, {
        method: "DELETE",
        headers: getStudentRequestHeaders()
      });
      if (!response.ok) {
        throw new Error("reset failed");
      }
      setAnswers({});
      setSubmittedScores({});
      setSubmissionStatus({});
      setSubmissionState(null);
      setHasSubmissionHistory(false);
      setHistoryStatus(item.item_type === "quiz" ? "\u5df2\u6e05\u9664\u4e0a\u6b21\u6d4b\u9a8c\u7ed3\u679c\uff0c\u8bf7\u91cd\u65b0\u4f5c\u7b54\u3002" : "\u5df2\u6e05\u9664\u4e0a\u6b21\u7ec3\u4e60\u7ed3\u679c\uff0c\u8bf7\u91cd\u65b0\u4f5c\u7b54\u3002");
      onItemReset();
    } catch {
      setHistoryStatus("\u91cd\u505a\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="mt-5 grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{item.item_type === "quiz" ? "\u672c\u8bfe\u6d4b\u9a8c" : "\u8bfe\u4e0a\u7ec3\u4e60"}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {historyLoading ? <span className="text-xs font-bold text-slate-400">{"姝ｅ湪璇诲彇涓婃缁撴灉..."}</span> : null}
            {hasSavedSubmissions && !readOnly ? (
              <button
                type="button"
                onClick={() => void resetSubmissions()}
                disabled={resetting}
                className="focus-ring rounded-lg border border-coral/30 bg-white px-3 py-1.5 text-xs font-bold text-coral disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetting ? "娓呴櫎涓?.." : item.item_type === "quiz" ? "閲嶅仛娴嬮獙" : "閲嶆柊缁冧範"}
              </button>
            ) : null}
            <span className="rounded-full bg-mint/12 px-3 py-1 text-xs font-bold text-mint">
              {`${questions.length} \u9053\u9898`}
            </span>
          </div>
        </div>
        {historyStatus ? <p className="mt-3 text-sm font-semibold text-slate-500">{historyStatus}</p> : null}
        {readOnly ? (
          <p className="mt-3 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint">
            {"\u8bfe\u7a0b\u5df2\u5b8c\u6210\uff0c\u5f53\u524d\u4e3a\u590d\u4e60\u6a21\u5f0f\uff0c\u53ef\u4ee5\u67e5\u770b\u5185\u5bb9\u4f46\u4e0d\u80fd\u91cd\u65b0\u4f5c\u7b54\u3002"}
          </p>
        ) : null}
        {item.item_type === "quiz" && submissionState ? (
          <div
            className={`mt-3 rounded-lg border p-3 text-sm font-semibold ${
              submissionState.passed === null
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : submissionState.passed
                  ? "border-mint/30 bg-mint/10 text-mint"
                  : "border-coral/30 bg-coral/10 text-coral"
            }`}
          >
            {submissionState.passed === null
              ? `\u7b49\u5f85\u8001\u5e08\u6279\u6539${submissionState.pending_manual_count ? ` \u00b7 ${submissionState.pending_manual_count} \u9053\u9898` : ""} \u00b7 ${submissionState.score} / ${submissionState.total_score} \u5206`
              : `${submissionState.passed ? "\u6d4b\u9a8c\u5df2\u901a\u8fc7" : "\u6d4b\u9a8c\u672a\u901a\u8fc7"} \u00b7 ${submissionState.score} / ${submissionState.total_score} \u5206 \u00b7 ${quizScorePercent}%`}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
          {"\u6b63\u5728\u52a0\u8f7d\u9898\u76ee..."}
        </div>
      ) : status ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
          {status}
        </div>
      ) : (
        questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            index={index}
            question={question}
            answer={answers[question.id]}
            status={submissionStatus[question.id]}
            onChange={(answer) => updateAnswer(question.id, answer)}
            onSubmit={() => void submitQuestion(question)}
            showSubmitButton={item.item_type === "exercise" && !readOnly}
            readOnly={readOnly}
          />
        ))
      )}

      {!isLoading && !status && item.item_type === "quiz" && questions.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <p className="font-bold text-ink">{"\u6574\u5f20\u8bd5\u5377\u63d0\u4ea4"}</p>
            <p className="mt-1 text-sm text-slate-500">{"\u8fbe\u5230\u603b\u5206\u7684 80% \u540e\u901a\u8fc7\u6d4b\u9a8c\uff0c\u5e76\u89e3\u9501\u540e\u7eed\u7ae0\u8282\u3002"}</p>
            {quizSubmitStatus ? <p className="mt-2 text-sm font-semibold text-slate-500">{quizSubmitStatus}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void submitQuizPaper()}
            disabled={quizSubmitting || readOnly}
            className="focus-ring rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {readOnly ? "\u4ec5\u53ef\u590d\u4e60" : quizSubmitting ? "\u63d0\u4ea4\u4e2d..." : "\u63d0\u4ea4\u8bd5\u5377"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function QuestionCard({
  index,
  question,
  answer,
  status,
  onChange,
  onSubmit,
  showSubmitButton = true,
  readOnly = false
}: {
  index: number;
  question: Question;
  answer: QuestionAnswer | undefined;
  status?: string;
  onChange: (answer: QuestionAnswer) => void;
  onSubmit: () => void;
  showSubmitButton?: boolean;
  readOnly?: boolean;
}) {
  const [isHintVisible, setIsHintVisible] = useState(false);
  const hint = question.hint?.trim() ?? "";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-coral">
            {"\u7b2c"}{index + 1}{" \u9898 \u00b7 "}{questionTypeLabels[question.type] ?? question.type}
          </p>
          <h3 className="mt-1 text-lg font-bold text-ink">{getQuestionTitle(question)}</h3>
          <MathText className="mt-2 block whitespace-pre-wrap text-sm leading-7 text-slate-700">{question.prompt}</MathText>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{question.difficulty || "\u672a\u5206\u7ea7"}</span>
          <span className="rounded-full bg-skysoft/20 px-2.5 py-1 text-blue-700">{question.points}{" \u5206"}</span>
        </div>
      </div>

      <QuestionMediaList mediaAssets={question.media_assets} />
      <QuestionAnswerInput question={question} answer={answer} onChange={onChange} disabled={readOnly} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <QuestionSubmissionStatus status={status} />
        {hint || showSubmitButton ? (
          <div className="flex flex-wrap items-center gap-2">
            {hint ? (
              <button
                type="button"
                onClick={() => setIsHintVisible((current) => !current)}
                className="focus-ring rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-bold text-mint"
              >
                {isHintVisible ? "\u6536\u8d77\u63d0\u793a" : "\u67e5\u770b\u63d0\u793a"}
              </button>
            ) : null}
            {showSubmitButton ? (
              <button
                type="button"
                onClick={onSubmit}
                className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white"
              >
                鎻愪氦绛旀
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {hint && isHintVisible ? (
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-mint/30 bg-mint/10 p-4 text-sm leading-7 text-slate-700">
          <MathText>{hint}</MathText>
        </div>
      ) : null}
    </article>
  );
}

function QuestionSubmissionStatus({ status }: { status?: string }) {
  if (!status) {
    return <p className="text-sm font-semibold text-slate-500" />;
  }
  if (status === "鍥炵瓟姝ｇ‘") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-mint">
        <CheckCircle2 size={16} />
        {status}
      </p>
    );
  }
  if (status === "鍥炵瓟閿欒") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-coral">
        <AlertTriangle size={16} />
        {status}
      </p>
    );
  }
  return <p className="text-sm font-semibold text-slate-500">{status}</p>;
}

function CodeRunResultPanel({ result }: { result: CodeRunResult }) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-[#0b1220] p-3 text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 font-bold ${result.passed ? "text-mint" : "text-coral"}`}>
          {result.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {result.passed ? "\u6d4b\u8bd5\u901a\u8fc7" : "\u6d4b\u8bd5\u672a\u901a\u8fc7"}
        </span>
        <span className="text-slate-400">{result.duration_ms}ms</span>
      </div>
      {result.error ? (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-coral/10 p-2 font-mono text-coral">{result.error}</pre>
      ) : null}
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
                {test.passed ? "\u901a\u8fc7" : "\u672a\u901a\u8fc7"} 路 {test.test}
              </p>
              {test.message ? <p className="mt-1 text-slate-300">{test.message}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuestionMediaList({ mediaAssets }: { mediaAssets: QuestionMedia[] }) {
  const sortedMedia = [...mediaAssets].sort((left, right) => left.position - right.position);
  if (!sortedMedia.length) {
    return null;
  }
  return (
    <div className="mt-4 grid gap-3">
      {sortedMedia.map((media) => (
        <QuestionMediaPreview key={media.id} media={media} />
      ))}
    </div>
  );
}

function QuestionMediaPreview({ media }: { media: QuestionMedia }) {
  const url = resolveResourceUrl(media.url);

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
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-coral">
          鎵撳紑绱犳潗
        </a>
      )}
    </div>
  );
}

function QuestionAnswerInput({
  question,
  answer,
  onChange,
  disabled = false
}: {
  question: Question;
  answer: QuestionAnswer | undefined;
  onChange: (answer: QuestionAnswer) => void;
  disabled?: boolean;
}) {
  const options = sortedOptions(question.options);
  const [codeRunResult, setCodeRunResult] = useState<CodeRunResult | null>(null);
  const [codeRunStatus, setCodeRunStatus] = useState("");
  const [codeRunning, setCodeRunning] = useState(false);

  async function runQuestionCode(code: string) {
    if (disabled) {
      return;
    }
    if (!code.trim()) {
      setCodeRunResult(null);
      setCodeRunStatus("\u8bf7\u5148\u7f16\u5199\u4ee3\u7801\u3002");
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
          <label key={option.id} className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.label}
              checked={answer === option.label}
              disabled={disabled}
              onChange={() => onChange(option.label)}
              className="mt-1"
            />
            <span>
              <span className="font-bold text-ink">{option.label}.</span> <MathText>{option.text}</MathText>
            </span>
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
            <label key={option.id} className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    checked
                      ? selectedAnswers.filter((item) => item !== option.label)
                      : [...selectedAnswers, option.label]
                  )
                }
                className="mt-1"
              />
              <span>
                <span className="font-bold text-ink">{option.label}.</span> <MathText>{option.text}</MathText>
              </span>
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
            <input
              className="focus-ring rounded-lg border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              value={values[index] ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const nextValues = [...values];
                nextValues[index] = event.target.value;
                onChange(nextValues);
              }}
              placeholder="\u586b\u5199\u7b54\u6848"
            />
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "true_false") {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: "姝ｇ‘", value: true },
          { label: "閿欒", value: false }
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.value)}
            className={`focus-ring rounded-lg border px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${
              answer === item.value
                ? "border-mint bg-mint text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "coding") {
    const starterCode =
      typeof question.content?.starter_code === "string" ? question.content.starter_code : "";
    const value = typeof answer === "string" ? answer : starterCode;
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-[#111827] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-skysoft">
          <Code2 size={16} />
          {"\u5728\u7ebf\u4ee3\u7801\u7f16\u8f91"}
        </div>
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="h-72 w-full resize-y rounded-lg border border-white/10 bg-[#0b1220] p-3 font-mono text-sm leading-6 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-70"
          placeholder="\u5728\u8fd9\u91cc\u7f16\u5199\u6216\u4fee\u6539\u4ee3\u7801"
        />
        <button type="button" onClick={() => void runQuestionCode(value)} disabled={disabled || codeRunning || !value.trim()} className="focus-ring mt-3 rounded-lg bg-mint px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500">
          {"\u8fd0\u884c\u4ee3\u7801"}
        </button>
        {codeRunStatus ? <p className="mt-3 text-sm font-semibold text-slate-200">{codeRunStatus}</p> : null}
        {codeRunResult ? <CodeRunResultPanel result={codeRunResult} /> : null}
      </div>
    );
  }

  if (question.type === "pronunciation" || question.type === "media_upload") {
    const accept = question.type === "pronunciation" ? "audio/*" : "image/*,video/*,audio/*";
    const currentFile = typeof answer === "object" && !Array.isArray(answer) ? answer : null;
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
        <label className={`focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
          <Upload size={16} />
          {question.type === "pronunciation" ? "\u4e0a\u4f20\u53e3\u8bed\u97f3\u9891" : "\u4e0a\u4f20\u56fe\u7247\u3001\u97f3\u9891\u6216\u89c6\u9891"}
          <input
            type="file"
            accept={accept}
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onChange({ fileName: file.name, fileType: file.type });
              }
            }}
          />
        </label>
        {currentFile ? (
          <p className="mt-3 text-sm font-semibold text-slate-600">{"\u5df2\u9009\u62e9\uff1a"}{currentFile.fileName}</p>
        ) : null}
      </div>
    );
  }

  return (
    <textarea
      value={typeof answer === "string" ? answer : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="focus-ring mt-4 h-44 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      placeholder={
        question.type === "listening"
          ? "\u542c\u5b8c\u7d20\u6750\u540e\u5728\u8fd9\u91cc\u4f5c\u7b54"
          : question.type === "reading"
            ? "\u9605\u8bfb\u6750\u6599\u540e\u5728\u8fd9\u91cc\u4f5c\u7b54"
            : "\u8bf7\u8f93\u5165\u4f60\u7684\u7b54\u6848"
      }
    />
  );
}

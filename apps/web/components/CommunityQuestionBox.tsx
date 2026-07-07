"use client";

import { HelpCircle, Send } from "lucide-react";
import { useState } from "react";

import { getStudentRequestHeaders } from "@/lib/student-session";
import type { CommunityQuestion } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type CommunityQuestionBoxProps = {
  title?: string;
  description?: string;
  initialTitle?: string;
  placeholder?: string;
  courseId?: number | null;
  chapterId?: number | null;
  linkedQuestionId?: number | null;
  tags?: string[];
  compact?: boolean;
  onCreated?: (question: CommunityQuestion) => void;
};

export function CommunityQuestionBox({
  title = "\u63d0\u4e2a\u95ee\u9898",
  description = "\u95ee\u9898\u4f1a\u81ea\u52a8\u53d1\u5e03\u5230\u5b66\u4e60\u793e\u533a\uff0c\u4e5f\u4f1a\u4fdd\u7559\u8bfe\u7a0b\u6216\u9898\u76ee\u5173\u8054\u3002",
  initialTitle = "",
  placeholder = "\u628a\u4f60\u5361\u4f4f\u7684\u5730\u65b9\u3001\u5df2\u7ecf\u5c1d\u8bd5\u8fc7\u7684\u601d\u8def\u5199\u6e05\u695a\u3002",
  courseId = null,
  chapterId = null,
  linkedQuestionId = null,
  tags = [],
  compact = false,
  onCreated
}: CommunityQuestionBoxProps) {
  const [questionTitle, setQuestionTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  async function submitQuestion() {
    const normalizedTitle = questionTitle.trim() || initialTitle.trim();
    const normalizedBody = body.trim();
    if (!normalizedTitle || !normalizedBody) {
      setStatus("\u8bf7\u5148\u586b\u5199\u95ee\u9898\u6807\u9898\u548c\u95ee\u9898\u5185\u5bb9\u3002");
      return;
    }
    setIsPosting(true);
    setStatus("\u6b63\u5728\u53d1\u5e03\u5230\u5b66\u4e60\u793e\u533a...");
    try {
      const response = await fetch(`${API_BASE_URL}/learn/community/questions`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          body: normalizedBody,
          course_id: courseId,
          chapter_id: chapterId,
          linked_question_id: linkedQuestionId,
          tags
        })
      });
      if (!response.ok) {
        throw new Error("question failed");
      }
      const created = (await response.json()) as CommunityQuestion;
      setQuestionTitle(initialTitle);
      setBody("");
      setStatus("\u95ee\u9898\u5df2\u53d1\u5e03\u5230\u5b66\u4e60\u793e\u533a\u3002");
      onCreated?.(created);
    } catch {
      setStatus("\u95ee\u9898\u53d1\u5e03\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002");
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <section className={`rounded-lg border border-mint/25 bg-gradient-to-br from-mint/10 via-white to-coral/10 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-mint shadow-sm">
          <HelpCircle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-ink">{title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <input
          value={questionTitle}
          onChange={(event) => setQuestionTitle(event.target.value)}
          className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none"
          placeholder={"\u95ee\u9898\u6807\u9898"}
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={compact ? 2 : 3}
          className="focus-ring w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none"
          placeholder={placeholder}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-h-5 text-xs font-semibold text-slate-500">{status}</p>
          <button
            type="button"
            onClick={() => void submitQuestion()}
            disabled={isPosting || !body.trim()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send size={14} />
            {isPosting ? "\u53d1\u5e03\u4e2d..." : "\u53d1\u5e03\u95ee\u9898"}
          </button>
        </div>
      </div>
    </section>
  );
}

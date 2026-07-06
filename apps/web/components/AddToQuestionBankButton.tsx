"use client";

import { Check, Plus } from "lucide-react";
import { MouseEvent, useSyncExternalStore } from "react";

const STORAGE_KEY = "infuture-saved-question-bank-items";
const CHANGE_EVENT = "infuture-saved-question-bank-change";

type SavedQuestion = {
  id: number;
  title: string;
  savedAt: string;
};

function readSavedQuestions(): SavedQuestion[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedQuestion[]) : [];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void) {
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

export function AddToQuestionBankButton({ questionId, title }: { questionId: number; title: string }) {
  const isSaved = useSyncExternalStore(
    subscribe,
    () => readSavedQuestions().some((question) => question.id === questionId),
    () => false
  );

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const savedQuestions = readSavedQuestions();
    if (!savedQuestions.some((question) => question.id === questionId)) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: questionId, title, savedAt: new Date().toISOString() }, ...savedQuestions])
      );
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        isSaved
          ? "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-mint/10 px-3 py-1.5 text-xs font-bold text-mint"
          : "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-coral hover:text-coral"
      }
    >
      {isSaved ? <Check size={14} /> : <Plus size={14} />}
      {isSaved ? "\u5df2\u6dfb\u52a0" : "\u6dfb\u52a0\u5230\u6211\u7684\u9898\u5e93"}
    </button>
  );
}

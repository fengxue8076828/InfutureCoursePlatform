"use client";

import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Heart,
  HelpCircle,
  MessageCircle,
  MessageSquareReply,
  NotebookText,
  Tag,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getStudentRequestHeaders } from "@/lib/student-session";
import type { CommunityAnswer, CommunityNoteShare, CommunityQuestion, StudentPost, StudentPostComment } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type ActivityTabKey = "posts" | "questions" | "answers" | "notes";

const tabs: Array<{ key: ActivityTabKey; label: string; icon: LucideIcon }> = [
  { key: "posts", label: "学习心得", icon: BookOpenText },
  { key: "questions", label: "我的问题", icon: HelpCircle },
  { key: "answers", label: "我回答的问题", icon: MessageSquareReply },
  { key: "notes", label: "我的笔记", icon: NotebookText }
];

function formatDate(value?: string | null) {
  if (!value) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function isLearningThoughtPost(post: StudentPost) {
  const content = post.content.trim();
  return !(
    content.startsWith("我发布了一个问题：") ||
    content.startsWith("我回答了一个问题：") ||
    content.startsWith("我关注了一篇社区笔记：") ||
    content.includes(" 回答了你的问题：")
  );
}

function PostImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return <img src={images[0]} alt="学习心得图片" className="mt-3 max-h-[28rem] w-full rounded-lg object-cover" />;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {images.slice(0, 9).map((url, index) => (
        <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-lg bg-slate-50">
          <img src={url} alt={`学习心得图片 ${index + 1}`} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{text}</p>;
}

function MetaLine({ question }: { question: CommunityQuestion }) {
  const parts = [
    question.course_title,
    question.chapter_title,
    question.linked_question_title ? `关联题目：${question.linked_question_title}` : ""
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="mt-2 line-clamp-1 text-xs font-semibold text-slate-500">{parts.join(" · ")}</p>;
}

function QuestionTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.slice(0, 5).map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2.5 py-1 text-xs font-bold text-mint">
          <Tag size={12} /> {tag}
        </span>
      ))}
    </div>
  );
}

function PostCommentRow({ comment }: { comment: StudentPostComment }) {
  const initials = comment.student_name.slice(0, 1).toUpperCase();
  return (
    <div className="flex gap-2 rounded-lg bg-slate-50 p-3">
      {comment.avatar_url ? (
        <img src={comment.avatar_url} alt={comment.student_name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint/10 text-xs font-black text-mint">{initials}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black text-ink">{comment.student_name}</p>
          <p className="text-[11px] font-semibold text-slate-400">{formatDate(comment.created_at)}</p>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p>
      </div>
    </div>
  );
}

function PostCard({
  post,
  commentDraft,
  onCommentDraftChange,
  onSubmitComment,
  onLike
}: {
  post: StudentPost;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: () => void;
  onLike: () => void;
}) {
  const comments = post.comments ?? [];
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">
          {formatDate(post.created_at)}
          {post.course_title ? ` · ${post.course_title}` : ""}
        </p>
        <span className="rounded-full bg-coral/10 px-2.5 py-1 text-xs font-black text-coral">心得</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p>
      <PostImageGrid images={post.image_urls ?? []} />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
        <button
          type="button"
          onClick={onLike}
          className={`focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${post.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 hover:text-coral"}`}
          aria-label="点赞学习心得"
        >
          <Heart size={14} fill={post.liked_by_me ? "currentColor" : "none"} />
          {post.likes_count ?? 0}
        </button>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={14} />
          {post.comments_count ?? comments.length}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {comments.map((comment) => (
          <PostCommentRow key={comment.id} comment={comment} />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          value={commentDraft}
          onChange={(event) => onCommentDraftChange(event.target.value)}
          placeholder="写下你的评论..."
          rows={2}
          className="focus-ring min-h-16 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={onSubmitComment}
          disabled={!commentDraft.trim()}
          className="focus-ring h-fit rounded-lg bg-ink px-4 py-2 text-sm font-black text-white transition hover:bg-coral disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          发布评论
        </button>
      </div>
    </article>
  );
}

function AnswerRow({ answer, onLike, compact = false }: { answer: CommunityAnswer; onLike: (answer: CommunityAnswer) => void; compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-lg bg-white p-3 text-sm leading-7 text-slate-700 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400">{formatDate(answer.created_at)}</p>
            <p className="mt-2 whitespace-pre-wrap">{answer.body}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-coral/10 px-3 py-2 text-sm font-black text-coral">
            <Heart size={15} fill="currentColor" />
            {answer.likes_count}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-3 text-sm leading-7 text-slate-700 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-ink">{answer.student_name}</p>
            {answer.student_level ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-xs font-black text-mint">
                <span>{answer.student_level.icon}</span>
                {answer.student_level.name}
              </span>
            ) : null}
            <Link href={`/leaderboard/${answer.user_id}`} className="focus-ring rounded-full bg-slate-50 px-2 py-0.5 text-xs font-black text-slate-500 hover:text-coral">
              查看主页
            </Link>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{answer.body}</p>
        </div>
        <button
          type="button"
          onClick={() => onLike(answer)}
          className={`focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-black transition ${answer.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 text-slate-500 hover:text-coral"}`}
          aria-label="点赞回答"
        >
          <Heart size={15} fill={answer.liked_by_me ? "currentColor" : "none"} />
          {answer.likes_count}
        </button>
      </div>
    </div>
  );
}

function QuestionCard({ question, answerOwnerId, onLikeAnswer }: { question: CommunityQuestion; answerOwnerId?: number; onLikeAnswer: (answer: CommunityAnswer) => void }) {
  const ownedAnswers = useMemo(
    () => (answerOwnerId ? question.answers.filter((answer) => answer.user_id === answerOwnerId) : []),
    [answerOwnerId, question.answers]
  );
  const receivedAnswers = useMemo(
    () => (answerOwnerId ? [] : question.answers.filter((answer) => answer.user_id !== question.user_id)),
    [answerOwnerId, question.answers, question.user_id]
  );
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black text-ink">{question.title}</h3>
          <MetaLine question={question} />
        </div>
        <div className="flex shrink-0 gap-2">
          {question.is_resolved ? <span className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2.5 py-1 text-xs font-black text-mint"><CheckCircle2 size={13} />已解决</span> : null}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{question.answers_count} 个回答</span>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{question.body}</p>
      <QuestionTags tags={question.tags} />
      {!answerOwnerId ? (
        <details className="group mt-4 rounded-lg border border-slate-100 bg-slate-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-black text-slate-600 transition hover:text-ink">
            <span className="inline-flex items-center gap-2">
              <MessageCircle size={15} className="text-mint" />
              查看回答
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{receivedAnswers.length}</span>
            </span>
            <ChevronDown size={16} className="transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-2 border-t border-slate-100 p-3">
            {receivedAnswers.length ? receivedAnswers.map((answer) => (
              <AnswerRow key={answer.id} answer={answer} onLike={onLikeAnswer} />
            )) : <p className="rounded-lg bg-white p-3 text-sm font-semibold text-slate-500">还没有同学回答这个问题。</p>}
          </div>
        </details>
      ) : null}
      {ownedAnswers.length ? (
        <div className="mt-4 grid gap-2 rounded-lg bg-mint/5 p-3">
          <p className="text-xs font-black text-mint">我的回答</p>
          {ownedAnswers.map((answer) => (
            <AnswerRow key={answer.id} answer={answer} onLike={onLikeAnswer} compact />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function NoteCard({ note }: { note: CommunityNoteShare }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-ink">{note.title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {formatDate(note.created_at)}
            {note.course_title ? ` · ${note.course_title}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2.5 py-1 text-xs font-black text-coral"><Heart size={13} />{note.likes_count}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{note.content}</p>
    </article>
  );
}

export function StudentProfileActivityTabs({
  studentId,
  posts,
  questions,
  answeredQuestions,
  notes,
  postComposer,
  questionComposer,
  showNotesTab = true
}: {
  studentId: number;
  posts: StudentPost[];
  questions: CommunityQuestion[];
  answeredQuestions: CommunityQuestion[];
  notes: CommunityNoteShare[];
  postComposer?: ReactNode;
  questionComposer?: ReactNode;
  showNotesTab?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<ActivityTabKey>("posts");
  const [answerReactions, setAnswerReactions] = useState<Record<number, { liked_by_me: boolean; likes_count: number }>>({});
  const [postReactions, setPostReactions] = useState<Record<number, { liked_by_me: boolean; likes_count: number }>>({});
  const [postComments, setPostComments] = useState<Record<number, StudentPostComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const learningPosts = useMemo(
    () =>
      posts.filter(isLearningThoughtPost).map((post) => {
        const reaction = postReactions[post.id];
        const comments = postComments[post.id] ?? post.comments ?? [];
        return {
          ...post,
          liked_by_me: reaction?.liked_by_me ?? post.liked_by_me ?? false,
          likes_count: reaction?.likes_count ?? post.likes_count ?? 0,
          comments,
          comments_count: comments.length
        };
      }),
    [posts, postReactions, postComments]
  );
  const applyAnswerReactions = (question: CommunityQuestion): CommunityQuestion => ({
    ...question,
    answers: question.answers.map((answer) => answerReactions[answer.id] ? { ...answer, ...answerReactions[answer.id] } : answer)
  });
  const displayQuestions = useMemo(
    () => questions.map(applyAnswerReactions),
    [questions, answerReactions]
  );
  const displayAnsweredQuestions = useMemo(
    () => answeredQuestions.map(applyAnswerReactions),
    [answeredQuestions, answerReactions]
  );
  const counts: Record<ActivityTabKey, number> = {
    posts: learningPosts.length,
    questions: displayQuestions.length,
    answers: displayAnsweredQuestions.length,
    notes: notes.length
  };
  const visibleTabs = useMemo(() => tabs.filter((tab) => showNotesTab || tab.key !== "notes"), [showNotesTab]);

  async function toggleAnswerLike(answer: CommunityAnswer) {
    try {
      const response = await fetch(`${API_BASE_URL}/learn/community/answers/${answer.id}/like`, {
        method: "POST",
        headers: getStudentRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { liked: boolean; likes_count: number };
      setAnswerReactions((current) => ({
        ...current,
        [answer.id]: { liked_by_me: payload.liked, likes_count: payload.likes_count }
      }));
    } catch {
      // Keep the current UI state when the viewer is not logged in or the API is unavailable.
    }
  }

  async function togglePostLike(post: StudentPost) {
    try {
      const response = await fetch(`${API_BASE_URL}/learn/posts/${post.id}/like`, {
        method: "POST",
        headers: getStudentRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { liked: boolean; likes_count: number };
      setPostReactions((current) => ({
        ...current,
        [post.id]: { liked_by_me: payload.liked, likes_count: payload.likes_count }
      }));
    } catch {
      // Keep the current UI state when the viewer is not logged in or the API is unavailable.
    }
  }

  async function submitPostComment(post: StudentPost) {
    const body = (commentDrafts[post.id] ?? "").trim();
    if (!body) return;
    try {
      const response = await fetch(`${API_BASE_URL}/learn/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getStudentRequestHeaders()
        },
        body: JSON.stringify({ body }),
        cache: "no-store"
      });
      if (!response.ok) return;
      const comment = (await response.json()) as StudentPostComment;
      setPostComments((current) => ({
        ...current,
        [post.id]: [...(current[post.id] ?? post.comments ?? []), comment]
      }));
      setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
    } catch {
      // Keep the draft in place if the comment cannot be submitted.
    }
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-coral">Activity</p>
          <h2 className="mt-1 text-lg font-black text-ink">学习动态</h2>
        </div>
        <div className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${active ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-ink"}`}
              >
                <Icon size={15} />
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-white/15 text-white" : "bg-white text-slate-500"}`}>{counts[tab.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3">
        {activeTab === "posts" ? (
          <>
            {postComposer}
            {learningPosts.length ? learningPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                commentDraft={commentDrafts[post.id] ?? ""}
                onCommentDraftChange={(value) => setCommentDrafts((current) => ({ ...current, [post.id]: value }))}
                onSubmitComment={() => void submitPostComment(post)}
                onLike={() => void togglePostLike(post)}
              />
            )) : <EmptyPanel text="这里还没有公开学习心得。" />}
          </>
        ) : activeTab === "questions" ? (
          <>
            {questionComposer}
            {displayQuestions.length ? displayQuestions.map((question) => <QuestionCard key={question.id} question={question} onLikeAnswer={(answer) => void toggleAnswerLike(answer)} />) : <EmptyPanel text="这里还没有发布问题。" />}
          </>
        ) : activeTab === "answers" ? (
          displayAnsweredQuestions.length ? displayAnsweredQuestions.map((question) => <QuestionCard key={question.id} question={question} answerOwnerId={studentId} onLikeAnswer={(answer) => void toggleAnswerLike(answer)} />) : <EmptyPanel text="这里还没有回答过问题。" />
        ) : notes.length ? (
          notes.map((note) => <NoteCard key={note.id} note={note} />)
        ) : (
          <EmptyPanel text="这里还没有分享公开笔记。" />
        )}
      </div>
    </section>
  );
}

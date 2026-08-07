"use client";

import { API_BASE_URL } from "@/lib/api-config";
import { reorderByRecommendation, useRecommendationFeed } from "@/lib/recommendations";

import {
  ArrowRight,
  ChevronDown,
  Heart,
  HelpCircle,
  Loader2,
  MessageCircle,
  NotebookPen,
  Search,
  Send,
  Sparkles,
  Users
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { Header } from "@/components/Header";
import {
  getStudentRequestHeaders,
  getStudentSessionServerSnapshot,
  getStudentSessionUser,
  subscribeToStudentSession
} from "@/lib/student-session";
import type { CommunityAnswer, CommunityHome, CommunityNoteShare, CommunityQuestion, StudentProfileSummary } from "@/lib/types";


function formatDate(value?: string | null) {
  if (!value) return "刚刚";
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "刚刚";
  }
}

function initials(name?: string | null) {
  return name?.trim().slice(0, 1).toUpperCase() || "学";
}

function Avatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const className = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (avatarUrl) return <img src={avatarUrl} alt={name} className={`${className} rounded-lg object-cover`} />;
  return <span className={`${className} grid place-items-center rounded-lg bg-slate-100 text-sm font-black text-slate-500`}>{initials(name)}</span>;
}

function updateQuestionCollections(home: CommunityHome | null, updater: (question: CommunityQuestion) => CommunityQuestion) {
  if (!home) return home;
  return {
    ...home,
    questions: home.questions.map(updater),
    recommended_questions: home.recommended_questions?.map(updater) ?? home.recommended_questions
  };
}

export function CommunityPage() {
  const studentSession = useSyncExternalStore(subscribeToStudentSession, getStudentSessionUser, getStudentSessionServerSnapshot);
  const recommendationFeed = useRecommendationFeed();
  const [home, setHome] = useState<CommunityHome | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<number, string>>({});
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const hotQuestions = home?.questions ?? [];
  const recommendedQuestions = home?.recommended_questions?.length ? home.recommended_questions : hotQuestions.filter((question) => question.user_id !== studentSession?.id).slice(0, 6);
  const hotNotes = home?.notes ?? [];
  const hotStudents = useMemo(
    () => reorderByRecommendation(home?.hot_students ?? [], recommendationFeed?.orders.students),
    [home?.hot_students, recommendationFeed]
  );
  const questionStats = hotQuestions.length;
  const noteStats = hotNotes.length;
  const answerStats = hotQuestions.reduce((sum, question) => sum + question.answers_count, 0);

  function requireStudentLogin(action: string) {
    if (studentSession) return true;
    setStatus(`请先登录学生账号后再${action}。`);
    return false;
  }

  useEffect(() => {
    let ignore = false;
    async function loadCommunity() {
      setIsLoading(true);
      setStatus("正在加载学习社区...");
      try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
        const response = await fetch(`${API_BASE_URL}/learn/community${suffix}`, { headers: studentSession ? getStudentRequestHeaders() : {}, cache: "no-store" });
        if (ignore) return;
        if (!response.ok) {
          setStatus("社区内容读取失败，请确认 FastAPI 服务正在运行。");
          return;
        }
        const payload = (await response.json()) as CommunityHome;
        const resultCount = payload.questions.length + payload.notes.length + payload.students.length;
        setHome(payload);
        setStatus(query ? `找到 ${resultCount} 条包含“${query}”的内容` : studentSession ? "问题、解答、笔记和同学都在这里。" : "当前为游客浏览，登录后可以回答、点赞和关注。");
      } catch {
        if (!ignore) setStatus("社区内容读取失败，请确认 FastAPI 服务正在运行。");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    void loadCommunity();
    return () => { ignore = true; };
  }, [studentSession, query]);

  async function submitAnswer(questionId: number) {
    const body = answerDrafts[questionId]?.trim();
    if (!body) return;
    if (!requireStudentLogin("发布回答")) return;
    const response = await fetch(`${API_BASE_URL}/learn/community/questions/${questionId}/answers`, {
      method: "POST",
      headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    if (!response.ok) {
      setStatus("回答发布失败，请稍后再试。");
      return;
    }
    const created = (await response.json()) as CommunityAnswer;
    setHome((current) => updateQuestionCollections(current, (question) => question.id === questionId ? { ...question, answers: [...question.answers, created], answers_count: question.answers_count + 1 } : question));
    setAnswerDrafts((current) => ({ ...current, [questionId]: "" }));
    setStatus("回答已发布，并同步到你的主页动态。");
  }

  async function toggleAnswerLike(questionId: number, answer: CommunityAnswer) {
    if (!requireStudentLogin("点赞回答")) return;
    const response = await fetch(`${API_BASE_URL}/learn/community/answers/${answer.id}/like`, { method: "POST", headers: getStudentRequestHeaders() });
    if (!response.ok) return;
    const payload = (await response.json()) as { liked: boolean; likes_count: number };
    setHome((current) => updateQuestionCollections(current, (question) => question.id === questionId ? { ...question, answers: question.answers.map((item) => item.id === answer.id ? { ...item, liked_by_me: payload.liked, likes_count: payload.likes_count } : item) } : question));
  }

  async function toggleQuestionLike(question: CommunityQuestion) {
    if (!requireStudentLogin("点赞问题")) return;
    const response = await fetch(`${API_BASE_URL}/learn/community/questions/${question.id}/like`, { method: "POST", headers: getStudentRequestHeaders() });
    if (!response.ok) return;
    const payload = (await response.json()) as { liked: boolean; likes_count: number };
    setHome((current) => updateQuestionCollections(current, (item) => item.id === question.id ? { ...item, liked_by_me: payload.liked, likes_count: payload.likes_count } : item));
  }

  async function toggleNoteLike(note: CommunityNoteShare) {
    if (!requireStudentLogin("点赞笔记")) return;
    const response = await fetch(`${API_BASE_URL}/learn/community/notes/${note.id}/like`, { method: "POST", headers: getStudentRequestHeaders() });
    if (!response.ok) return;
    const payload = (await response.json()) as { liked: boolean; likes_count: number };
    setHome((current) => current ? { ...current, notes: current.notes.map((item) => item.id === note.id ? { ...item, liked_by_me: payload.liked, likes_count: payload.likes_count } : item) } : current);
  }

  async function toggleFollow(studentId: number) {
    if (!requireStudentLogin("关注同学")) return;
    if (!home) return;
    const isFollowing = home.following_ids.includes(studentId);
    const response = await fetch(`${API_BASE_URL}/learn/students/${studentId}/follow`, { method: isFollowing ? "DELETE" : "POST", headers: getStudentRequestHeaders() });
    if (!response.ok) return;
    setHome((current) => current ? { ...current, following_ids: isFollowing ? current.following_ids.filter((id) => id !== studentId) : Array.from(new Set([...current.following_ids, studentId])) } : current);
  }

  async function sendMessage(studentId: number) {
    const content = messageDrafts[studentId]?.trim();
    if (!content) return;
    if (!requireStudentLogin("给同学留言")) return;
    const response = await fetch(`${API_BASE_URL}/learn/community/messages`, {
      method: "POST",
      headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ receiver_id: studentId, content })
    });
    if (!response.ok) {
      setStatus("留言发送失败，请先关注对方。");
      return;
    }
    const created = await response.json();
    setHome((current) => current ? { ...current, recent_messages: [created, ...current.recent_messages].slice(0, 8) } : current);
    setMessageDrafts((current) => ({ ...current, [studentId]: "" }));
    setStatus("留言已发送。");
  }

  return (
    <div className="min-h-screen bg-[#f6fbf9]">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-lg border border-mint/20 bg-white shadow-sm">
          <div className="grid gap-4 bg-[linear-gradient(135deg,#fff8ef_0%,#eefbf5_46%,#f0f5ff_100%)] p-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-coral">Community Forum</p>
              <h1 className="mt-1 text-3xl font-black text-ink sm:text-4xl">学习社区</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">找问题、找解答、找笔记、找同学。你在课堂或题库里提出的问题，会自动汇入这里让大家一起讨论。</p>
            </div>
            <form className="flex w-full flex-col gap-2 sm:flex-row lg:w-[32rem]" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
              <div className="focus-within:ring-mint/40 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/70 bg-white/90 px-3 py-2 ring-2 ring-transparent">
                <Search size={17} className="text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索问题、学生或笔记" className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
              </div>
              <button type="submit" className="focus-ring rounded-lg bg-ink px-5 py-2 text-sm font-black text-white">搜索</button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-3 text-xs font-black text-slate-500">
            <ForumChip icon={<HelpCircle size={14} />} label="问题" value={questionStats} tone="mint" />
            <ForumChip icon={<MessageCircle size={14} />} label="解答" value={answerStats} tone="coral" />
            <ForumChip icon={<NotebookPen size={14} />} label="笔记" value={noteStats} tone="blue" />
            <ForumChip icon={<Users size={14} />} label="同学" value={home?.students.length ?? 0} tone="amber" />
            <span className="ml-auto text-sm font-semibold text-slate-500">{status}</span>
          </div>
        </section>

        {!studentSession ? (
          <section className="mt-4 flex flex-col gap-3 rounded-lg border border-mint/20 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-ink">你正在以游客身份浏览学习社区</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">浏览问题、回答、笔记和同学主页不需要登录；发布回答、点赞、关注和留言时需要学生账号。</p>
            </div>
            <div className="flex gap-2">
              <Link href="/login" className="focus-ring rounded-lg bg-coral px-4 py-2 text-sm font-black text-white">学生登录</Link>
              <Link href="/register" className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-ink">注册</Link>
            </div>
          </section>
        ) : null}

        {isLoading && !home ? <div className="panel mt-4 flex items-center gap-2 rounded-lg p-5 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={16} />正在加载学习社区...</div> : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.78fr)]">
          <div className="grid gap-4">
            {isSearching ? (
              <CommunitySection title="搜索结果" description={`包含“${trimmedQuery}”的问题、笔记和学生。`} icon={<Search size={18} />} accent="bg-mint/10 text-mint">
                <SearchResultsPanel
                  query={trimmedQuery}
                  questions={hotQuestions}
                  notes={hotNotes}
                  students={home?.students ?? []}
                  currentUserId={studentSession?.id ?? 0}
                  followingIds={home?.following_ids ?? []}
                  answerDrafts={answerDrafts}
                  setAnswerDrafts={setAnswerDrafts}
                  messageDrafts={messageDrafts}
                  setMessageDrafts={setMessageDrafts}
                  onSubmitAnswer={submitAnswer}
                  onLikeQuestion={toggleQuestionLike}
                  onLikeAnswer={toggleAnswerLike}
                  onLikeNote={toggleNoteLike}
                  onFollow={toggleFollow}
                  onSendMessage={sendMessage}
                />
              </CommunitySection>
            ) : (
              <CommunitySection title="推荐给我的问题" description="根据你的课程、题库和学习路径推荐，也会包含还没人回答的开放问题。" icon={<Sparkles size={18} />} accent="bg-mint/10 text-mint">
                <QuestionsPanel
                  questions={recommendedQuestions}
                  emptyText="暂时没有推荐问题，换个关键词或稍后再来看看。"
                  currentUserId={studentSession?.id ?? 0}
                  followingIds={home?.following_ids ?? []}
                  answerDrafts={answerDrafts}
                  setAnswerDrafts={setAnswerDrafts}
                  onSubmitAnswer={submitAnswer}
                  onLikeQuestion={toggleQuestionLike}
                  onLikeAnswer={toggleAnswerLike}
                  onFollow={toggleFollow}
                />
              </CommunitySection>
            )}
            {!isSearching ? <CommunitySection title="热门问题" description="大家正在讨论的问题，按回答热度和更新时间排序。" icon={<HelpCircle size={18} />} accent="bg-coral/10 text-coral">
              <QuestionsPanel
                questions={hotQuestions}
                emptyText="暂时还没有问题。你可以在课堂章节或我的题库里发起一个问题。"
                currentUserId={studentSession?.id ?? 0}
                followingIds={home?.following_ids ?? []}
                answerDrafts={answerDrafts}
                setAnswerDrafts={setAnswerDrafts}
                onSubmitAnswer={submitAnswer}
                onLikeQuestion={toggleQuestionLike}
                onLikeAnswer={toggleAnswerLike}
                onFollow={toggleFollow}
              />
            </CommunitySection> : null}
          </div>

          <aside className="grid gap-4 content-start">
            <CommunitySection title="热门分享笔记" description="被同学点赞较多的复习笔记和学习方法。" icon={<NotebookPen size={18} />} accent="bg-sky-100 text-sky-700">
              <NotesPanel notes={hotNotes} currentUserId={studentSession?.id ?? 0} followingIds={home?.following_ids ?? []} onLikeNote={toggleNoteLike} onFollow={toggleFollow} />
            </CommunitySection>
            <CommunitySection title="热门学生" description="按社区积分和互动活跃度展示。" icon={<Users size={18} />} accent="bg-amber-100 text-amber-700">
              <PeoplePanel students={hotStudents} followingIds={home?.following_ids ?? []} messageDrafts={messageDrafts} setMessageDrafts={setMessageDrafts} onFollow={toggleFollow} onSendMessage={sendMessage} />
            </CommunitySection>
            <CommunitySection title="最近留言" description="你和关注同学之间的最近交流。" icon={<MessageCircle size={18} />} accent="bg-violet-100 text-violet-700">
              <RecentMessagesPanel home={home} />
            </CommunitySection>
          </aside>
        </section>
      </main>
    </div>
  );
}

function ForumChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "mint" | "coral" | "blue" | "amber" }) {
  const toneClass = tone === "mint" ? "bg-mint/10 text-mint" : tone === "coral" ? "bg-coral/10 text-coral" : tone === "blue" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${toneClass}`}>{icon}{label} {value}</span>;
}

function CommunitySection({ title, description, icon, accent, children }: { title: string; description: string; icon: ReactNode; accent: string; children: ReactNode }) {
  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${accent}`}>{icon}</span>
        <div>
          <h2 className="text-xl font-black text-ink">{title}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SearchResultsPanel({
  query,
  questions,
  notes,
  students,
  currentUserId,
  followingIds,
  answerDrafts,
  setAnswerDrafts,
  messageDrafts,
  setMessageDrafts,
  onSubmitAnswer,
  onLikeQuestion,
  onLikeAnswer,
  onLikeNote,
  onFollow,
  onSendMessage
}: {
  query: string;
  questions: CommunityQuestion[];
  notes: CommunityNoteShare[];
  students: StudentProfileSummary[];
  currentUserId: number;
  followingIds: number[];
  answerDrafts: Record<number, string>;
  setAnswerDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  messageDrafts: Record<number, string>;
  setMessageDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  onSubmitAnswer: (questionId: number) => void;
  onLikeQuestion: (question: CommunityQuestion) => void;
  onLikeAnswer: (questionId: number, answer: CommunityAnswer) => void;
  onLikeNote: (note: CommunityNoteShare) => void;
  onFollow: (studentId: number) => void;
  onSendMessage: (studentId: number) => void;
}) {
  const total = questions.length + notes.length + students.length;
  if (total === 0) {
    return <EmptyState icon={<Search />} title="没有找到相关内容" text={`没有找到包含“${query}”的问题、笔记或学生。`} />;
  }

  return (
    <div className="grid gap-4">
      {questions.length > 0 ? (
        <SearchResultGroup title="问题" count={questions.length} icon={<HelpCircle size={15} />}>
          <div className="grid gap-2.5">
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                currentUserId={currentUserId}
                following={followingIds.includes(question.user_id)}
                answerDraft={answerDrafts[question.id] ?? ""}
                setAnswerDraft={(value) => setAnswerDrafts((current) => ({ ...current, [question.id]: value }))}
                onSubmitAnswer={() => onSubmitAnswer(question.id)}
                onLikeQuestion={() => onLikeQuestion(question)}
                onLikeAnswer={(answer) => onLikeAnswer(question.id, answer)}
                onFollow={() => onFollow(question.user_id)}
              />
            ))}
          </div>
        </SearchResultGroup>
      ) : null}
      {notes.length > 0 ? (
        <SearchResultGroup title="笔记" count={notes.length} icon={<NotebookPen size={15} />}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {notes.map((note) => (
              <SearchNoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                following={followingIds.includes(note.user_id)}
                onLike={() => onLikeNote(note)}
                onFollow={() => onFollow(note.user_id)}
              />
            ))}
          </div>
        </SearchResultGroup>
      ) : null}
      {students.length > 0 ? (
        <SearchResultGroup title="学生" count={students.length} icon={<Users size={15} />}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {students.map((student) => (
              <SearchStudentCard
                key={student.id}
                student={student}
                following={followingIds.includes(student.id)}
                message={messageDrafts[student.id] ?? ""}
                setMessage={(value) => setMessageDrafts((current) => ({ ...current, [student.id]: value }))}
                onFollow={() => onFollow(student.id)}
                onSendMessage={() => onSendMessage(student.id)}
              />
            ))}
          </div>
        </SearchResultGroup>
      ) : null}
    </div>
  );
}

function SearchStudentCard({ student, following, message, setMessage, onFollow, onSendMessage }: { student: StudentProfileSummary; following: boolean; message: string; setMessage: (value: string) => void; onFollow: () => void; onSendMessage: () => void }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar name={student.full_name} avatarUrl={student.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black text-ink">{student.full_name}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{student.region || "全球学习者"} · {student.community_points ?? 0} 分</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{student.bio || "这个同学还没有填写个人简介。"}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link href={`/leaderboard/${student.id}`} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-black text-white">
          查看主页
          <ArrowRight size={14} />
        </Link>
        <button type="button" onClick={onFollow} className={`focus-ring rounded-lg px-3 py-2 text-xs font-black ${following ? "border border-slate-200 text-slate-600" : "bg-mint/10 text-mint"}`}>{following ? "已关注" : "关注同学"}</button>
      </div>
      {following ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="给关注的人留言" rows={2} className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none" />
          <button type="button" onClick={onSendMessage} className="focus-ring mt-2 inline-flex items-center gap-2 rounded-lg bg-coral px-3 py-2 text-xs font-black text-white"><Send size={14} />发送</button>
        </div>
      ) : null}
    </article>
  );
}

function SearchResultGroup({ title, count, icon, children }: { title: string; count: number; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-ink">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-500">{icon}</span>
        {title}
        <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs text-mint">{count}</span>
      </div>
      {children}
    </section>
  );
}

function SearchNoteCard({ note, currentUserId, following, onLike, onFollow }: { note: CommunityNoteShare; currentUserId: number; following: boolean; onLike: () => void; onFollow: () => void }) {
  return (
    <article className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={note.student_name} avatarUrl={note.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">{note.student_name}</p>
            <p className="text-xs font-semibold text-slate-400">{formatDate(note.created_at)}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {note.user_id !== currentUserId ? <button type="button" onClick={onFollow} className="focus-ring rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-black text-slate-500">{following ? "已关注" : "关注"}</button> : null}
          <button type="button" onClick={onLike} className={`focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-black ${note.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 text-slate-500 hover:text-coral"}`}><Heart size={14} />{note.likes_count}</button>
        </div>
      </div>
      <h3 className="mt-3 line-clamp-2 text-base font-black text-ink">{note.title}</h3>
      {note.course_title ? <p className="mt-1 text-xs font-bold text-mint">{note.course_title}</p> : null}
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-6 text-slate-700">{note.content}</p>
    </article>
  );
}

function QuestionsPanel({ questions, emptyText, currentUserId, followingIds, answerDrafts, setAnswerDrafts, onSubmitAnswer, onLikeQuestion, onLikeAnswer, onFollow }: { questions: CommunityQuestion[]; emptyText: string; currentUserId: number; followingIds: number[]; answerDrafts: Record<number, string>; setAnswerDrafts: Dispatch<SetStateAction<Record<number, string>>>; onSubmitAnswer: (questionId: number) => void; onLikeQuestion: (question: CommunityQuestion) => void; onLikeAnswer: (questionId: number, answer: CommunityAnswer) => void; onFollow: (studentId: number) => void }) {
  return <div className="grid gap-2.5">{questions.length === 0 ? <EmptyState icon={<HelpCircle />} title="还没有找到问题" text={emptyText} /> : null}{questions.map((question) => <QuestionCard key={question.id} question={question} currentUserId={currentUserId} following={followingIds.includes(question.user_id)} answerDraft={answerDrafts[question.id] ?? ""} setAnswerDraft={(value) => setAnswerDrafts((current) => ({ ...current, [question.id]: value }))} onSubmitAnswer={() => onSubmitAnswer(question.id)} onLikeQuestion={() => onLikeQuestion(question)} onLikeAnswer={(answer) => onLikeAnswer(question.id, answer)} onFollow={() => onFollow(question.user_id)} />)}</div>;
}

function QuestionCard({ question, currentUserId, following, answerDraft, setAnswerDraft, onSubmitAnswer, onLikeQuestion, onLikeAnswer, onFollow }: { question: CommunityQuestion; currentUserId: number; following: boolean; answerDraft: string; setAnswerDraft: (value: string) => void; onSubmitAnswer: () => void; onLikeQuestion: () => void; onLikeAnswer: (answer: CommunityAnswer) => void; onFollow: () => void }) {
  return (
    <details className="group rounded-lg border border-slate-100 bg-white p-0 shadow-sm open:ring-2 open:ring-mint/20">
      <summary className="cursor-pointer list-none p-3.5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><Avatar name={question.student_name} avatarUrl={question.avatar_url} size="sm" /><span>{question.student_name}</span><span>·</span><span>{formatDate(question.created_at)}</span>{question.course_title ? <span className="rounded-full bg-mint/10 px-2 py-0.5 text-mint">{question.course_title}</span> : null}{question.chapter_title ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{question.chapter_title}</span> : null}</div>
            <h3 className="mt-2 truncate text-base font-black text-ink">{question.title}</h3>
            <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-600">{question.body}</p>
          </div>
          <div className="flex items-center gap-2 justify-self-start md:justify-self-end">
            {question.user_id !== currentUserId ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onFollow(); }} className={`focus-ring rounded-lg px-3 py-2 text-xs font-black ${following ? "border border-slate-200 text-slate-500" : "bg-ink text-white"}`}>{following ? "已关注" : "关注"}</button> : null}
            <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onLikeQuestion(); }} className={`focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black ${question.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 text-slate-500 hover:text-coral"}`}><Heart size={15} fill={question.liked_by_me ? "currentColor" : "none"} />{question.likes_count ?? 0}</button>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-black text-slate-600"><MessageCircle size={15} />{question.answers_count}</span>
            <ChevronDown className="text-slate-400 transition group-open:rotate-180" size={18} />
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-100 p-3.5">
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-7 text-slate-700">{question.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">{question.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">#{tag}</span>)}{question.linked_question_title ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">题目：{question.linked_question_title}</span> : null}</div>
        <div className="mt-3 grid gap-2.5">
          {question.answers.map((answer) => <AnswerCard key={answer.id} answer={answer} onLike={() => onLikeAnswer(answer)} />)}
        </div>
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <textarea value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} placeholder="写下你的解题思路或建议" rows={2} className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-7 outline-none" />
          <div className="mt-2 flex justify-end"><button type="button" onClick={onSubmitAnswer} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"><Send size={15} />发布回答</button></div>
        </div>
      </div>
    </details>
  );
}

function AnswerCard({ answer, onLike }: { answer: CommunityAnswer; onLike: () => void }) {
  return <article className="rounded-lg border border-slate-100 bg-white p-3"><div className="flex items-start gap-3"><Avatar name={answer.student_name} avatarUrl={answer.avatar_url} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-black text-ink">{answer.student_name} <span className="font-semibold text-slate-400">· {formatDate(answer.created_at)}</span></p><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.body}</p></div><button type="button" onClick={onLike} className={`focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black ${answer.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 text-slate-500 hover:text-coral"}`}><Heart size={15} />{answer.likes_count}</button></div></article>;
}

function NotesPanel({ notes, currentUserId, followingIds, onLikeNote, onFollow }: { notes: CommunityNoteShare[]; currentUserId: number; followingIds: number[]; onLikeNote: (note: CommunityNoteShare) => void; onFollow: (studentId: number) => void }) {
  return <div className="grid gap-2.5">{notes.length === 0 ? <EmptyState icon={<NotebookPen />} title="还没有共享笔记" text="换个关键词搜索，或者稍后再来看看。" /> : null}{notes.slice(0, 5).map((note) => <article key={note.id} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Avatar name={note.student_name} avatarUrl={note.avatar_url} size="sm" /><div><p className="text-sm font-black text-ink">{note.student_name}</p><p className="text-xs font-semibold text-slate-400">{formatDate(note.created_at)}</p></div></div><div className="flex gap-1.5">{note.user_id !== currentUserId ? <button type="button" onClick={() => onFollow(note.user_id)} className="focus-ring rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-black text-slate-500">{followingIds.includes(note.user_id) ? "已关注" : "关注"}</button> : null}<button type="button" onClick={() => onLikeNote(note)} className={`focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-black ${note.liked_by_me ? "bg-coral/10 text-coral" : "bg-slate-50 text-slate-500 hover:text-coral"}`}><Heart size={14} />{note.likes_count}</button></div></div><h3 className="mt-3 text-base font-black text-ink">{note.title}</h3>{note.course_title ? <p className="mt-1 text-xs font-bold text-mint">{note.course_title}</p> : null}<p className="mt-2 line-clamp-5 whitespace-pre-wrap text-xs leading-6 text-slate-700">{note.content}</p></article>)}</div>;
}

function PeoplePanel({ students, followingIds, messageDrafts, setMessageDrafts, onFollow, onSendMessage }: { students: StudentProfileSummary[]; followingIds: number[]; messageDrafts: Record<number, string>; setMessageDrafts: Dispatch<SetStateAction<Record<number, string>>>; onFollow: (studentId: number) => void; onSendMessage: (studentId: number) => void }) {
  return <div className="grid gap-2.5">{students.length === 0 ? <EmptyState icon={<Users />} title="暂时没有找到同学" text="换个关键词搜索，或稍后再来看看。" /> : null}{students.slice(0, 6).map((student) => <StudentCard key={student.id} student={student} following={followingIds.includes(student.id)} message={messageDrafts[student.id] ?? ""} setMessage={(value) => setMessageDrafts((current) => ({ ...current, [student.id]: value }))} onFollow={() => onFollow(student.id)} onSendMessage={() => onSendMessage(student.id)} />)}</div>;
}

function StudentCard({ student, following, message, setMessage, onFollow, onSendMessage }: { student: StudentProfileSummary; following: boolean; message: string; setMessage: (value: string) => void; onFollow: () => void; onSendMessage: () => void }) {
  return <article className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm"><div className="flex items-start gap-3"><Avatar name={student.full_name} avatarUrl={student.avatar_url} size="md" /><div className="min-w-0 flex-1"><h3 className="truncate text-base font-black text-ink">{student.full_name}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{student.region || "全球学习者"} · {student.community_points ?? 0} 分</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{student.bio || "这个同学还没有填写个人简介。"}</p></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={onFollow} className={`focus-ring flex-1 rounded-lg px-3 py-2 text-xs font-black ${following ? "border border-slate-200 text-slate-600" : "bg-ink text-white"}`}>{following ? "已关注" : "关注"}</button><Link href={`/leaderboard/${student.id}`} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">主页<ArrowRight size={14} /></Link></div>{following ? <div className="mt-3 rounded-lg bg-slate-50 p-2.5"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="给关注的人留言" rows={2} className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none" /><button type="button" onClick={onSendMessage} className="focus-ring mt-2 inline-flex items-center gap-2 rounded-lg bg-coral px-3 py-2 text-xs font-black text-white"><Send size={14} />发送</button></div> : null}</article>;
}

function RecentMessagesPanel({ home }: { home: CommunityHome | null }) {
  const messages = home?.recent_messages ?? [];
  return <div className="grid gap-2.5">{messages.length === 0 ? <EmptyState icon={<MessageCircle />} title="还没有留言" text="关注同学后，可以给对方留言交流。" /> : null}{messages.slice(0, 5).map((message) => <article key={message.id} className="rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-sm"><p className="font-black text-ink">{message.sender_name} → {message.receiver_name}</p><p className="mt-1 leading-5 text-slate-600">{message.content}</p><p className="mt-1 font-semibold text-slate-400">{formatDate(message.created_at)}</p></article>)}</div>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-slate-500"><div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-slate-300">{icon}</div><p className="mt-3 text-base font-black text-ink">{title}</p><p className="mt-2 text-xs font-semibold leading-5">{text}</p></div>;
}

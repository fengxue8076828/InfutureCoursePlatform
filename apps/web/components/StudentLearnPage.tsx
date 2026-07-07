"use client";

import { ArrowRight, Award, BookOpenCheck, Clock3, Database, Feather, Heart, HelpCircle, Loader2, MessageCircle, NotebookTabs, PenLine, Sparkles, Star, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SavedQuestionBankPanel } from "@/components/SavedQuestionBankPanel";
import { getStudentRequestHeaders, getStudentSessionServerSnapshot, getStudentSessionUser, subscribeToStudentSession, type StudentSessionUser } from "@/lib/student-session";
import type { CommunityHome, CommunityQuestion, CommunityReferenceCourse, Course, Enrollment, StudentLearningNote, StudentPost, StudentPublicProfile, StudentSocialHome } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type LearningTab = "home" | "classroom" | "questions" | "notes";
type QuestionDraft = {
  title: string;
  body: string;
  courseId: string;
  chapterId: string;
  linkedQuestionId: string;
  tags: string;
};

const emptyQuestionDraft: QuestionDraft = { title: "", body: "", courseId: "", chapterId: "", linkedQuestionId: "", tags: "" };

const ui = {
  pageEyebrow: "\u6211\u7684\u5b66\u4e60",
  pageTitle: "\u4e2a\u4eba\u5b66\u4e60\u4e2d\u5fc3",
  pageSubtitle: "\u8bfe\u7a0b\u3001\u9898\u5e93\u3001\u7b14\u8bb0\u548c\u5b66\u4e60\u5708\u90fd\u5728\u8fd9\u91cc\u3002",
  home: "\u6211\u7684\u4e3b\u9875",
  classroom: "\u6211\u7684\u8bfe\u5802",
  questionBank: "\u6211\u7684\u9898\u5e93",
  notes: "\u6211\u7684\u7b14\u8bb0",
  activeCourses: "\u5728\u5b66\u8bfe\u7a0b",
  completedCourses: "\u5df2\u5b8c\u6210",
  totalPoints: "\u603b\u79ef\u5206",
  weeklyPoints: "\u672c\u5468\u589e\u957f",
  loading: "\u6b63\u5728\u52a0\u8f7d...",
  loginHint: "\u767b\u5f55\u6216\u8ba2\u9605\u8bfe\u7a0b\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u4f60\u7684\u4e2a\u4eba\u5b66\u4e60\u5185\u5bb9\u3002",
  loadingCourses: "\u6b63\u5728\u8bfb\u53d6\u4f60\u7684\u8bfe\u7a0b...",
  courseSynced: "\u8bfe\u7a0b\u5df2\u540c\u6b65\u5230\u4f60\u7684\u4e2a\u4eba\u8bfe\u5802\u3002",
  noCourses: "\u4f60\u8fd8\u6ca1\u6709\u8ba2\u9605\u8bfe\u7a0b\u3002",
  courseLoadFailed: "\u8bfe\u7a0b\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002",
  loginRequired: "\u8bf7\u5148\u767b\u5f55\u5b66\u751f\u8d26\u53f7",
  loginRequiredText: "\u767b\u5f55\u540e\u53ef\u4ee5\u67e5\u770b\u5df2\u8ba2\u9605\u8bfe\u7a0b\u3001\u9898\u5e93\u3001\u7b14\u8bb0\u548c\u5b66\u4e60\u4e3b\u9875\u3002",
  login: "\u767b\u5f55",
  register: "\u6ce8\u518c",
  enterCourse: "\u8fdb\u5165\u8bfe\u7a0b",
  browseCourses: "\u53bb\u9009\u8bfe",
  noImage: "\u5c1a\u672a\u4e0a\u4f20\u56fe\u7247",
  emptyCourseTitle: "\u8fd8\u6ca1\u6709\u8ba2\u9605\u8bfe\u7a0b",
  emptyCourseText: "\u8ba2\u9605\u540e\u7684\u8bfe\u7a0b\u4f1a\u81ea\u52a8\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  profileSubtitle: "\u5c55\u793a\u8bfe\u7a0b\u3001\u7b14\u8bb0\u3001\u5fc3\u5f97\u548c\u79ef\u5206\u6210\u5c31\u3002",
  nowLearning: "\u6b63\u5728\u5b66\u4e60",
  recommendedCourses: "\u63a8\u8350\u8bfe\u7a0b",
  achievements: "\u6211\u7684\u6210\u5c31",
  learningCircle: "\u5b66\u4e60\u5708",
  shareThought: "\u53d1\u5e03\u5b66\u4e60\u5fc3\u5f97",
  postPlaceholder: "\u5206\u4eab\u5b66\u4e60\u5fc3\u5f97\u3001\u8bfe\u7a0b\u8bc4\u8bba\u6216\u9898\u76ee\u8bb2\u89e3...",
  publishPost: "\u53d1\u5e03",
  publishing: "\u53d1\u5e03\u4e2d...",
  postEmpty: "\u8fd8\u6ca1\u6709\u5b66\u4e60\u5fc3\u5f97\uff0c\u5199\u4e0b\u7b2c\u4e00\u6761\u5427\u3002",
  noCourseLink: "\u4e0d\u5173\u8054\u8bfe\u7a0b",
  follow: "\u5173\u6ce8",
  following: "\u5df2\u5173\u6ce8",
  viewProfile: "\u67e5\u770b\u4e3b\u9875",
  publicProfile: "\u540c\u5b66\u4e3b\u9875",
  sharedThoughts: "\u5206\u4eab\u4e0e\u5fc3\u5f97",
  notesTitle: "\u7b14\u8bb0\u6c47\u603b",
  notesSubtitle: "\u6309\u8bfe\u7a0b\u6c47\u603b\u6bcf\u4e00\u7ae0\u7684\u5b66\u4e60\u7b14\u8bb0\uff0c\u590d\u4e60\u65f6\u53ef\u4ee5\u5feb\u901f\u56de\u770b\u3002",
  noNotes: "\u8fd8\u6ca1\u6709\u7b14\u8bb0",
  noNotesText: "\u5728\u4e0a\u8bfe\u754c\u9762\u5199\u4e0b\u7ae0\u8282\u7b14\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u6309\u8bfe\u7a0b\u6c47\u603b\u663e\u793a\u3002",
  chapter: "\u7ae0",
  updatedAt: "\u66f4\u65b0\u4e8e",
  notesLoadFailed: "\u7b14\u8bb0\u8bfb\u53d6\u5931\u8d25\u3002",
  homeLoadFailed: "\u4e3b\u9875\u6570\u636e\u8bfb\u53d6\u5931\u8d25\u3002",
  selectedStudentFailed: "\u540c\u5b66\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25\u3002",
  regionUnknown: "\u5730\u533a\u672a\u586b\u5199",
  bioEmpty: "\u8fd8\u6ca1\u6709\u586b\u5199\u4e2a\u4eba\u7b80\u4ecb\u3002",
  viewCourse: "\u67e5\u770b\u8bfe\u7a0b",
  emptyRecommended: "\u6682\u65e0\u63a8\u8350\u8bfe\u7a0b",
  noteCount: "\u7bc7\u7b14\u8bb0"
};

const tabs: Array<{ id: LearningTab; label: string; icon: typeof BookOpenCheck }> = [
  { id: "home", label: ui.home, icon: Sparkles },
  { id: "classroom", label: ui.classroom, icon: BookOpenCheck },
  { id: "questions", label: ui.questionBank, icon: Database },
  { id: "notes", label: ui.notes, icon: NotebookTabs }
];

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function initials(name?: string | null) {
  return name?.trim().slice(0, 1).toUpperCase() || "\u5b66";
}

function splitTags(value: string) {
  return value.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6);
}

function shortQuestionTitle(prompt: string) {
  const text = prompt.trim();
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function coursesFromEnrollments(enrollments: Enrollment[]): CommunityReferenceCourse[] {
  return enrollments.map((enrollment) => ({
    id: enrollment.course.id,
    title: enrollment.course.title,
    slug: enrollment.course.slug,
    chapters: (enrollment.course.chapters ?? []).map((chapter) => ({ id: chapter.id, title: chapter.title, position: chapter.position }))
  }));
}
function groupNotesByCourse(notes: StudentLearningNote[]) {
  const groups = new Map<number, { course: StudentLearningNote; notes: StudentLearningNote[] }>();
  for (const note of notes) {
    const current = groups.get(note.course_id);
    if (current) current.notes.push(note);
    else groups.set(note.course_id, { course: note, notes: [note] });
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    notes: [...group.notes].sort((left, right) => left.chapter_position - right.chapter_position)
  }));
}
export function StudentLearnPage() {
  const studentSession = useSyncExternalStore(subscribeToStudentSession, getStudentSessionUser, getStudentSessionServerSnapshot);
  const [activeTab, setActiveTab] = useState<LearningTab>("home");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [notes, setNotes] = useState<StudentLearningNote[]>([]);
  const [socialHome, setSocialHome] = useState<StudentSocialHome | null>(null);
  const [status, setStatus] = useState(ui.loginHint);
  const [notesStatus, setNotesStatus] = useState(ui.notesSubtitle);
  const [homeStatus, setHomeStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studentSession) {
      return;
    }

    let ignore = false;
    async function loadLearningData() {
      setIsLoading(true);
      setStatus(ui.loadingCourses);
      setNotesStatus(ui.notesSubtitle);
      setHomeStatus("");

      const requestHeaders = getStudentRequestHeaders();

      async function loadCourses() {
        try {
          const coursesResponse = await fetch(`${API_BASE_URL}/learn/me/courses?ts=${Date.now()}`, {
            headers: requestHeaders,
            cache: "no-store"
          });
          if (ignore) return;
          if (!coursesResponse.ok) {
            setStatus(ui.courseLoadFailed);
            return;
          }
          const payload = (await coursesResponse.json()) as Enrollment[];
          if (ignore) return;
          setEnrollments(payload);
          setStatus(payload.length > 0 ? ui.courseSynced : ui.noCourses);
        } catch {
          if (!ignore) setStatus(ui.courseLoadFailed);
        }
      }

      async function loadNotes() {
        try {
          const notesResponse = await fetch(`${API_BASE_URL}/learn/me/notes?ts=${Date.now()}`, {
            headers: requestHeaders,
            cache: "no-store"
          });
          if (ignore) return;
          if (!notesResponse.ok) {
            setNotesStatus(ui.notesLoadFailed);
            return;
          }
          const payload = (await notesResponse.json()) as StudentLearningNote[];
          if (ignore) return;
          setNotes(payload);
          setNotesStatus(ui.notesSubtitle);
        } catch {
          if (!ignore) setNotesStatus(ui.notesLoadFailed);
        }
      }

      async function loadSocialHome() {
        try {
          const homeResponse = await fetch(`${API_BASE_URL}/learn/me/social-home?ts=${Date.now()}`, {
            headers: requestHeaders,
            cache: "no-store"
          });
          if (ignore) return;
          if (!homeResponse.ok) {
            setHomeStatus(ui.homeLoadFailed);
            return;
          }
          const payload = (await homeResponse.json()) as StudentSocialHome;
          if (ignore) return;
          setSocialHome(payload);
          setHomeStatus("");
        } catch {
          if (!ignore) setHomeStatus(ui.homeLoadFailed);
        }
      }

      try {
        await Promise.all([loadCourses(), loadNotes(), loadSocialHome()]);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    void loadLearningData();
    return () => { ignore = true; };
  }, [studentSession]);

  const visibleEnrollments = studentSession ? enrollments : [];
  const visibleNotes = studentSession ? notes : [];
  const visibleSocialHome = studentSession ? socialHome : null;
  const active = visibleEnrollments.filter((item) => item.status === "active");
  const completed = visibleEnrollments.filter((item) => item.status === "completed");

  function addPost(post: StudentPost) {
    setSocialHome((current) => current ? { ...current, posts: [post, ...current.posts] } : current);
  }

  function updateFollowing(studentId: number, following: boolean) {
    setSocialHome((current) => {
      if (!current) return current;
      const followingIds = following
        ? Array.from(new Set([...current.following_ids, studentId]))
        : current.following_ids.filter((id) => id !== studentId);
      return { ...current, following_ids: followingIds };
    });
  }

  return (
    <>
      <Header />
      <main className="bg-mist py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="mb-6 overflow-hidden rounded-[1.35rem] border border-white/80 bg-white shadow-soft">
            <div className="relative grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8">
              <div className="absolute right-8 top-8 h-24 w-24 rounded-full bg-mint/10 blur-2xl" />
              <div>
                <p className="text-sm font-black text-coral">{ui.pageEyebrow}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-ink sm:text-4xl">{ui.pageTitle}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{ui.pageSubtitle}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniStat icon={BookOpenCheck} label={ui.activeCourses} value={active.length} />
                <MiniStat icon={Trophy} label={ui.completedCourses} value={completed.length} />
                <MiniStat icon={Award} label={ui.totalPoints} value={socialHome?.total_points ?? 0} />
                <MiniStat icon={Clock3} label={ui.weeklyPoints} value={`+${socialHome?.weekly_points ?? 0}`} />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition ${isActive ? "bg-ink text-white shadow-sm" : "bg-white text-slate-600 hover:text-ink"}`}>
                    <Icon size={16} />{tab.label}
                  </button>
                );
              })}
            </div>
          </section>

          {!studentSession ? <LoginRequiredPanel /> : activeTab === "home" ? (
            <LearningHomePanel studentSession={studentSession} socialHome={visibleSocialHome} enrollments={visibleEnrollments} status={homeStatus} onPostCreated={addPost} onFollowChange={updateFollowing} />
          ) : activeTab === "classroom" ? (
            <section className="panel rounded-lg p-5"><SectionHeader eyebrow={ui.classroom} title={ui.classroom} description={status} /><CourseListPanel enrollments={visibleEnrollments} isLoading={isLoading} /></section>
          ) : activeTab === "questions" ? (
            <section className="panel rounded-lg p-5"><SectionHeader eyebrow={ui.questionBank} title={ui.questionBank} description="" /><SavedQuestionBankPanel studentSession={studentSession} /></section>
          ) : (
            <NotesPanel notes={visibleNotes} status={notesStatus} isLoading={isLoading} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof BookOpenCheck; label: string; value: string | number }) {
  return <div className="rounded-lg border border-slate-100 bg-white/80 p-4 shadow-sm"><Icon className="text-coral" size={20} /><p className="mt-3 text-2xl font-black text-ink">{value}</p><p className="mt-1 text-sm font-semibold text-slate-500">{label}</p></div>;
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-5"><p className="text-sm font-black text-coral">{eyebrow}</p><h2 className="mt-1 text-2xl font-black text-ink">{title}</h2>{description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}</div>;
}

function LoginRequiredPanel() {
  return <section className="panel rounded-lg p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint/10 text-mint"><Users size={24} /></div><h2 className="mt-4 text-2xl font-black text-ink">{ui.loginRequired}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">{ui.loginRequiredText}</p><div className="mt-5 flex justify-center gap-3"><Link className="focus-ring rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white" href="/login">{ui.login}</Link><Link className="focus-ring rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700" href="/register">{ui.register}</Link></div></section>;
}
function CourseListPanel({ enrollments, isLoading }: { enrollments: Enrollment[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />{ui.loadingCourses}</div>;
  if (enrollments.length === 0) return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p className="font-black text-ink">{ui.emptyCourseTitle}</p><p className="mt-2 text-sm text-slate-500">{ui.emptyCourseText}</p><Link href="/courses" className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white">{ui.browseCourses}<ArrowRight size={16} /></Link></div>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{enrollments.map((enrollment) => <CourseProgressCard key={enrollment.id} enrollment={enrollment} />)}</div>;
}

function CourseProgressCard({ enrollment }: { enrollment: Enrollment }) {
  const imageUrl = enrollment.course.hero_image_url?.trim();
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-soft">
      {imageUrl ? <img src={imageUrl} alt={enrollment.course.title} className="h-36 w-full rounded-lg object-cover" /> : <div className="grid h-36 w-full place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">{ui.noImage}</div>}
      <div className="p-2"><div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500"><span className="rounded-full bg-mint/12 px-2.5 py-1 text-mint">{enrollment.course.level}</span><span>{enrollment.progress_percent}%</span></div><h3 className="mt-3 line-clamp-2 text-lg font-black text-ink">{enrollment.course.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{enrollment.course.subtitle}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(enrollment.progress_percent, 100)}%` }} /></div><div className="mt-4 flex justify-end"><Link href={`/learn/${enrollment.course.slug}`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-ink/90">{ui.enterCourse}<ArrowRight size={16} /></Link></div></div>
    </article>
  );
}

function LearningHomePanel({ studentSession, socialHome, enrollments, status, onPostCreated, onFollowChange }: { studentSession: StudentSessionUser; socialHome: StudentSocialHome | null; enrollments: Enrollment[]; status: string; onPostCreated: (post: StudentPost) => void; onFollowChange: (studentId: number, following: boolean) => void }) {
  const [postDraft, setPostDraft] = useState("");
  const [postCourseId, setPostCourseId] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentPublicProfile | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [communityHome, setCommunityHome] = useState<CommunityHome | null>(null);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(emptyQuestionDraft);
  const [questionStatus, setQuestionStatus] = useState("");
  const [isQuestionPosting, setIsQuestionPosting] = useState(false);
  const profile = socialHome?.profile;
  const displayName = profile?.full_name || studentSession.full_name;
  const avatarUrl = profile?.avatar_url || studentSession.avatar_url;
  const activeCourses = socialHome?.active_courses ?? enrollments.filter((item) => item.status === "active");
  const completedCourses = socialHome?.completed_courses ?? enrollments.filter((item) => item.status === "completed");
  const referenceCourses = communityHome?.my_courses ?? coursesFromEnrollments(enrollments);
  const selectedQuestionCourse = referenceCourses.find((course) => course.id === Number(questionDraft.courseId));

  useEffect(() => {
    let ignore = false;
    async function loadCommunityReferences() {
      try {
        const response = await fetch(`${API_BASE_URL}/learn/community?ts=${Date.now()}`, {
          headers: getStudentRequestHeaders(),
          cache: "no-store"
        });
        if (!ignore && response.ok) {
          setCommunityHome((await response.json()) as CommunityHome);
        }
      } catch {
        if (!ignore) setQuestionStatus("题目和课程引用读取失败，仍然可以发布普通问题。");
      }
    }
    void loadCommunityReferences();
    return () => { ignore = true; };
  }, [studentSession.id]);

  async function createCommunityQuestion() {
    if (!questionDraft.title.trim() || !questionDraft.body.trim()) {
      setQuestionStatus("请先填写问题标题和问题描述。");
      return;
    }
    setIsQuestionPosting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/learn/community/questions`, {
        method: "POST",
        headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: questionDraft.title.trim(),
          body: questionDraft.body.trim(),
          course_id: questionDraft.courseId ? Number(questionDraft.courseId) : null,
          chapter_id: questionDraft.chapterId ? Number(questionDraft.chapterId) : null,
          linked_question_id: questionDraft.linkedQuestionId ? Number(questionDraft.linkedQuestionId) : null,
          tags: splitTags(questionDraft.tags)
        })
      });
      if (!response.ok) throw new Error("question failed");
      const created = (await response.json()) as CommunityQuestion;
      setCommunityHome((current) => current ? { ...current, questions: [created, ...current.questions], community_points: current.community_points + 5 } : current);
      setQuestionDraft(emptyQuestionDraft);
      setQuestionStatus("问题已发布到学习社区。");
    } catch {
      setQuestionStatus("问题发布失败，请检查课程关联或稍后再试。");
    } finally {
      setIsQuestionPosting(false);
    }
  }

  async function createPost() {
    if (!postDraft.trim()) return;
    setIsPosting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/learn/me/posts`, { method: "POST", headers: { ...getStudentRequestHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ content: postDraft.trim(), course_id: postCourseId ? Number(postCourseId) : null }), cache: "no-store" });
      if (response.ok) { onPostCreated((await response.json()) as StudentPost); setPostDraft(""); setPostCourseId(""); }
    } finally { setIsPosting(false); }
  }

  async function loadPublicProfile(studentId: number) {
    setSelectedStatus(ui.loading);
    try {
      const response = await fetch(`${API_BASE_URL}/learn/students/${studentId}/profile?ts=${Date.now()}`, { headers: getStudentRequestHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("profile failed");
      setSelectedStudent((await response.json()) as StudentPublicProfile);
      setSelectedStatus("");
    } catch { setSelectedStatus(ui.selectedStudentFailed); }
  }

  async function toggleFollow(studentId: number, following: boolean) {
    const response = await fetch(`${API_BASE_URL}/learn/students/${studentId}/follow`, { method: following ? "DELETE" : "POST", headers: getStudentRequestHeaders(), cache: "no-store" });
    if (response.ok) { onFollowChange(studentId, !following); setSelectedStudent((current) => current && current.profile.id === studentId ? { ...current, is_following: !following } : current); }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div className="panel overflow-hidden rounded-lg"><div className="h-32 bg-[radial-gradient(circle_at_20%_20%,rgba(123,201,174,0.45),transparent_28%),linear-gradient(135deg,#fff7ed,#e8f6f1)]" /><div className="px-5 pb-5"><div className="-mt-10 flex flex-wrap items-end justify-between gap-4"><div className="flex items-end gap-4"><Avatar name={displayName} url={avatarUrl} size="large" /><div className="pb-1"><h2 className="text-2xl font-black text-ink">{displayName}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{profile?.region || ui.regionUnknown}</p></div></div><div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4"><ProfileMetric label={ui.activeCourses} value={activeCourses.length} /><ProfileMetric label={ui.completedCourses} value={completedCourses.length} /><ProfileMetric label={ui.totalPoints} value={socialHome?.total_points ?? 0} /><ProfileMetric label={ui.weeklyPoints} value={`+${socialHome?.weekly_points ?? 0}`} /></div></div><p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-600">{profile?.bio || ui.bioEmpty}</p></div></div>
        <div className="panel rounded-lg p-5"><div className="mb-4 flex items-center gap-2"><PenLine size={18} className="text-coral" /><h3 className="text-lg font-black text-ink">{ui.shareThought}</h3></div><textarea value={postDraft} onChange={(event) => setPostDraft(event.target.value)} className="focus-ring min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7 outline-none" placeholder={ui.postPlaceholder} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><select value={postCourseId} onChange={(event) => setPostCourseId(event.target.value)} className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600"><option value="">{ui.noCourseLink}</option>{enrollments.map((enrollment) => <option key={enrollment.course.id} value={enrollment.course.id}>{enrollment.course.title}</option>)}</select><button type="button" onClick={() => void createPost()} disabled={isPosting || !postDraft.trim()} className="focus-ring rounded-lg bg-coral px-5 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{isPosting ? ui.publishing : ui.publishPost}</button></div></div>
        <div className="panel rounded-lg p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-coral" />
              <h3 className="text-lg font-black text-ink">{"\u8d34\u51fa\u95ee\u9898"}</h3>
            </div>
            <Link href="/community" className="focus-ring rounded-lg bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 hover:text-mint">{"\u53bb\u793e\u533a\u770b\u770b"}</Link>
          </div>
          <div className="grid gap-3">
            <input
              value={questionDraft.title}
              onChange={(event) => setQuestionDraft((current) => ({ ...current, title: event.target.value }))}
              className="focus-ring w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none"
              placeholder={"\u95ee\u9898\u6807\u9898\uff0c\u4f8b\u5982\uff1a\u8fd9\u9053\u586b\u7a7a\u9898\u4e3a\u4ec0\u4e48\u4e0d\u80fd\u7528\u8fc7\u53bb\u5f0f\uff1f"}
            />
            <textarea
              value={questionDraft.body}
              onChange={(event) => setQuestionDraft((current) => ({ ...current, body: event.target.value }))}
              className="focus-ring min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7 outline-none"
              placeholder={"\u628a\u4f60\u7684\u95ee\u9898\u3001\u5c1d\u8bd5\u8fc7\u7684\u601d\u8def\u3001\u5361\u4f4f\u7684\u5730\u65b9\u5199\u6e05\u695a\u3002"}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={questionDraft.courseId}
                onChange={(event) => setQuestionDraft((current) => ({ ...current, courseId: event.target.value, chapterId: "" }))}
                className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600"
              >
                <option value="">{"\u4e0d\u5173\u8054\u8bfe\u7a0b"}</option>
                {referenceCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
              <select
                value={questionDraft.chapterId}
                onChange={(event) => setQuestionDraft((current) => ({ ...current, chapterId: event.target.value }))}
                disabled={!selectedQuestionCourse}
                className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">{"\u4e0d\u5173\u8054\u7ae0\u8282"}</option>
                {selectedQuestionCourse?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
              <select
                value={questionDraft.linkedQuestionId}
                onChange={(event) => setQuestionDraft((current) => ({ ...current, linkedQuestionId: event.target.value }))}
                className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600"
              >
                <option value="">{"\u4e0d\u5173\u8054\u9898\u76ee"}</option>
                {(communityHome?.reference_questions ?? []).map((question) => <option key={question.id} value={question.id}>{shortQuestionTitle(question.prompt)}</option>)}
              </select>
            </div>
            <input
              value={questionDraft.tags}
              onChange={(event) => setQuestionDraft((current) => ({ ...current, tags: event.target.value }))}
              className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none"
              placeholder={"\u6807\u7b7e\uff0c\u7528\u9017\u53f7\u5206\u9694\uff0c\u4f8b\u5982\uff1aA1, \u5199\u4f5c, \u8bed\u6cd5"}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">{questionStatus || "\u53d1\u5e03\u540e\u4f1a\u51fa\u73b0\u5728\u5b66\u4e60\u793e\u533a\u7684\u95ee\u9898\u5217\u8868\u4e2d\u3002"}</p>
              <button
                type="button"
                onClick={() => void createCommunityQuestion()}
                disabled={isQuestionPosting || !questionDraft.title.trim() || !questionDraft.body.trim()}
                className="focus-ring rounded-lg bg-ink px-5 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isQuestionPosting ? "\u53d1\u5e03\u4e2d..." : "\u53d1\u5e03\u5230\u793e\u533a"}
              </button>
            </div>
          </div>
        </div>
        <PostFeed posts={socialHome?.posts ?? []} />
        <CourseStrip title={ui.nowLearning} courses={activeCourses.map((item) => item.course)} emptyText={ui.noCourses} />
        <CourseStrip title={ui.recommendedCourses} courses={socialHome?.recommended_courses ?? []} emptyText={ui.emptyRecommended} />
        {selectedStudent || selectedStatus ? <PublicProfilePanel profile={selectedStudent} status={selectedStatus} onFollow={(id, following) => void toggleFollow(id, following)} /> : null}
      </div>
      <aside className="space-y-6"><div className="panel rounded-lg p-5"><div className="flex items-center gap-2"><Award size={18} className="text-coral" /><h3 className="text-lg font-black text-ink">{ui.achievements}</h3></div><div className="mt-4 grid gap-2">{(socialHome?.achievements ?? []).map((achievement) => <div key={achievement} className="flex items-center gap-2 rounded-lg bg-mint/10 px-3 py-2 text-sm font-bold text-slate-700"><Star size={15} className="text-mint" />{achievement}</div>)}</div>{status ? <p className="mt-4 text-sm text-slate-500">{status}</p> : null}</div><div className="panel rounded-lg p-5"><div className="flex items-center gap-2"><Users size={18} className="text-coral" /><h3 className="text-lg font-black text-ink">{ui.learningCircle}</h3></div><div className="mt-4 grid gap-3">{(socialHome?.suggested_students ?? []).map((student) => { const following = Boolean(socialHome?.following_ids.includes(student.id)); return <div key={student.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="flex items-center gap-3"><Avatar name={student.full_name} url={student.avatar_url} /><div className="min-w-0 flex-1"><p className="truncate font-black text-ink">{student.full_name}</p><p className="truncate text-xs font-semibold text-slate-500">{student.region || ui.regionUnknown}</p></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void toggleFollow(student.id, following)} className="focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 hover:text-mint"><UserPlus size={14} />{following ? ui.following : ui.follow}</button><button type="button" onClick={() => void loadPublicProfile(student.id)} className="focus-ring flex-1 rounded-lg bg-ink px-3 py-2 text-xs font-black text-white">{ui.viewProfile}</button></div></div>; })}</div></div></aside>
    </section>
  );
}
function Avatar({ name, url, size = "normal" }: { name?: string | null; url?: string | null; size?: "normal" | "large" }) {
  const className = size === "large" ? "h-24 w-24 rounded-[1.25rem] text-3xl" : "h-11 w-11 rounded-lg text-sm";
  return url ? <img src={url} alt={name ?? "student"} className={`${className} shrink-0 border-4 border-white object-cover shadow-sm`} /> : <div className={`${className} grid shrink-0 place-items-center border-4 border-white bg-slate-100 font-black text-slate-500 shadow-sm`}>{initials(name)}</div>;
}

function ProfileMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100"><p className="text-lg font-black text-ink">{value}</p><p className="text-xs font-bold text-slate-500">{label}</p></div>;
}

function PostFeed({ posts }: { posts: StudentPost[] }) {
  return <div className="panel rounded-lg p-5"><div className="mb-4 flex items-center gap-2"><MessageCircle size={18} className="text-coral" /><h3 className="text-lg font-black text-ink">{ui.sharedThoughts}</h3></div>{posts.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{ui.postEmpty}</p> : <div className="grid gap-3">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>}</div>;
}

function PostCard({ post }: { post: StudentPost }) {
  return <article className="rounded-lg border border-slate-100 bg-white p-4"><div className="flex items-center gap-3"><Avatar name={post.student_name} url={post.avatar_url} /><div><p className="font-black text-ink">{post.student_name}</p><p className="text-xs font-semibold text-slate-500">{formatDate(post.created_at)}{post.course_title ? ` 路 ${post.course_title}` : ""}</p></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p><div className="mt-3 flex gap-2 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-1"><Heart size={14} />0</span><span className="inline-flex items-center gap-1"><MessageCircle size={14} />0</span></div></article>;
}

function CourseStrip({ title, courses, emptyText }: { title: string; courses: Course[]; emptyText: string }) {
  return <div className="panel rounded-lg p-5"><h3 className="text-lg font-black text-ink">{title}</h3>{courses.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{emptyText}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{courses.slice(0, 4).map((course) => <Link key={course.id} href={`/courses/${course.slug}`} className="group flex gap-3 rounded-lg border border-slate-100 bg-white p-3 hover:border-mint/50">{course.hero_image_url ? <img src={course.hero_image_url} alt={course.title} className="h-16 w-20 rounded-lg object-cover" /> : <div className="h-16 w-20 rounded-lg bg-slate-100" />}<div className="min-w-0 flex-1"><p className="truncate font-black text-ink group-hover:text-mint">{course.title}</p><p className="mt-1 truncate text-sm text-slate-500">{course.category} 路 {course.level}</p></div></Link>)}</div>}</div>;
}

function PublicProfilePanel({ profile, status, onFollow }: { profile: StudentPublicProfile | null; status: string; onFollow: (id: number, following: boolean) => void }) {
  if (status) return <div className="panel rounded-lg p-5 text-sm font-bold text-slate-500">{status}</div>;
  if (!profile) return null;
  return <div className="panel rounded-lg p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={profile.profile.full_name} url={profile.profile.avatar_url} /><div><p className="text-sm font-black text-coral">{ui.publicProfile}</p><h3 className="text-xl font-black text-ink">{profile.profile.full_name}</h3></div></div><button type="button" onClick={() => onFollow(profile.profile.id, profile.is_following)} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"><UserPlus size={16} />{profile.is_following ? ui.following : ui.follow}</button></div><p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-600">{profile.profile.bio || ui.bioEmpty}</p><CourseStrip title={ui.nowLearning} courses={profile.active_courses.map((item) => item.course)} emptyText={ui.noCourses} /><PostFeed posts={profile.posts} /></div>;
}

function NotesPanel({ notes, status, isLoading }: { notes: StudentLearningNote[]; status: string; isLoading: boolean }) {
  const groups = useMemo(() => groupNotesByCourse(notes), [notes]);
  return <section className="panel rounded-lg p-5"><SectionHeader eyebrow={ui.notes} title={ui.notesTitle} description={status} />{isLoading ? <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />{ui.loading}</div> : groups.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><Feather className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-black text-ink">{ui.noNotes}</p><p className="mt-2 text-sm leading-7 text-slate-500">{ui.noNotesText}</p></div> : <div className="grid gap-4">{groups.map((group) => <article key={group.course.course_id} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4">{group.course.course_image_url ? <img src={group.course.course_image_url} alt={group.course.course_title} className="h-20 w-28 rounded-lg object-cover" /> : null}<div className="min-w-0 flex-1"><h3 className="truncate text-xl font-black text-ink">{group.course.course_title}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{group.notes.length} {ui.noteCount}</p></div><Link href={`/learn/${group.course.course_slug}`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white">{ui.viewCourse}<ArrowRight size={16} /></Link></div><div className="grid gap-3 p-4">{group.notes.map((note) => <details key={note.id} className="group rounded-lg border border-slate-100 bg-white p-4 open:bg-slate-50"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-mint">{ui.chapter} {note.chapter_position}</p><h4 className="mt-1 text-lg font-black text-ink">{note.chapter_title}</h4></div><p className="text-xs font-bold text-slate-400">{ui.updatedAt} {formatDate(note.updated_at)}</p></div></summary><div className="mt-4 rounded-lg bg-white p-4 text-sm leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: note.content }} /></details>)}</div></article>)}</div>}</section>;
}





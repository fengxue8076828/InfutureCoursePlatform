"use client";

import {
  ArrowUpRight,
  Bell,
  Bold,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Database,
  Edit3,
  FileText,
  GripVertical,
  HelpCircle,
  ImagePlus,
  Italic,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListOrdered,
  LogOut,
  Menu,
  Newspaper,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Timer,
  List,
  Trophy,
  Video,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useDeleteConfirmation } from "./DeleteConfirmDialog";
import { API_BASE_URL, apiConnectionErrorMessage } from "@/lib/api-config";
import { uploadFormDataWithProgress, type UploadProgress } from "@/lib/upload";

import { MathText } from "@/components/MathText";
import {
  adminAccount,
  adminBlogPosts,
  adminInstitution,
  courseRankings,
  dashboardRanges,
  fallbackAdminQuestions,
  institutionCategoryOptions,
  teacherUsers,
  usefulMetrics
} from "@/lib/admin-data";
import {
  clearAdminSession,
  getAdminRequestHeaders,
  getAdminSessionUser,
  getAdminSessionUserId,
  isAdminSessionValid,
  refreshAdminSessionActivity
} from "@/lib/admin-session";

import { QuestionBankManager } from "./QuestionBankManager";

type ModuleKey =
  | "dashboard"
  | "institution"
  | "courseCategories"
  | "activities"
  | "learningPaths"
  | "mockExams"
  | "competitions"
  | "cancellations"
  | "courses"
  | "questions"
  | "teachers"
  | "users"
  | "grading"
  | "blogs";

const menuItems: Array<{ key: ModuleKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "主页面板", icon: LayoutDashboard },
  { key: "institution", label: "机构信息", icon: Building2 },
  { key: "users", label: "用户权限管理", icon: ShieldCheck },
  { key: "courseCategories", label: "课程类别管理", icon: ListChecks },
  { key: "activities", label: "活动管理", icon: CalendarDays },
  { key: "learningPaths", label: "学习路径管理", icon: List },
  { key: "mockExams", label: "模拟考试管理", icon: Timer },
  { key: "competitions", label: "竞赛管理", icon: Trophy },
  { key: "cancellations", label: "退订管理", icon: ClipboardCheck },
  { key: "courses", label: "课程管理", icon: BookOpen },
  { key: "questions", label: "题库管理", icon: Database },
  { key: "teachers", label: "老师管理", icon: Users },
  { key: "grading", label: "测验批改", icon: ClipboardCheck },
  { key: "blogs", label: "博客管理", icon: Newspaper }
];

const moduleLabels = menuItems.reduce<Record<ModuleKey, string>>((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {} as Record<ModuleKey, string>);

const COURSE_DRAFT_STORAGE_KEY = "infuture-admin-course-draft";
const ADMIN_SELECTED_COURSE_ID_STORAGE_KEY = "infuture-admin-selected-course-id";
const ADMIN_LOGO_STORAGE_KEY = "infuture-admin-logo-url";
const ADMIN_INSTITUTION_NAME_STORAGE_KEY = "infuture-admin-institution-name";
const ADMIN_PROFILE_STORAGE_KEY = "infuture-admin-profile";
const COURSE_CATEGORY_CHANGE_EVENT = "infuture-course-categories-change";
const QUESTION_BANK_CHANGE_EVENT = "infuture-question-bank-change";
const COURSE_CONTENT_REFRESH_EVENT = "infuture-course-content-change";
const ADMIN_INSTITUTION_TAB_EVENT = "infuture-admin-institution-tab";
const COURSE_CONTENT_REFRESH_STORAGE_KEY = "infuture-course-content-version";
const COURSE_CONTENT_BROADCAST_CHANNEL = "infuture-course-content";
const DEFAULT_TEACHER_AVATAR_URL = "/avatars/default-teacher.svg";
const DEFAULT_ADMIN_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='28' fill='%23f1f5f9'/%3E%3Ccircle cx='80' cy='59' r='28' fill='%2394a3b8'/%3E%3Cpath d='M35 132c6-27 24-43 45-43s39 16 45 43' fill='%2394a3b8'/%3E%3C/svg%3E";

const profileRegionOptions = ["欧洲", "北美洲", "亚洲"];

function normalizeProfileRegion(region?: string | null) {
  const value = (region ?? "").trim();
  if (!value || value.toLowerCase() === "europe") {
    return "欧洲";
  }
  if (value.toLowerCase() === "north america") {
    return "北美洲";
  }
  if (value.toLowerCase() === "asia") {
    return "亚洲";
  }
  return profileRegionOptions.includes(value) ? value : "欧洲";
}

type CourseDraft = {
  courseId: number;
  title: string;
  category: string;
  level: string;
  priceEurMonthly: number;
  expectedDurationDays: number;
  coverUrl: string;
  teacher: string;
  teacherId: number | null;
  introVideoUrl: string;
  description: string;
  chapters: CourseChapterDraft[];
};

type CoursePublicationStatus = "draft" | "published" | "archived";

type AdminCourseSummary = {
  id: number;
  title: string;
  category: string;
  level: string;
  teacher: string;
  teacherId: number | null;
  priceEurMonthly: number;
  expectedDurationDays: number;
  image: string;
  status: string;
  statusValue: CoursePublicationStatus;
  institutionId: number | null;
};

type LearningPathStatus = "draft" | "published" | "archived";

type AdminLearningPath = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  coverUrl: string;
  introVideoUrl: string;
  audience: string;
  level: string;
  status: LearningPathStatus;
  institutionName: string;
  courseIds: number[];
  courses: AdminCourseSummary[];
  createdAt: string;
  updatedAt: string;
};

type ApiLearningPath = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  cover_url: string;
  intro_video_url: string;
  audience: string;
  level: string;
  status: LearningPathStatus;
  institution: { name: string };
  courses: Array<{
    id: number;
    position: number;
    course: ApiCourseCard;
  }>;
  created_at: string;
  updated_at: string;
};

type ActivityMode = "online" | "offline";
type ActivityRegistrationStatus = "open" | "closed";

type AdminActivityRegistration = {
  id: number;
  activityId: number;
  studentName: string;
  studentEmail: string;
  phone: string;
  note: string;
  createdAt: string;
};

type AdminActivity = {
  id: number;
  institutionId: number;
  institutionName: string;
  teacherId: number | null;
  teacherName: string;
  teacherTitle: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  mode: ActivityMode;
  meetingUrl: string;
  location: string;
  audience: string;
  registrationStatus: ActivityRegistrationStatus;
  capacity: string;
  registrationsCount: number;
  registrations: AdminActivityRegistration[];
  createdAt: string;
  updatedAt: string;
};

type ApiAdminActivity = {
  id: number;
  institution_id: number;
  institution_name: string;
  teacher_id?: number | null;
  teacher?: {
    id: number;
    name: string;
    title?: string | null;
  } | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at?: string | null;
  mode: ActivityMode;
  meeting_url?: string | null;
  location?: string | null;
  audience?: string | null;
  registration_status: ActivityRegistrationStatus;
  capacity?: number | null;
  registrations_count: number;
  registrations: Array<{
    id: number;
    activity_id: number;
    student_name: string;
    student_email: string;
    phone?: string | null;
    note?: string | null;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
};

type ExamPaperKind = "mock_exam" | "competition";
type ExamPaperStatus = "draft" | "published" | "archived";
type ExamPaperSourceType = "mock" | "past_paper";

type AdminExamPaperQuestion = {
  id: number;
  position: number;
  points: number;
  question: CourseQuestion;
};

type AdminExamSubmission = {
  id: number;
  studentName: string;
  studentEmail: string;
  score: number;
  totalScore: number;
  status: "submitted" | "pending_manual" | "graded";
  submittedAt: string;
};

type AdminCompetitionRegistration = {
  id: number;
  studentName: string;
  studentEmail: string;
  phone: string;
  note: string;
  createdAt: string;
};

type AdminCompetitionPrize = {
  rank: number;
  prizeType: string;
  description: string;
};

type AdminExamPaper = {
  id: number;
  slug: string;
  title: string;
  description: string;
  coverUrl: string;
  instructions: string;
  audience: string;
  kind: ExamPaperKind;
  sourceType: ExamPaperSourceType;
  pastYear: string;
  difficulty: string;
  prizes: AdminCompetitionPrize[];
  durationMinutes: number;
  status: ExamPaperStatus;
  startsAt: string;
  endsAt: string;
  categoryId: number | null;
  categoryName: string;
  institutionName: string;
  questions: AdminExamPaperQuestion[];
  registrations: AdminCompetitionRegistration[];
  submissions: AdminExamSubmission[];
  registrationsCount: number;
  submissionsCount: number;
  updatedAt: string;
};

type ApiExamPaper = {
  id: number;
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  instructions: string;
  audience: string;
  kind: ExamPaperKind;
  source_type?: ExamPaperSourceType | null;
  past_year?: number | null;
  difficulty?: string | null;
  prizes?: Array<{
    rank: number;
    prize_type: string;
    description: string;
  }> | null;
  duration_minutes: number;
  status: ExamPaperStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  institution: { name: string };
  category?: { id: number; name: string } | null;
  questions?: Array<{
    id: number;
    position: number;
    points: number;
    question: unknown;
  }>;
  registrations?: Array<{
    id: number;
    student_name: string;
    student_email: string;
    phone?: string | null;
    note?: string | null;
    created_at: string;
  }>;
  submissions?: Array<{
    id: number;
    student_name: string;
    student_email: string;
    score: number;
    total_score: number;
    status: "submitted" | "pending_manual" | "graded";
    submitted_at: string;
  }>;
  registrations_count: number;
  submissions_count?: number;
  updated_at: string;
};

type TeacherOption = {
  id: number;
  name: string;
  title: string;
  sourceUserId: number | null;
  slug?: string;
  bio?: string;
  avatarUrl?: string;
  region?: string;
  email?: string;
  specialties?: string[];
  institutionName?: string;
};

type CourseLessonItemType = "video" | "handout" | "exercise" | "quiz";

type CourseLessonItemBody = {
  question_ids?: number[];
  [key: string]: unknown;
};

type CourseLessonItemDraft = {
  id?: number;
  localId: string;
  title: string;
  itemType: CourseLessonItemType;
  contentUrl: string;
  body: CourseLessonItemBody;
  requiredMinutes: number;
  position: number;
};

type CourseChapterDraft = {
  id?: number;
  localId: string;
  title: string;
  summary: string;
  position: number;
  items: CourseLessonItemDraft[];
};

type CourseQuestionStatus = "draft" | "saved" | "published";

type CourseQuestion = {
  id: number;
  title: string;
  prompt: string;
  type: string;
  difficulty: string;
  skillArea: string;
  points: number;
  requiresManualGrading: boolean;
  status: CourseQuestionStatus;
  createdByUserId: number | null;
};

type CourseQuestionOwnerOption = {
  id: number;
  name: string;
  role: ManagedUserRole;
};

type ManualGradingSubmission = {
  id: number;
  userId: number;
  questionId: number;
  lessonItemId: number | null;
  answer: Record<string, unknown>;
  score: number | null;
  feedback: string | null;
  createdAt: string;
  student: {
    id: number;
    name: string;
    email: string;
  };
  course: {
    id: number | null;
    title: string;
    category: string;
    level: string;
  };
  lessonItem: {
    id: number | null;
    title: string;
    itemType: string;
  };
  question: {
    id: number;
    title: string;
    prompt: string;
    type: string;
    difficulty: string;
    points: number;
  };
};

type ManualGradingDraft = {
  score: string;
  feedback: string;
  saving: boolean;
  message: string;
};

type ManualGradingGroup = {
  key: string;
  student: ManualGradingSubmission["student"];
  course: ManualGradingSubmission["course"];
  lessonItem: ManualGradingSubmission["lessonItem"];
  submittedAt: string;
  submissions: ManualGradingSubmission[];
};

type AdminUploadKind =
  | "course_cover"
  | "course_intro_video"
  | "lesson_video"
  | "handout"
  | "logo"
  | "question_media"
  | "teacher_certificate";

type AdminMetricChange = {
  current: number;
  previous: number;
  growth_percent: number;
};

type AdminCourseRanking = {
  course_id: number;
  title: string;
  teacher: string;
  value: number;
  revenue_eur: number;
  growth_percent: number;
  rating_average: number;
  subscriptions: number;
};

type AdminOverview = {
  total_courses: number;
  active_subscriptions: number;
  monthly_recurring_revenue_eur: number;
  pending_manual_grading: number;
  total_subscriptions: number;
  monthly_subscription_growth: AdminMetricChange;
  weekly_subscription_growth: AdminMetricChange;
  total_revenue_eur: number;
  current_month_revenue_eur: number;
  average_monthly_learning_minutes: number;
  on_time_completion_rate: number;
  average_cancellation_rate: number;
  published_courses: number;
  draft_courses: number;
  total_questions: number;
  total_teachers: number;
  total_exam_papers: number;
  total_competitions: number;
  pending_cancellations: number;
  subscription_rankings: AdminCourseRanking[];
  revenue_rankings: AdminCourseRanking[];
  monthly_growth_rankings: AdminCourseRanking[];
  satisfaction_rankings: AdminCourseRanking[];
};

type SubscriptionCancellationRequest = {
  id: number;
  subscription_id: number;
  course_id: number;
  course_title: string;
  student_name: string;
  student_email: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | string;
  admin_note: string;
  created_at: string;
  reviewed_at?: string | null;
};

type ApiCourseDetail = {
  id: number;
  title: string;
  category: string;
  level: string;
  price_eur_monthly?: number;
  expected_duration_days?: number;
  status?: CoursePublicationStatus;
  description?: string;
  hero_image_url: string;
  intro_video_url?: string;
  institution?: { id: number };
  teacher?: { id: number; name: string; title?: string };
  chapters?: Array<{
    id: number;
    title: string;
    summary: string;
    position: number;
    items: Array<{
      id: number;
      title: string;
      item_type: CourseLessonItemType;
      content_url: string | null;
      body: CourseLessonItemBody;
      required_minutes: number;
      position: number;
    }>;
  }>;
};

type ApiCourseCard = {
  id: number;
  title: string;
  category: string;
  level: string;
  price_eur_monthly?: number;
  expected_duration_days?: number;
  status?: CoursePublicationStatus;
  hero_image_url: string;
  institution?: { id: number };
  teacher?: { id: number; name: string; title?: string };
};

type CourseCategory = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  position: number;
  isActive: boolean;
};

type ApiCourseCategory = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  position: number;
  is_active: boolean;
};

type CourseCategoryDraft = {
  id: number;
  parentId: number | null;
  name: string;
  position: number;
  isActive: boolean;
};

type ApiTeacher = {
  id: number;
  name: string;
  slug?: string;
  title: string;
  bio?: string;
  avatar_url?: string;
  region?: string;
  specialties?: {
    source_user_id?: number;
    email?: string;
    items?: unknown;
    [key: string]: unknown;
  } | null;
  institution?: {
    id: number;
    name: string;
    region?: string | null;
    category?: string | null;
  } | null;
};

type AdminRoleValue = "super_admin" | "institution_admin" | "teacher" | "student";

type AdminTeacherCertificate = {
  name: string;
  description: string;
  imageUrl: string;
};

type ApiAdminTeacherCertificate = {
  name?: string | null;
  description?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
};

type AdminTeacherProfile = {
  highestEducation: string;
  graduationSchool: string;
  currentPosition: string;
  employmentHistory: string;
  teachingYears: string;
  professionalTitle: string;
  certificates: AdminTeacherCertificate[];
};

type ApiAdminTeacherProfile = {
  highest_education?: string | null;
  graduation_school?: string | null;
  current_position?: string | null;
  employment_history?: string | null;
  teaching_years?: string | null;
  professional_title?: string | null;
  certificates?: Array<ApiAdminTeacherCertificate | string> | null;
};
type AdminProfile = {
  id: number | null;
  institutionId: number | null;
  name: string;
  email: string;
  role: string;
  roleValue: AdminRoleValue;
  title: string;
  phone: string;
  region: string;
  bio: string;
  avatar: string;
  teacherProfile: AdminTeacherProfile;
};

type ApiAdminProfile = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  institution_id: number | null;
  title: string | null;
  phone: string | null;
  region: string | null;
  bio: string | null;
  teacher_profile?: ApiAdminTeacherProfile | null;
};

type ManagedUserRole = "super_admin" | "institution_admin" | "teacher";

type ManagedUser = {
  id: number;
  email: string;
  fullName: string;
  role: ManagedUserRole;
  title: string;
  phone: string;
  region: string;
  bio: string;
  isActive: boolean;
};

type ApiManagedUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  title: string | null;
  phone: string | null;
  region: string | null;
  bio: string | null;
  is_active: boolean;
};

type ManagedUserSaveResult =
  | { user: ManagedUser; error?: never }
  | { user?: never; error: string };

type AdminPasswordCodeResult =
  | { ok: true; message: string; expiresInSeconds: number; demoCode?: string | null }
  | { ok: false; message: string };

type AdminPasswordUpdateResult =
  | { ok: true; profile: AdminProfile }
  | { ok: false; message: string };

type InstitutionDraft = {
  name: string;
  logoUrl: string;
  category: string;
  institutionType: "individual" | "organization";
  payoutMode: "partner" | "platform";
  region: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  contactPerson: string;
  description: string;
  serviceAgreementAccepted: boolean;
  gdprAgreementAccepted: boolean;
  feeAgreementAccepted: boolean;
  verificationStatus: string;
  stripeAccountId: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
};

type ApiInstitution = {
  id: number;
  name: string;
  slug: string;
  logo_url: string;
  category: string;
  institution_type?: "individual" | "organization";
  payout_mode?: "partner" | "platform";
  region: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_person: string | null;
  description: string;
  service_agreement_accepted?: boolean;
  gdpr_agreement_accepted?: boolean;
  fee_agreement_accepted?: boolean;
  verification_status?: string;
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_details_submitted?: boolean;
};

type StripeConnectOnboardingResponse = {
  url: string;
  institution: ApiInstitution;
};
type StripeDashboardLinkResponse = StripeConnectOnboardingResponse;

type StripeBalanceAmount = {
  currency: string;
  amount: number;
};

type StripeRequirements = {
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
  disabled_reason: string | null;
};

type AdminSubscriptionPayment = {
  id: number;
  course_title: string;
  student_name: string;
  student_email: string;
  status: string;
  amount_eur_monthly: number;
  platform_fee_percent: number;
  net_amount_eur_monthly: number;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  current_period_start: string;
  current_period_end: string | null;
  created_at: string;
};


type AdminNotice = {
  id: string;
  tone: "info" | "warning" | "danger";
  title: string;
  body: string;
};
type InstitutionFinance = {
  institution: ApiInstitution;
  account_mode: "partner" | "platform" | string;
  stripe_connected: boolean;
  stripe_account_id: string | null;
  stripe_account_type: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  verification_status: string;
  requirements: StripeRequirements;
  available_balance: StripeBalanceAmount[];
  pending_balance: StripeBalanceAmount[];
  total_monthly_revenue_eur: number;
  platform_fee_monthly_eur: number;
  net_monthly_revenue_eur: number;
  subscription_payments: AdminSubscriptionPayment[];
};

const emptyAdminTeacherProfile: AdminTeacherProfile = {
  highestEducation: "",
  graduationSchool: "",
  currentPosition: "",
  employmentHistory: "",
  teachingYears: "",
  professionalTitle: "",
  certificates: []
};
const defaultAdminProfile: AdminProfile = {
  id: null,
  institutionId: adminInstitution.id,
  name: adminAccount.name,
  email: teacherUsers[0]?.email ?? "admin@example.com",
  role: adminAccount.role,
  roleValue: "super_admin",
  title: teacherUsers[0]?.title ?? "",
  phone: "",
  region: normalizeProfileRegion(adminInstitution.region),
  bio: "",
  avatar: DEFAULT_ADMIN_AVATAR,
  teacherProfile: emptyAdminTeacherProfile
};

const defaultInstitutionDraft: InstitutionDraft = {
  name: adminInstitution.name,
  logoUrl: adminInstitution.logo_url,
  category: adminInstitution.category,
  institutionType: "individual",
  payoutMode: "partner",
  region: adminInstitution.region,
  website: adminInstitution.website ?? "",
  phone: adminInstitution.phone ?? "",
  email: adminInstitution.email ?? "",
  address: adminInstitution.address ?? "",
  contactPerson: adminInstitution.contactPerson ?? "",
  description: adminInstitution.description,
  serviceAgreementAccepted: true,
  gdprAgreementAccepted: true,
  feeAgreementAccepted: true,
  verificationStatus: "not_required",
  stripeAccountId: "",
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  stripeDetailsSubmitted: false
};

function roleLabel(role: string) {
  if (role === "institution_admin") {
    return "管理员";
  }
  if (role === "super_admin") {
    return "超级管理员";
  }
  if (role === "teacher") {
    return "老师";
  }
  return role;
}

const managedUserRoleLabels: Record<ManagedUserRole, string> = {
  super_admin: "超级管理员",
  institution_admin: "管理员",
  teacher: "老师"
};

const managedUserRoleDescriptions: Record<ManagedUserRole, string> = {
  super_admin: "可访问后台所有页面",
  institution_admin: "可访问机构信息、用户权限管理、活动管理、学习路径管理",
  teacher: "可访问主页面板、课程管理、题库管理、测验批改、博客管理"
};

const managedUserRoleOptions: ManagedUserRole[] = ["super_admin", "institution_admin", "teacher"];

const menuAccessByRole: Record<ManagedUserRole, ModuleKey[]> = {
  super_admin: menuItems.map((item) => item.key),
  institution_admin: ["institution", "users", "activities", "learningPaths", "mockExams", "competitions", "cancellations"],
  teacher: ["dashboard", "learningPaths", "mockExams", "competitions", "courses", "questions", "grading", "blogs"]
};

function normalizeAdminRoleValue(role: string | undefined): AdminRoleValue {
  if (role === "super_admin" || role === "institution_admin" || role === "teacher" || role === "student") {
    return role;
  }
  if (role === "超级管理员") {
    return "super_admin";
  }
  if (role === "管理员" || role === "机构管理员") {
    return "institution_admin";
  }
  if (role === "老师") {
    return "teacher";
  }
  return defaultAdminProfile.roleValue;
}

function visibleMenuItemsForRole(role: AdminRoleValue) {
  if (role === "super_admin" || role === "institution_admin" || role === "teacher") {
    const allowedKeys = new Set(menuAccessByRole[role]);
    return menuItems.filter((item) => allowedKeys.has(item.key));
  }
  return [];
}

function resolveProfileAvatar(avatar: string | null | undefined) {
  return avatar?.trim() ? avatar : DEFAULT_ADMIN_AVATAR;
}

function institutionFromApi(institution: ApiInstitution): InstitutionDraft {
  return {
    name: institution.name,
    logoUrl: institution.logo_url || adminInstitution.logo_url,
    category: institution.category,
    institutionType: institution.institution_type === "organization" ? "organization" : "individual",
    payoutMode: institution.payout_mode === "platform" ? "platform" : "partner",
    region: institution.region,
    website: institution.website ?? "",
    phone: institution.phone ?? "",
    email: institution.email ?? "",
    address: institution.address ?? "",
    contactPerson: institution.contact_person ?? "",
    description: institution.description,
    serviceAgreementAccepted: Boolean(institution.service_agreement_accepted),
    gdprAgreementAccepted: Boolean(institution.gdpr_agreement_accepted),
    feeAgreementAccepted: Boolean(institution.fee_agreement_accepted),
    verificationStatus: institution.verification_status ?? "not_required",
    stripeAccountId: institution.stripe_account_id ?? "",
    stripeChargesEnabled: Boolean(institution.stripe_charges_enabled),
    stripePayoutsEnabled: Boolean(institution.stripe_payouts_enabled),
    stripeDetailsSubmitted: Boolean(institution.stripe_details_submitted)
  };
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toDateTimeInputValue(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function formatAdminDateTime(value: string) {
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

function createBlankActivityDraft(teachers: TeacherOption[] = [], preferredTeacherId?: number | null): AdminActivity {
  const selectedTeacher =
    (preferredTeacherId ? getTeacherById(preferredTeacherId, teachers) : null) ?? teachers[0] ?? null;
  return {
    id: -Date.now(),
    institutionId: 0,
    institutionName: "",
    teacherId: selectedTeacher?.id ?? null,
    teacherName: selectedTeacher?.name ?? "",
    teacherTitle: selectedTeacher?.title ?? "",
    title: "",
    description: "",
    startsAt: toDateTimeInputValue(),
    endsAt: "",
    mode: "online",
    meetingUrl: "",
    location: "",
    audience: "",
    registrationStatus: "open",
    capacity: "",
    registrationsCount: 0,
    registrations: [],
    createdAt: "",
    updatedAt: ""
  };
}

function activityFromApi(activity: ApiAdminActivity): AdminActivity {
  return {
    id: activity.id,
    institutionId: activity.institution_id,
    institutionName: activity.institution_name,
    teacherId: activity.teacher_id ?? activity.teacher?.id ?? null,
    teacherName: activity.teacher?.name ?? "",
    teacherTitle: activity.teacher?.title ?? "",
    title: activity.title,
    description: activity.description,
    startsAt: toDateTimeInputValue(activity.starts_at),
    endsAt: activity.ends_at ? toDateTimeInputValue(activity.ends_at) : "",
    mode: activity.mode,
    meetingUrl: activity.meeting_url ?? "",
    location: activity.location ?? "",
    audience: activity.audience ?? "",
    registrationStatus: activity.registration_status,
    capacity: activity.capacity ? String(activity.capacity) : "",
    registrationsCount: activity.registrations_count,
    registrations: activity.registrations.map((registration) => ({
      id: registration.id,
      activityId: registration.activity_id,
      studentName: registration.student_name,
      studentEmail: registration.student_email,
      phone: registration.phone ?? "",
      note: registration.note ?? "",
      createdAt: registration.created_at
    })),
    createdAt: activity.created_at,
    updatedAt: activity.updated_at
  };
}

function activityToApiPayload(activity: AdminActivity) {
  const capacity = Number(activity.capacity);
  return {
    title: activity.title.trim(),
    description: activity.description.trim(),
    starts_at: dateTimeInputToIso(activity.startsAt),
    ends_at: activity.endsAt ? dateTimeInputToIso(activity.endsAt) : null,
    mode: activity.mode,
    meeting_url: activity.mode === "online" ? optionalText(activity.meetingUrl) : null,
    location: activity.mode === "offline" ? optionalText(activity.location) : null,
    audience: optionalText(activity.audience),
    registration_status: activity.registrationStatus,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
    teacher_id: activity.teacherId
  };
}

function createBlankExamPaperDraft(kind: ExamPaperKind): AdminExamPaper {
  const now = Date.now();
  return {
    id: -now,
    slug: "",
    title: kind === "competition" ? "新建竞赛" : "新建模拟考试",
    description: "",
    coverUrl: "",
    instructions: "请在规定时间内完成答题，提交前请确认所有题目已经作答。",
    audience: "",
    kind,
    sourceType: "mock",
    pastYear: "",
    difficulty: "",
    prizes: [],
    durationMinutes: kind === "competition" ? 90 : 60,
    status: "draft",
    startsAt: kind === "competition" ? toDateTimeInputValue() : "",
    endsAt: kind === "competition" ? toDateTimeInputValue(new Date(now + 3 * 60 * 60 * 1000).toISOString()) : "",
    categoryId: null,
    categoryName: "",
    institutionName: "",
    questions: [],
    registrations: [],
    submissions: [],
    registrationsCount: 0,
    submissionsCount: 0,
    updatedAt: ""
  };
}

function examPaperFromApi(paper: ApiExamPaper): AdminExamPaper {
  return {
    id: paper.id,
    slug: paper.slug,
    title: paper.title,
    description: paper.description ?? "",
    coverUrl: paper.cover_url ?? "",
    instructions: paper.instructions ?? "",
    audience: paper.audience ?? "",
    kind: paper.kind,
    sourceType: paper.source_type ?? "mock",
    pastYear: paper.past_year ? String(paper.past_year) : "",
    difficulty: paper.difficulty ?? "",
    prizes: (paper.prizes ?? []).map((prize) => ({
      rank: prize.rank,
      prizeType: prize.prize_type,
      description: prize.description
    })),
    durationMinutes: paper.duration_minutes,
    status: paper.status,
    startsAt: paper.starts_at ? toDateTimeInputValue(paper.starts_at) : "",
    endsAt: paper.ends_at ? toDateTimeInputValue(paper.ends_at) : "",
    categoryId: paper.category?.id ?? null,
    categoryName: paper.category?.name ?? "",
    institutionName: paper.institution?.name ?? "",
    questions: (paper.questions ?? [])
      .map((link) => {
        const question = normalizeQuestionForCoursePicker(link.question);
        return question
          ? {
              id: link.id,
              position: link.position,
              points: link.points,
              question
            }
          : null;
      })
      .filter((link): link is AdminExamPaperQuestion => Boolean(link)),
    registrations: (paper.registrations ?? []).map((registration) => ({
      id: registration.id,
      studentName: registration.student_name,
      studentEmail: registration.student_email,
      phone: registration.phone ?? "",
      note: registration.note ?? "",
      createdAt: registration.created_at
    })),
    submissions: (paper.submissions ?? []).map((submission) => ({
      id: submission.id,
      studentName: submission.student_name,
      studentEmail: submission.student_email,
      score: submission.score,
      totalScore: submission.total_score,
      status: submission.status,
      submittedAt: submission.submitted_at
    })),
    registrationsCount: paper.registrations_count,
    submissionsCount: paper.submissions_count ?? 0,
    updatedAt: paper.updated_at
  };
}

function examPaperToApiPayload(paper: AdminExamPaper) {
  const pastYear = Number(paper.pastYear);
  const basePayload = {
    title: paper.title.trim(),
    description: paper.description.trim(),
    cover_url: paper.coverUrl.trim(),
    instructions: paper.instructions.trim(),
    audience: paper.audience.trim(),
    duration_minutes: Math.max(1, Number(paper.durationMinutes) || 60),
    status: paper.status,
    category_id: paper.categoryId,
    questions: paper.questions.map((link) => ({
      question_id: link.question.id,
      points_override: link.points
    }))
  };

  if (paper.kind === "competition") {
    return {
      ...basePayload,
      difficulty: paper.difficulty.trim(),
      prizes: paper.prizes
        .map((prize) => ({
          rank: Math.max(1, Number(prize.rank) || 1),
          prize_type: prize.prizeType.trim() || "item",
          description: prize.description.trim()
        }))
        .filter((prize) => prize.description || prize.prize_type),
      starts_at: paper.startsAt ? dateTimeInputToIso(paper.startsAt) : null,
      ends_at: paper.endsAt ? dateTimeInputToIso(paper.endsAt) : null
    };
  }

  return {
    ...basePayload,
    kind: paper.kind,
    source_type: paper.sourceType,
    past_year: paper.sourceType === "past_paper" && Number.isFinite(pastYear) ? pastYear : null,
    starts_at: null,
    ends_at: null
  };
}

function institutionToApiPayload(draft: InstitutionDraft) {
  return {
    name: draft.name.trim(),
    logo_url: draft.logoUrl.trim() || adminInstitution.logo_url,
    region: draft.region.trim() || "Europe",
    website: optionalText(draft.website),
    phone: optionalText(draft.phone),
    email: optionalText(draft.email),
    address: optionalText(draft.address),
    contact_person: optionalText(draft.contactPerson),
    description: draft.description.trim()
  };
}

function persistAdminBrandFromInstitution(draft: InstitutionDraft) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADMIN_LOGO_STORAGE_KEY, draft.logoUrl || adminInstitution.logo_url);
  window.localStorage.setItem(ADMIN_INSTITUTION_NAME_STORAGE_KEY, draft.name || adminInstitution.name);
  window.dispatchEvent(new Event("infuture-admin-brand-change"));
}

async function fetchAdminInstitution(): Promise<InstitutionDraft | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution`, {
      headers: getAdminRequestHeaders(),
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }
    return institutionFromApi((await response.json()) as ApiInstitution);
  } catch {
    return null;
  }
}

async function saveAdminInstitution(draft: InstitutionDraft): Promise<InstitutionDraft | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution`, {
      method: "PUT",
      headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(institutionToApiPayload(draft))
    });
    if (!response.ok) {
      return null;
    }
    return institutionFromApi((await response.json()) as ApiInstitution);
  } catch {
    return null;
  }
}

async function startStripeConnectOnboarding(): Promise<{ draft?: InstitutionDraft; url?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution/stripe/connect`, {
      method: "POST",
      headers: getAdminRequestHeaders()
    });
    if (!response.ok) {
      return { error: await readAdminApiErrorMessage(response, "Stripe 认证入口创建失败，请确认后端已配置 Stripe。") };
    }
    const payload = (await response.json()) as Partial<StripeConnectOnboardingResponse>;
    if (!payload.institution || !payload.url) {
      return { error: "Stripe 认证入口创建失败：服务器返回数据格式不正确。" };
    }
    return { draft: institutionFromApi(payload.institution), url: payload.url };
  } catch (error) {
    return { error: apiConnectionErrorMessage(`Stripe 操作失败${error instanceof Error ? `：${error.message}` : ""}`) };
  }
}

async function fetchInstitutionFinance(): Promise<{ finance?: InstitutionFinance; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution/finance`, {
      headers: getAdminRequestHeaders(),
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await readAdminApiErrorMessage(response, "财务数据读取失败。") };
    }
    return { finance: (await response.json()) as InstitutionFinance };
  } catch {
    return { error: apiConnectionErrorMessage("无法读取 Stripe 财务信息") };
  }
}

function buildAdminStripeFinanceNotifications(finance: InstitutionFinance): AdminNotice[] {
  const notices: AdminNotice[] = [];
  const requirements = finance.requirements;
  const requiredNow = requirements.currently_due.length + requirements.past_due.length;
  const requiredLater = requirements.eventually_due.length;

  if (!finance.stripe_connected && finance.account_mode !== "platform") {
    notices.push({
      id: "stripe-not-connected",
      tone: "info",
      title: "Stripe \u6536\u6b3e\u8d26\u6237\u672a\u8fde\u63a5",
      body: "\u8bfe\u7a0b\u53ef\u4ee5\u6b63\u5e38\u53d1\u5e03\uff0c\u4f46\u5b66\u751f\u4ed8\u6b3e\u548c\u673a\u6784\u5206\u8d26\u9700\u8981\u8fde\u63a5 Stripe \u6536\u6b3e\u8d26\u6237\u3002"
    });
  }

  if (requirements.disabled_reason) {
    notices.push({
      id: "stripe-disabled",
      tone: "danger",
      title: "Stripe \u8d26\u6237\u5b58\u5728\u9650\u5236",
      body: `Stripe \u8fd4\u56de\u9650\u5236\u539f\u56e0\uff1a${requirements.disabled_reason}\u3002\u8bf7\u8fdb\u5165\u8d22\u52a1\u4e2d\u5fc3\u7ee7\u7eed\u5b8c\u6210\u9a8c\u8bc1\u3002`
    });
  }

  if (requirements.past_due.length) {
    notices.push({
      id: "stripe-past-due",
      tone: "danger",
      title: "Stripe \u8d44\u6599\u5df2\u903e\u671f",
      body: `\u6709 ${requirements.past_due.length} \u9879\u8d44\u6599\u5df2\u903e\u671f\uff0c\u53ef\u80fd\u5f71\u54cd\u6536\u6b3e\u6216\u63d0\u73b0\u3002\u8bf7\u5c3d\u5feb\u5230 Stripe \u540e\u53f0\u8865\u5145\u3002`
    });
  }

  if (requirements.currently_due.length) {
    notices.push({
      id: "stripe-currently-due",
      tone: "warning",
      title: "Stripe \u8981\u6c42\u8865\u5145\u8d44\u6599",
      body: `\u5f53\u524d\u6709 ${requirements.currently_due.length} \u9879\u8d44\u6599\u9700\u8981\u8865\u5145\u3002\u5230\u671f\u524d\u672a\u5b8c\u6210\u53ef\u80fd\u5f71\u54cd\u63d0\u73b0\u6216\u6536\u6b3e\u80fd\u529b\u3002`
    });
  }

  if (finance.stripe_connected && !finance.payouts_enabled) {
    notices.push({
      id: "stripe-payouts-disabled",
      tone: "warning",
      title: "Stripe \u63d0\u73b0\u6682\u672a\u5f00\u542f",
      body: "Stripe \u5f53\u524d\u6ca1\u6709\u5f00\u542f payouts_enabled\u3002\u8bfe\u7a0b\u4ecd\u53ef\u53d1\u5e03\uff0c\u4f46\u63d0\u73b0\u53ef\u80fd\u9700\u8981\u5148\u5b8c\u6210 Stripe \u8981\u6c42\u7684\u8d44\u6599\u8865\u5145\u3002"
    });
  }

  if (finance.stripe_connected && !finance.charges_enabled) {
    notices.push({
      id: "stripe-charges-disabled",
      tone: "warning",
      title: "Stripe \u6536\u6b3e\u6682\u672a\u5f00\u542f",
      body: "Stripe \u5f53\u524d\u6ca1\u6709\u5f00\u542f charges_enabled\u3002\u8bf7\u5728\u8d22\u52a1\u4e2d\u5fc3\u8fdb\u5165 Stripe \u540e\u53f0\u67e5\u770b\u9700\u8981\u8865\u5145\u7684\u4fe1\u606f\u3002"
    });
  }

  if (requirements.pending_verification.length) {
    notices.push({
      id: "stripe-pending-verification",
      tone: "info",
      title: "Stripe \u6b63\u5728\u5ba1\u6838\u8d44\u6599",
      body: `\u6709 ${requirements.pending_verification.length} \u9879\u8d44\u6599\u6b63\u5728 Stripe \u5ba1\u6838\u4e2d\u3002`
    });
  }

  if (requiredLater && !requiredNow) {
    notices.push({
      id: "stripe-eventually-due",
      tone: "info",
      title: "Stripe \u540e\u7eed\u53ef\u80fd\u9700\u8981\u8865\u5145\u8d44\u6599",
      body: `Stripe \u63d0\u793a\u540e\u7eed\u53ef\u80fd\u9700\u8981\u8865\u5145 ${requiredLater} \u9879\u8d44\u6599\uff0c\u5efa\u8bae\u5b9a\u671f\u67e5\u770b\u8d22\u52a1\u4e2d\u5fc3\u3002`
    });
  }

  return notices.slice(0, 8);
}

async function createStripeDashboardLink(): Promise<{ draft?: InstitutionDraft; url?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution/stripe/login-link`, {
      method: "POST",
      headers: getAdminRequestHeaders()
    });
    if (!response.ok) {
      return { error: await readAdminApiErrorMessage(response, "Stripe 收款账户管理入口创建失败。") };
    }
    const payload = (await response.json()) as Partial<StripeDashboardLinkResponse>;
    if (!payload.institution || !payload.url) {
      return { error: "Stripe 收款账户管理入口创建失败：服务器返回数据格式不正确。" };
    }
    return { draft: institutionFromApi(payload.institution), url: payload.url };
  } catch {
    return { error: apiConnectionErrorMessage("Stripe 收款账户入口创建失败") };
  }
}

async function syncStripeConnectStatus(): Promise<{ draft?: InstitutionDraft; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/institution/stripe/sync`, {
      method: "POST",
      headers: getAdminRequestHeaders()
    });
    if (!response.ok) {
      return { error: await readAdminApiErrorMessage(response, "Stripe 认证状态刷新失败。") };
    }
    return { draft: institutionFromApi((await response.json()) as ApiInstitution) };
  } catch {
    return { error: apiConnectionErrorMessage("Stripe 操作失败") };
  }
}
function profileFromApi(profile: ApiAdminProfile): AdminProfile {
  const roleValue = normalizeAdminRoleValue(profile.role);
  return {
    id: profile.id,
    institutionId: profile.institution_id,
    name: profile.full_name,
    email: profile.email,
    role: roleLabel(roleValue),
    roleValue,
    title: profile.title ?? defaultAdminProfile.title,
    phone: profile.phone ?? defaultAdminProfile.phone,
    region: normalizeProfileRegion(profile.region ?? defaultAdminProfile.region),
    bio: profile.bio ?? defaultAdminProfile.bio,
    avatar: resolveProfileAvatar(profile.avatar_url),
    teacherProfile: teacherProfileFromApi(profile.teacher_profile)
  };
}

async function fetchAdminProfile(): Promise<AdminProfile | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/profile`, {
      headers: getAdminRequestHeaders(),
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }
    return profileFromApi((await response.json()) as ApiAdminProfile);
  } catch {
    return null;
  }
}

async function saveAdminProfile(profile: AdminProfile): Promise<AdminProfile | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/profile`, {
      method: "PUT",
      headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        email: profile.email,
        full_name: profile.name,
        avatar_url: profile.avatar === DEFAULT_ADMIN_AVATAR ? null : profile.avatar,
        title: profile.title,
        phone: profile.phone,
        region: profile.region,
        bio: profile.bio,
        teacher_profile: teacherProfileToApi(profile.teacherProfile)
      })
    });
    if (!response.ok) {
      return null;
    }
    return profileFromApi((await response.json()) as ApiAdminProfile);
  } catch {
    return null;
  }
}

async function readSimpleApiDetail(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : typeof body.message === "string" ? body.message : "";
    return detail || fallback;
  } catch {
    return fallback;
  }
}

async function requestAdminPasswordChangeCode(): Promise<AdminPasswordCodeResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/profile/password-code`, {
      method: "POST",
      headers: getAdminRequestHeaders({ "Content-Type": "application/json" })
    });
    if (!response.ok) {
      return {
        ok: false,
        message: await readSimpleApiDetail(response, "验证码发送失败，请确认 FastAPI 服务正在运行。")
      };
    }
    const data = (await response.json()) as { message: string; expires_in_seconds: number; demo_code?: string | null };
    return {
      ok: true,
      message: data.message,
      expiresInSeconds: data.expires_in_seconds,
      demoCode: data.demo_code ?? null
    };
  } catch {
    return { ok: false, message: "验证码发送失败，请确认 FastAPI 服务正在运行。" };
  }
}

async function updateAdminPassword(verificationCode: string, newPassword: string): Promise<AdminPasswordUpdateResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/profile/password`, {
      method: "POST",
      headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ verification_code: verificationCode, new_password: newPassword })
    });
    if (!response.ok) {
      return {
        ok: false,
        message: await readSimpleApiDetail(response, "密码修改失败，请检查验证码是否正确。")
      };
    }
    return { ok: true, profile: profileFromApi((await response.json()) as ApiAdminProfile) };
  } catch {
    return { ok: false, message: "密码修改失败，请确认 FastAPI 服务正在运行。" };
  }
}

function normalizeManagedUserRole(role: string): ManagedUserRole {
  if (role === "super_admin" || role === "institution_admin" || role === "teacher") {
    return role;
  }
  return "teacher";
}

function managedUserFromApi(user: ApiManagedUser): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: normalizeManagedUserRole(user.role),
    title: user.title ?? "",
    phone: user.phone ?? "",
    region: user.region ?? "",
    bio: user.bio ?? "",
    isActive: user.is_active
  };
}

function questionOwnerFromApi(user: ApiManagedUser): CourseQuestionOwnerOption {
  return {
    id: user.id,
    name: user.full_name,
    role: normalizeManagedUserRole(user.role)
  };
}

function sortQuestionOwners(
  owners: CourseQuestionOwnerOption[],
  currentUserId: number | null
) {
  const uniqueOwners = Array.from(new Map(owners.map((owner) => [owner.id, owner])).values());
  if (!currentUserId) {
    return uniqueOwners;
  }
  return [...uniqueOwners].sort((left, right) => {
    if (left.id === currentUserId) {
      return -1;
    }
    if (right.id === currentUserId) {
      return 1;
    }
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}

function managedUserToApiPayload(user: ManagedUser) {
  return {
    email: user.email.trim(),
    full_name: user.fullName.trim(),
    role: user.role,
    title: optionalText(user.title),
    phone: optionalText(user.phone),
    region: optionalText(user.region),
    bio: optionalText(user.bio),
    is_active: user.isActive
  };
}

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : "";
    if (detail === "Email already exists") {
      return "用户保存失败：邮箱已存在，请换一个邮箱。";
    }
    if (
      detail === "Institution admins cannot create super admins" ||
      detail === "Institution admins cannot assign super admin"
    ) {
      return "用户保存失败：只有超级管理员才能创建或授予超级管理员角色。";
    }
    if (detail === "User belongs to another institution") {
      return "用户保存失败：不能编辑其他机构的用户。";
    }
    if (detail === "Unsupported user role") {
      return "用户保存失败：请选择有效的用户角色。";
    }
    if (detail) {
      return `用户保存失败：${detail}`;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

async function readAdminApiErrorMessage(response: Response, fallback: string) {
  const statusSuffix = response.status ? `（HTTP ${response.status}）` : "";
  let rawBody = "";

  try {
    rawBody = await response.text();
    const body = rawBody ? (JSON.parse(rawBody) as { detail?: unknown }) : {};
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    if (detail === "Email already exists") {
      return "用户保存失败：邮箱已存在，请换一个邮箱。";
    }
    if (
      detail === "Institution admins cannot create super admins" ||
      detail === "Institution admins cannot assign super admin"
    ) {
      return "用户保存失败：只有超级管理员才能创建或授予超级管理员角色。";
    }
    if (detail === "User belongs to another institution") {
      return "用户保存失败：不能编辑其他机构的用户。";
    }
    if (detail === "Unsupported user role") {
      return "用户保存失败：请选择有效的用户角色。";
    }
    if (detail === "Stripe is not configured") {
      return "Stripe 尚未配置，请检查服务器环境变量 STRIPE_SECRET_KEY。";
    }
    if (detail === "Stripe SDK is not installed") {
      return "服务器没有安装 Stripe SDK，请重新部署后端依赖。";
    }
    if (detail) {
      return detail;
    }
  } catch {
    const plainText = rawBody.trim();
    if (plainText) {
      return `${fallback}${statusSuffix}：${plainText.slice(0, 180)}`;
    }
  }

  return `${fallback}${statusSuffix}`;
}

async function fetchManagedUsers(): Promise<ManagedUser[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      headers: getAdminRequestHeaders(),
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }
    const users = (await response.json()) as ApiManagedUser[];
    return users.map(managedUserFromApi);
  } catch {
    return null;
  }
}

async function saveManagedUser(user: ManagedUser): Promise<ManagedUserSaveResult> {
  try {
    const isNew = user.id < 0;
    const payload = managedUserToApiPayload(user);
    const body = isNew
      ? {
          email: payload.email,
          full_name: payload.full_name,
          role: payload.role,
          title: payload.title,
          phone: payload.phone,
          region: payload.region,
          bio: payload.bio
        }
      : payload;
    const response = await fetch(`${API_BASE_URL}/admin/users${isNew ? "" : `/${user.id}`}`, {
      method: isNew ? "POST" : "PUT",
      headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      return {
        error: await readAdminApiErrorMessage(response, "用户保存失败，请确认邮箱未重复且 FastAPI 服务正在运行。")
      };
    }
    return { user: managedUserFromApi((await response.json()) as ApiManagedUser) };
  } catch {
    return { error: "用户保存失败：无法连接 FastAPI 服务，请确认后端正在运行。" };
  }
}

async function deleteManagedUser(userId: number): Promise<boolean> {
  if (userId < 0) {
    return true;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: "DELETE",
      headers: getAdminRequestHeaders()
    });
    return response.ok;
  } catch {
    return false;
  }
}

const courseLessonItemTypes: Array<{
  value: CourseLessonItemType;
  label: string;
  icon: typeof Video;
}> = [
  { value: "video", label: "讲课视频", icon: Video },
  { value: "handout", label: "讲义", icon: FileText },
  { value: "exercise", label: "练习", icon: ListChecks },
  { value: "quiz", label: "测验", icon: HelpCircle }
];

function courseLessonItemDefaultTitle(itemType: CourseLessonItemType) {
  return courseLessonItemTypes.find((type) => type.value === itemType)?.label ?? "课程项目";
}

const fallbackTeacherOptions: TeacherOption[] = teacherUsers.map((teacher) => ({
  id: teacher.id,
  name: teacher.name,
  title: teacher.title,
  sourceUserId: null
}));

const courseStatusLabels: Record<CoursePublicationStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

const courseStatusClasses: Record<CoursePublicationStatus, string> = {
  draft: "bg-slate-100 text-slate-500",
  published: "bg-mint/12 text-mint",
  archived: "bg-coral/12 text-coral"
};

function normalizeCourseStatus(status?: string, fallback: CoursePublicationStatus = "draft") {
  if (status === "draft" || status === "published" || status === "archived") {
    return status;
  }
  return fallback;
}

function normalizeCoursePrice(value: unknown, fallback = 39) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    return fallback;
  }
  return Math.round(price * 100) / 100;
}

function normalizeCourseDuration(value: unknown, fallback = 30) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days) || days <= 0) {
    return fallback;
  }
  return Math.min(3650, days);
}

function normalizeCourseCardFromApi(course: ApiCourseCard): AdminCourseSummary {
  const statusValue = normalizeCourseStatus(course.status, "draft");
  return {
    id: course.id,
    title: course.title,
    category: course.category,
    level: course.level,
    priceEurMonthly: normalizeCoursePrice(course.price_eur_monthly),
    expectedDurationDays: normalizeCourseDuration(course.expected_duration_days),
    teacher: course.teacher?.name ?? "未设置老师",
    teacherId: course.teacher?.id ?? null,
    image: course.hero_image_url,
    status: courseStatusLabels[statusValue],
    statusValue,
    institutionId: course.institution?.id ?? null
  };
}

function learningPathFromApi(path: ApiLearningPath): AdminLearningPath {
  const orderedCourses = [...path.courses]
    .sort((left, right) => left.position - right.position)
    .map((item) => normalizeCourseCardFromApi(item.course));
  return {
    id: path.id,
    slug: path.slug,
    title: path.title,
    subtitle: path.subtitle ?? "",
    description: path.description ?? "",
    coverUrl: path.cover_url ?? "",
    introVideoUrl: path.intro_video_url ?? "",
    audience: path.audience ?? "",
    level: path.level ?? "",
    status: path.status,
    institutionName: path.institution?.name ?? "",
    courseIds: orderedCourses.map((course) => course.id),
    courses: orderedCourses,
    createdAt: path.created_at,
    updatedAt: path.updated_at
  };
}

function createBlankLearningPathDraft(): AdminLearningPath {
  return {
    id: -Date.now(),
    slug: "",
    title: "",
    subtitle: "",
    description: "",
    coverUrl: "",
    introVideoUrl: "",
    audience: "",
    level: "",
    status: "draft",
    institutionName: "",
    courseIds: [],
    courses: [],
    createdAt: "",
    updatedAt: ""
  };
}

function learningPathToApiPayload(path: AdminLearningPath) {
  const courseIds = Array.from(new Set(path.courseIds.filter((courseId) => Number.isFinite(courseId))));
  return {
    title: path.title.trim(),
    subtitle: path.subtitle.trim(),
    description: path.description.trim(),
    cover_url: path.coverUrl.trim(),
    intro_video_url: path.introVideoUrl.trim(),
    audience: path.audience.trim(),
    level: path.level.trim(),
    status: path.status,
    course_ids: courseIds
  };
}

function courseCategoryFromApi(category: ApiCourseCategory): CourseCategory {
  return {
    id: category.id,
    parentId: category.parent_id,
    name: category.name,
    slug: category.slug,
    position: category.position,
    isActive: category.is_active
  };
}

function courseCategoryDraftFromCategory(category: CourseCategory): CourseCategoryDraft {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    position: category.position,
    isActive: category.isActive
  };
}

function createBlankCourseCategoryDraft(parentId: number | null = null): CourseCategoryDraft {
  return {
    id: -Date.now(),
    parentId,
    name: "",
    position: 0,
    isActive: true
  };
}

function courseCategoryDraftToApiPayload(category: CourseCategoryDraft) {
  return {
    parent_id: category.parentId,
    name: category.name.trim(),
    position: category.position,
    is_active: category.isActive
  };
}

function buildCourseCategoryLabel(category: CourseCategory, categories: CourseCategory[]) {
  const parent = category.parentId ? categories.find((item) => item.id === category.parentId) : null;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function selectableCourseCategoryLabels(categories: CourseCategory[]) {
  const activeCategories = categories.filter((category) => category.isActive);
  const parentIds = new Set(activeCategories.map((category) => category.parentId).filter(Boolean));
  return activeCategories
    .filter((category) => !parentIds.has(category.id))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "zh-Hans-CN"))
    .map((category) => buildCourseCategoryLabel(category, activeCategories));
}

function applyCoursePublicationStatus(
  course: AdminCourseSummary,
  statusValue: CoursePublicationStatus
): AdminCourseSummary {
  return {
    ...course,
    status: courseStatusLabels[statusValue],
    statusValue
  };
}

function normalizeTeacherFromApi(teacher: ApiTeacher): TeacherOption {
  const specialties =
    Array.isArray(teacher.specialties?.items)
      ? teacher.specialties.items.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
  return {
    id: teacher.id,
    name: teacher.name,
    title: teacher.title,
    slug: teacher.slug,
    bio: teacher.bio ?? "",
    avatarUrl: teacher.avatar_url ?? "",
    region: teacher.region ?? "",
    email: typeof teacher.specialties?.email === "string" ? teacher.specialties.email : "",
    specialties,
    institutionName: teacher.institution?.name ?? "",
    sourceUserId:
      typeof teacher.specialties?.source_user_id === "number"
        ? teacher.specialties.source_user_id
        : null
  };
}

const emptyCourseSummary: AdminCourseSummary = {
  id: 0,
  title: "",
  category: "",
  level: "",
  priceEurMonthly: 39,
  expectedDurationDays: 30,
  teacher: "",
  teacherId: null,
  image: "",
  status: courseStatusLabels.draft,
  statusValue: "draft",
  institutionId: null
};

const courseQuestionStatusLabels: Record<CourseQuestionStatus, string> = {
  draft: "草稿",
  saved: "已保存",
  published: "已发布"
};

const courseQuestionStatusClasses: Record<CourseQuestionStatus, string> = {
  draft: "bg-slate-100 text-slate-500",
  saved: "bg-skysoft/20 text-blue-700",
  published: "bg-mint/15 text-mint"
};

const courseQuestionTypeLabels: Record<string, string> = {
  fill_blank: "填空题",
  single_choice: "单选题",
  multiple_choice: "多选题",
  writing: "开放式答案题",
  coding: "代码编写题",
  true_false: "判断题",
  reading: "阅读理解题",
  listening: "听力题",
  pronunciation: "口语题",
  media_upload: "素材上传题"
};

function courseDraftStorageKey(courseId: number) {
  return `${COURSE_DRAFT_STORAGE_KEY}-${courseId}`;
}

function readSelectedCourseIdFromStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.sessionStorage.getItem(ADMIN_SELECTED_COURSE_ID_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

function persistSelectedCourseId(courseId: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(ADMIN_SELECTED_COURSE_ID_STORAGE_KEY, String(courseId));
}

function createDraftLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function isLocalNewCourse(courseId: number) {
  return courseId < 0;
}

function createCourseSlug(title: string) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "course"}-${Date.now()}`;
}

function isUploadedVideoUrl(url: string | null | undefined) {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) {
    return false;
  }
  return (
    normalizedUrl.startsWith("data:video/") ||
    normalizedUrl.startsWith("blob:") ||
    normalizedUrl.startsWith("/uploads/") ||
    normalizedUrl.includes("/uploads/")
  );
}

function getTeacherByName(name: string, teachers: TeacherOption[] = fallbackTeacherOptions) {
  return teachers.find((teacher) => teacher.name === name);
}

function getTeacherById(id: number | null | undefined, teachers: TeacherOption[] = fallbackTeacherOptions) {
  return teachers.find((teacher) => teacher.id === id);
}

function createDefaultCourseDraft(
  course: AdminCourseSummary,
  teachers: TeacherOption[] = fallbackTeacherOptions
): CourseDraft {
  const teacher =
    getTeacherById(course.teacherId, teachers) ?? getTeacherByName(course.teacher, teachers) ?? teachers[0];
  return {
    courseId: course.id,
    title: course.title,
    category: course.category,
    level: course.level,
    priceEurMonthly: course.priceEurMonthly,
    expectedDurationDays: course.expectedDurationDays,
    coverUrl: course.image,
    teacher: teacher?.name ?? course.teacher,
    teacherId: teacher?.id ?? course.teacherId ?? null,
    introVideoUrl: "",
    description: "",
    chapters: []
  };
}

function createNewCourseSummary(
  teachers: TeacherOption[] = fallbackTeacherOptions
): AdminCourseSummary {
  const teacher = teachers[0] ?? fallbackTeacherOptions[0];
  return {
    id: -Date.now(),
    title: "新建课程",
    category: "",
    level: "",
    priceEurMonthly: 39,
    expectedDurationDays: 30,
    teacher: teacher?.name ?? "未设置老师",
    teacherId: teacher?.id ?? null,
    image: "",
    status: courseStatusLabels.draft,
    statusValue: "draft",
    institutionId: null
  };
}

function normalizeLessonItemDraft(
  item: Partial<CourseLessonItemDraft>,
  fallback: CourseLessonItemDraft,
  position: number
): CourseLessonItemDraft {
  const itemType: CourseLessonItemType =
    item.itemType && courseLessonItemTypes.some((type) => type.value === item.itemType)
      ? item.itemType
      : fallback.itemType;
  const body = item.body && typeof item.body === "object" ? item.body : fallback.body;
  return {
    ...fallback,
    ...item,
    localId: item.localId || fallback.localId,
    title: item.title || fallback.title || courseLessonItemDefaultTitle(itemType),
    itemType,
    contentUrl:
      itemType === "video" && !isUploadedVideoUrl(item.contentUrl)
        ? ""
        : item.contentUrl ?? fallback.contentUrl,
    body,
    requiredMinutes: Number.isFinite(item.requiredMinutes) ? Number(item.requiredMinutes) : fallback.requiredMinutes,
    position
  };
}

function normalizeCourseDraft(
  draft: Partial<CourseDraft>,
  fallback: CourseDraft,
  teachers: TeacherOption[] = fallbackTeacherOptions
): CourseDraft {
  const normalizedChapters =
    Array.isArray(draft.chapters)
      ? draft.chapters.map((chapter, chapterIndex) => {
          const fallbackChapter = fallback.chapters[chapterIndex] ?? {
            localId: `course-${fallback.courseId}-chapter-${chapterIndex + 1}`,
            title: `第${chapterIndex + 1}章`,
            summary: "",
            position: chapterIndex + 1,
            items: []
          };
          const chapterItems =
            Array.isArray(chapter.items)
              ? chapter.items.map((item, itemIndex) =>
                  normalizeLessonItemDraft(
                    item,
                    fallbackChapter.items[itemIndex] ?? {
                      localId: `course-${fallback.courseId}-chapter-${chapterIndex + 1}-item-${itemIndex + 1}`,
                      title: `项目 ${itemIndex + 1}`,
                      itemType: "video",
                      contentUrl: "",
                      body: {},
                      requiredMinutes: 0,
                      position: itemIndex + 1
                    },
                    itemIndex + 1
                  )
                )
              : fallbackChapter.items;
          return {
            ...fallbackChapter,
            ...chapter,
            localId: chapter.localId || fallbackChapter.localId,
            title: chapter.title || fallbackChapter.title,
            summary: chapter.summary ?? fallbackChapter.summary,
            position: chapterIndex + 1,
            items: chapterItems
          };
        })
      : fallback.chapters;

  const teacher =
    getTeacherById(draft.teacherId, teachers) ??
    getTeacherByName(draft.teacher || fallback.teacher, teachers) ??
    teachers[0];
  const introVideoUrl = draft.introVideoUrl ?? "";
  return {
    ...fallback,
    ...draft,
    courseId: fallback.courseId,
    title: draft.title || fallback.title,
    category: draft.category ?? fallback.category,
    level: draft.level ?? fallback.level,
    priceEurMonthly: normalizeCoursePrice(draft.priceEurMonthly, fallback.priceEurMonthly),
    expectedDurationDays: normalizeCourseDuration(draft.expectedDurationDays, fallback.expectedDurationDays),
    coverUrl: draft.coverUrl || fallback.coverUrl,
    teacher: teacher?.name ?? draft.teacher ?? fallback.teacher,
    teacherId: teacher?.id ?? draft.teacherId ?? fallback.teacherId,
    introVideoUrl: isUploadedVideoUrl(introVideoUrl) ? introVideoUrl : fallback.introVideoUrl,
    description: draft.description ?? fallback.description,
    chapters: normalizedChapters
  };
}

function hasStoredCourseDraft(courseId: number) {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.sessionStorage.getItem(courseDraftStorageKey(courseId)));
}

function readCourseDraft(defaultDraft: CourseDraft): CourseDraft {
  if (typeof window === "undefined") {
    return defaultDraft;
  }
  try {
    const stored = window.sessionStorage.getItem(courseDraftStorageKey(defaultDraft.courseId));
    if (!stored) {
      return defaultDraft;
    }
    const parsed = JSON.parse(stored) as Partial<CourseDraft>;
    return normalizeCourseDraft(parsed, defaultDraft);
  } catch {
    return defaultDraft;
  }
}

function courseDraftForStorage(draft: CourseDraft): CourseDraft {
  return {
    ...draft,
    introVideoUrl: draft.introVideoUrl.startsWith("data:video/") ? "" : draft.introVideoUrl,
    chapters: draft.chapters.map((chapter) => ({
      ...chapter,
      items: chapter.items.map((item) => ({
        ...item,
        contentUrl:
          item.contentUrl.startsWith("data:video/") || item.contentUrl.length > 1_000_000
            ? ""
            : item.contentUrl
      }))
    }))
  };
}

function persistCourseDraft(draft: CourseDraft) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      courseDraftStorageKey(draft.courseId),
      JSON.stringify(courseDraftForStorage(draft))
    );
  } catch {
    window.sessionStorage.removeItem(courseDraftStorageKey(draft.courseId));
  }
}

function UploadProgressRing({ progress, size = 18 }: { progress: number | null; size?: number }) {
  const value = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums text-mint" aria-label={`上传进度 ${value}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{value}%</span>
    </span>
  );
}

async function uploadAdminFile(
  file: File,
  kind: AdminUploadKind,
  onProgress?: (progress: UploadProgress) => void
) {
  if (kind === "handout" && !/\.md$/i.test(file.name)) {
    throw new Error("讲义文件只支持 Markdown .md 文件。");
  }
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);

  const payload = await uploadFormDataWithProgress<{ url: string }>({
    url: `${API_BASE_URL}/admin/uploads`,
    formData,
    headers: getAdminRequestHeaders(),
    onProgress
  });

  if (!payload.url) {
    throw new Error("上传成功但服务器没有返回文件地址。");
  }
  return payload.url;
}
function uploadFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function notifyCourseContentChanged(course: { id?: number; slug?: string; status?: unknown }) {
  if (typeof window === "undefined") {
    return;
  }
  const payload = {
    courseId: course.id ?? null,
    slug: course.slug ?? "",
    status: typeof course.status === "string" ? course.status : "",
    updatedAt: Date.now()
  };
  try {
    window.localStorage.setItem(COURSE_CONTENT_REFRESH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Cross-tab refresh is optional; polling still keeps student pages current.
  }
  window.dispatchEvent(new CustomEvent(COURSE_CONTENT_REFRESH_EVENT, { detail: payload }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(COURSE_CONTENT_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  }
}

function normalizeQuestionForCoursePicker(rawQuestion: unknown): CourseQuestion | null {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    return null;
  }
  const question = rawQuestion as {
    id?: unknown;
    prompt?: unknown;
    type?: unknown;
    difficulty?: unknown;
    skill_area?: unknown;
    points?: unknown;
    requires_manual_grading?: unknown;
    status?: unknown;
    created_by_user_id?: unknown;
    content?: { title?: unknown };
  };
  if (typeof question.id !== "number") {
    return null;
  }
  const title = typeof question.content?.title === "string" ? question.content.title : "";
  const prompt = typeof question.prompt === "string" ? question.prompt : "";
  const status =
    question.status === "draft" || question.status === "saved" || question.status === "published"
      ? question.status
      : "published";
  return {
    id: question.id,
    title: title || prompt || `题目 ${question.id}`,
    prompt,
    type: typeof question.type === "string" ? question.type : "writing",
    difficulty: typeof question.difficulty === "string" ? question.difficulty : "",
    skillArea: typeof question.skill_area === "string" ? question.skill_area : "",
    points: typeof question.points === "number" ? question.points : 0,
    requiresManualGrading: question.requires_manual_grading === true,
    status,
    createdByUserId:
      typeof question.created_by_user_id === "number" ? question.created_by_user_id : null
  };
}

function normalizeManualGradingSubmission(rawSubmission: unknown): ManualGradingSubmission | null {
  if (!rawSubmission || typeof rawSubmission !== "object") {
    return null;
  }
  const submission = rawSubmission as {
    id?: unknown;
    user_id?: unknown;
    question_id?: unknown;
    lesson_item_id?: unknown;
    answer?: unknown;
    score?: unknown;
    feedback?: unknown;
    created_at?: unknown;
    user?: { id?: unknown; full_name?: unknown; email?: unknown };
    enrollment?: {
      id?: unknown;
      course?: { id?: unknown; title?: unknown; category?: unknown; level?: unknown };
    };
    lesson_item?: { id?: unknown; title?: unknown; item_type?: unknown };
    question?: {
      id?: unknown;
      prompt?: unknown;
      type?: unknown;
      difficulty?: unknown;
      points?: unknown;
      content?: { title?: unknown };
    };
  };
  if (typeof submission.id !== "number" || typeof submission.question_id !== "number") {
    return null;
  }
  const answer =
    submission.answer && typeof submission.answer === "object" && !Array.isArray(submission.answer)
      ? (submission.answer as Record<string, unknown>)
      : {};
  const questionId = typeof submission.question?.id === "number" ? submission.question.id : submission.question_id;
  const questionTitle =
    typeof submission.question?.content?.title === "string" && submission.question.content.title.trim()
      ? submission.question.content.title
      : `题目 ${questionId}`;
  return {
    id: submission.id,
    userId: typeof submission.user_id === "number" ? submission.user_id : 0,
    questionId: submission.question_id,
    lessonItemId: typeof submission.lesson_item_id === "number" ? submission.lesson_item_id : null,
    answer,
    score: typeof submission.score === "number" ? submission.score : null,
    feedback: typeof submission.feedback === "string" ? submission.feedback : null,
    createdAt: typeof submission.created_at === "string" ? submission.created_at : "",
    student: {
      id: typeof submission.user?.id === "number" ? submission.user.id : 0,
      name:
        typeof submission.user?.full_name === "string" && submission.user.full_name.trim()
          ? submission.user.full_name
          : "学生",
      email: typeof submission.user?.email === "string" ? submission.user.email : ""
    },
    course: {
      id: typeof submission.enrollment?.course?.id === "number" ? submission.enrollment.course.id : null,
      title:
        typeof submission.enrollment?.course?.title === "string" && submission.enrollment.course.title.trim()
          ? submission.enrollment.course.title
          : "未关联课程",
      category: typeof submission.enrollment?.course?.category === "string" ? submission.enrollment.course.category : "",
      level: typeof submission.enrollment?.course?.level === "string" ? submission.enrollment.course.level : ""
    },
    lessonItem: {
      id: typeof submission.lesson_item?.id === "number" ? submission.lesson_item.id : null,
      title:
        typeof submission.lesson_item?.title === "string" && submission.lesson_item.title.trim()
          ? submission.lesson_item.title
          : "未关联测验",
      itemType: typeof submission.lesson_item?.item_type === "string" ? submission.lesson_item.item_type : ""
    },
    question: {
      id: questionId,
      title: questionTitle,
      prompt: typeof submission.question?.prompt === "string" ? submission.question.prompt : "",
      type: typeof submission.question?.type === "string" ? submission.question.type : "",
      difficulty: typeof submission.question?.difficulty === "string" ? submission.question.difficulty : "",
      points: typeof submission.question?.points === "number" ? submission.question.points : 0
    }
  };
}

function formatManualGradingAnswer(answer: Record<string, unknown>) {
  const primaryAnswer = answer.answer;
  const answers = answer.answers;
  if (Array.isArray(answers)) {
    return answers.map((item, index) => `${index + 1}. ${String(item ?? "")}`).join("\n");
  }
  if (Array.isArray(primaryAnswer)) {
    return primaryAnswer.map((item, index) => `${index + 1}. ${String(item ?? "")}`).join("\n");
  }
  if (typeof primaryAnswer === "boolean") {
    return primaryAnswer ? "正确" : "错误";
  }
  if (typeof primaryAnswer === "string") {
    return primaryAnswer || "学生未填写答案";
  }
  if (answer.file && typeof answer.file === "object") {
    const file = answer.file as { fileName?: unknown; fileType?: unknown };
    return [file.fileName, file.fileType].filter((item) => typeof item === "string" && item).join(" · ");
  }
  return JSON.stringify(answer, null, 2);
}

function formatManualGradingTime(value: string) {
  if (!value) {
    return "提交时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function courseDraftFromApi(
  course: ApiCourseDetail,
  fallback: CourseDraft,
  teachers: TeacherOption[] = fallbackTeacherOptions
): CourseDraft {
  const apiDraft: Partial<CourseDraft> = {
    courseId: course.id,
    title: course.title,
    category: course.category,
    level: course.level,
    priceEurMonthly: normalizeCoursePrice(course.price_eur_monthly),
    expectedDurationDays: normalizeCourseDuration(course.expected_duration_days),
    coverUrl: course.hero_image_url,
    teacher: course.teacher?.name,
    teacherId: course.teacher?.id,
    introVideoUrl: isUploadedVideoUrl(course.intro_video_url) ? course.intro_video_url : "",
    description: course.description,
    chapters: course.chapters?.map((chapter, chapterIndex) => ({
      id: chapter.id,
      localId: `api-chapter-${chapter.id}`,
      title: chapter.title,
      summary: chapter.summary,
      position: chapter.position || chapterIndex + 1,
      items: chapter.items.map((item, itemIndex) => ({
        id: item.id,
        localId: `api-item-${item.id}`,
        title: item.title,
        itemType: item.item_type,
        contentUrl:
          item.item_type === "video" && !isUploadedVideoUrl(item.content_url)
            ? ""
            : item.content_url ?? "",
        body: item.body ?? {},
        requiredMinutes: item.required_minutes,
        position: item.position || itemIndex + 1
      }))
    }))
  };
  return normalizeCourseDraft(apiDraft, fallback, teachers);
}

function getQuestionIdsFromItem(item: CourseLessonItemDraft) {
  const questionIds = item.body.question_ids;
  return Array.isArray(questionIds)
    ? questionIds.filter((id): id is number => typeof id === "number")
    : [];
}

function courseDraftToApiPayload(
  draft: CourseDraft,
  teachers: TeacherOption[] = fallbackTeacherOptions,
  status: CoursePublicationStatus = "draft"
) {
  const plainDescription = stripRichText(draft.description);
  return {
    title: draft.title,
    subtitle: plainDescription.slice(0, 120) || `${draft.title || "新建课程"}课程`,
    category: draft.category || "未分类",
    level: draft.level || "入门",
    description: draft.description,
    hero_image_url: draft.coverUrl,
    intro_video_url: draft.introVideoUrl,
    price_eur_monthly: normalizeCoursePrice(draft.priceEurMonthly),
    expected_duration_days: normalizeCourseDuration(draft.expectedDurationDays),
    status,
    teacher_id:
      getTeacherById(draft.teacherId, teachers)?.id ??
      getTeacherByName(draft.teacher, teachers)?.id ??
      teachers[0]?.id ??
      1,
    chapters: draft.chapters.map((chapter, chapterIndex) => ({
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      position: chapterIndex + 1,
      items: chapter.items.map((item, itemIndex) => ({
        id: item.id,
        title: item.title,
        item_type: item.itemType,
        content_url: item.contentUrl || null,
        body:
          item.itemType === "exercise" || item.itemType === "quiz"
            ? { ...item.body, question_ids: getQuestionIdsFromItem(item) }
            : item.body,
        required_minutes: item.requiredMinutes,
        position: itemIndex + 1
      }))
    }))
  };
}

function courseDraftToCreatePayload(
  draft: CourseDraft,
  course: AdminCourseSummary,
  teachers: TeacherOption[] = fallbackTeacherOptions
) {
  const teacherId =
    getTeacherById(draft.teacherId, teachers)?.id ??
    getTeacherByName(draft.teacher, teachers)?.id ??
    teachers[0]?.id ??
    1;
  const plainDescription = stripRichText(draft.description);
  return {
    title: draft.title || "新建课程",
    slug: createCourseSlug(draft.title),
    subtitle: plainDescription.slice(0, 120) || `${draft.title || "新建课程"}课程`,
    description: draft.description || "新课程介绍",
    category: draft.category || course.category || "未分类",
    level: draft.level || course.level || "入门",
    hero_image_url: draft.coverUrl || course.image,
    intro_video_url: draft.introVideoUrl,
    institution_id: course.institutionId ?? adminInstitution.id,
    teacher_id: teacherId,
    price_eur_monthly: normalizeCoursePrice(draft.priceEurMonthly, course.priceEurMonthly),
    expected_duration_days: normalizeCourseDuration(draft.expectedDurationDays, course.expectedDurationDays)
  };
}

function reindexCourseChapters(chapters: CourseChapterDraft[]) {
  return chapters.map((chapter, chapterIndex) => ({
    ...chapter,
    position: chapterIndex + 1,
    items: chapter.items.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }))
  }));
}

function createNewCourseChapter(position: number): CourseChapterDraft {
  return {
    localId: createDraftLocalId("chapter"),
    title: `第${position}章`,
    summary: "",
    position,
    items: [createNewCourseLessonItem("video", 1)]
  };
}

function createNewCourseLessonItem(
  itemType: CourseLessonItemType,
  position: number
): CourseLessonItemDraft {
  return {
    localId: createDraftLocalId("item"),
    title: courseLessonItemDefaultTitle(itemType),
    itemType,
    contentUrl: "",
    body: itemType === "exercise" || itemType === "quiz" ? { question_ids: [] } : {},
    requiredMinutes: itemType === "video" ? 20 : itemType === "handout" ? 0 : 15,
    position
  };
}

function stripRichText(html: string) {
  if (!html) {
    return "";
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeightClass = "min-h-44"
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  minHeightClass?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [uploading, setUploading] = useState<"image" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) {
      return;
    }
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || "";
    }
  }, [value]);

  function syncValue() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function runCommand(command: string, commandValue?: string) {
    if (disabled) {
      return;
    }
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncValue();
  }

  function insertHtml(html: string) {
    if (disabled) {
      return;
    }
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    syncValue();
  }

  async function uploadRichMedia(file: File | undefined, mediaType: "image" | "video") {
    if (!file || disabled) {
      return;
    }
    setUploading(mediaType);
    setUploadProgress(1);
    try {
      const url = await uploadAdminFile(file, mediaType === "image" ? "question_media" : "lesson_video", (progress) => setUploadProgress(progress.percent));
      const safeName = file.name.replace(/[<>"']/g, "");
      insertHtml(
        mediaType === "image"
          ? `<p><img src="${url}" alt="${safeName}" style="max-width:100%;border-radius:12px;" /></p>`
          : `<p><video controls src="${url}" style="max-width:100%;border-radius:12px;"></video></p>`
      );
    } catch (error) {
      window.alert(uploadFailureMessage(error, "文件上传失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setUploading(null);
      setUploadProgress(null);
    }
  }

  const toolbarButtonClass =
    "focus-ring inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
  const hasContent = stripRichText(value).length > 0 || /<(img|video|iframe)\b/i.test(value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 p-2">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("bold")}
          disabled={disabled}
          className={toolbarButtonClass}
          aria-label="加粗"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("italic")}
          disabled={disabled}
          className={toolbarButtonClass}
          aria-label="斜体"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("insertUnorderedList")}
          disabled={disabled}
          className={toolbarButtonClass}
          aria-label="项目列表"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand("insertOrderedList")}
          disabled={disabled}
          className={toolbarButtonClass}
          aria-label="编号列表"
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const url = window.prompt("请输入链接地址");
            if (url) {
              runCommand("createLink", url);
            }
          }}
          disabled={disabled}
          className={toolbarButtonClass}
          aria-label="添加链接"
        >
          <Link2 size={16} />
        </button>
        <label className={`${toolbarButtonClass} cursor-pointer`}>
          {uploading === "image" ? <UploadProgressRing progress={uploadProgress} /> : <ImagePlus size={16} />}
          <span className="ml-1 hidden sm:inline">{uploading === "image" ? "上传中" : "图片"}</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled || uploading !== null}
            onChange={(event) => {
              void uploadRichMedia(event.target.files?.[0], "image");
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className={`${toolbarButtonClass} cursor-pointer`}>
          {uploading === "video" ? <UploadProgressRing progress={uploadProgress} /> : <Video size={16} />}
          <span className="ml-1 hidden sm:inline">{uploading === "video" ? "上传中" : "视频"}</span>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            disabled={disabled || uploading !== null}
            onChange={(event) => {
              void uploadRichMedia(event.target.files?.[0], "video");
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <div className="relative">
        {!hasContent && !focused ? (
          <span className="pointer-events-none absolute left-3 top-3 text-sm font-semibold text-slate-400">
            {placeholder}
          </span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={syncValue}
          onBlur={() => {
            setFocused(false);
            syncValue();
          }}
          onFocus={() => setFocused(true)}
          className={`focus-ring w-full rounded-b-lg px-3 py-3 text-sm leading-7 text-slate-700 outline-none [&_a]:font-bold [&_a]:text-coral [&_img]:my-3 [&_img]:max-w-full [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_video]:my-3 [&_video]:max-w-full ${minHeightClass} ${
            disabled ? "bg-slate-50 text-slate-500" : "bg-white"
          }`}
        />
      </div>
    </div>
  );
}

function subscribeToAdminBrand(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", callback);
  window.addEventListener("infuture-admin-brand-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("infuture-admin-brand-change", callback);
  };
}

function getAdminLogoClientSnapshot() {
  return window.localStorage.getItem(ADMIN_LOGO_STORAGE_KEY) || adminInstitution.logo_url;
}

function getAdminLogoServerSnapshot() {
  return adminInstitution.logo_url;
}

function getAdminInstitutionNameClientSnapshot() {
  return window.localStorage.getItem(ADMIN_INSTITUTION_NAME_STORAGE_KEY) || adminInstitution.name;
}

function getAdminInstitutionNameServerSnapshot() {
  return adminInstitution.name;
}

function useAdminBrand() {
  const logoUrl = useSyncExternalStore(
    subscribeToAdminBrand,
    getAdminLogoClientSnapshot,
    getAdminLogoServerSnapshot
  );
  const institutionName = useSyncExternalStore(
    subscribeToAdminBrand,
    getAdminInstitutionNameClientSnapshot,
    getAdminInstitutionNameServerSnapshot
  );
  return { logoUrl, institutionName };
}

function subscribeToAdminProfile(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", callback);
  window.addEventListener("infuture-admin-profile-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("infuture-admin-profile-change", callback);
  };
}

function getAdminProfileClientSnapshot() {
  return window.localStorage.getItem(ADMIN_PROFILE_STORAGE_KEY) ?? JSON.stringify(defaultAdminProfile);
}

function getAdminProfileServerSnapshot() {
  return JSON.stringify(defaultAdminProfile);
}

function parseAdminProfile(value: string): AdminProfile {
  try {
    const profile = { ...defaultAdminProfile, ...(JSON.parse(value) as Partial<AdminProfile>) };
    const roleValue = normalizeAdminRoleValue(profile.roleValue ?? profile.role);
    return {
      ...profile,
      roleValue,
      role: roleLabel(roleValue),
      avatar: resolveProfileAvatar(profile.avatar),
      region: normalizeProfileRegion(profile.region),
      teacherProfile: normalizeAdminTeacherProfile(profile.teacherProfile)
    };
  } catch {
    return defaultAdminProfile;
  }
}

function emptyTeacherCertificate(): AdminTeacherCertificate {
  return { name: "", description: "", imageUrl: "" };
}

function normalizeTeacherCertificate(certificate: unknown): AdminTeacherCertificate | null {
  if (typeof certificate === "string") {
    const name = certificate.trim();
    return name ? { ...emptyTeacherCertificate(), name } : null;
  }
  if (!certificate || typeof certificate !== "object") {
    return null;
  }
  const record = certificate as Record<string, unknown>;
  const name = String(record.name ?? record.title ?? "").trim();
  const description = String(record.description ?? "").trim();
  const imageUrl = String(record.imageUrl ?? record.image_url ?? record.url ?? "").trim();
  return name || description || imageUrl ? { name, description, imageUrl } : null;
}

function normalizeAdminTeacherProfile(profile?: Partial<AdminTeacherProfile> | null): AdminTeacherProfile {
  const rawCertificates = (profile as { certificates?: unknown } | null | undefined)?.certificates;
  const certificates = Array.isArray(rawCertificates)
    ? rawCertificates
        .map(normalizeTeacherCertificate)
        .filter((certificate): certificate is AdminTeacherCertificate => Boolean(certificate))
    : [];

  return {
    highestEducation: profile?.highestEducation ?? "",
    graduationSchool: profile?.graduationSchool ?? "",
    currentPosition: profile?.currentPosition ?? "",
    employmentHistory: profile?.employmentHistory ?? "",
    teachingYears: profile?.teachingYears ?? "",
    professionalTitle: profile?.professionalTitle ?? "",
    certificates
  };
}

function teacherProfileFromApi(profile?: ApiAdminTeacherProfile | null): AdminTeacherProfile {
  return normalizeAdminTeacherProfile({
    highestEducation: profile?.highest_education ?? "",
    graduationSchool: profile?.graduation_school ?? "",
    currentPosition: profile?.current_position ?? "",
    employmentHistory: profile?.employment_history ?? "",
    teachingYears: profile?.teaching_years ?? "",
    professionalTitle: profile?.professional_title ?? "",
    certificates: (profile?.certificates ?? []) as AdminTeacherCertificate[]
  });
}

function teacherProfileToApi(profile: AdminTeacherProfile) {
  const normalized = normalizeAdminTeacherProfile(profile);
  return {
    highest_education: normalized.highestEducation,
    graduation_school: normalized.graduationSchool,
    current_position: normalized.currentPosition,
    employment_history: normalized.employmentHistory,
    teaching_years: normalized.teachingYears,
    professional_title: normalized.professionalTitle,
    certificates: normalized.certificates
      .map((certificate) => ({
        name: certificate.name.trim(),
        description: certificate.description.trim(),
        image_url: certificate.imageUrl.trim()
      }))
      .filter((certificate) => certificate.name || certificate.description || certificate.image_url)
  };
}
function persistAdminProfile(profile: AdminProfile) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADMIN_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("infuture-admin-profile-change"));
}

function useAdminProfile() {
  const profileSnapshot = useSyncExternalStore(
    subscribeToAdminProfile,
    getAdminProfileClientSnapshot,
    getAdminProfileServerSnapshot
  );
  return parseAdminProfile(profileSnapshot);
}

export function AdminPortal() {
  const router = useRouter();
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const profile = useAdminProfile();
  const visibleMenuItems = useMemo(() => visibleMenuItemsForRole(profile.roleValue), [profile.roleValue]);
  const effectiveActiveModule = useMemo(() => {
    if (visibleMenuItems.some((item) => item.key === activeModule)) {
      return activeModule;
    }
    return visibleMenuItems[0]?.key ?? activeModule;
  }, [activeModule, visibleMenuItems]);

  useEffect(() => {
    if (!isAdminSessionValid()) {
      clearAdminSession();
      router.replace("/admin/login");
      return;
    }
    refreshAdminSessionActivity();
    setSessionReady(true);
  }, [router]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    let lastRefreshAt = Date.now();
    const logoutForTimeout = () => {
      clearAdminSession();
      router.replace("/admin/login");
    };
    const handleActivity = () => {
      const now = Date.now();
      if (!isAdminSessionValid(now)) {
        logoutForTimeout();
        return;
      }
      if (now - lastRefreshAt >= 30_000) {
        refreshAdminSessionActivity(now);
        lastRefreshAt = now;
      }
    };
    const checkSession = () => {
      if (!isAdminSessionValid()) {
        logoutForTimeout();
      }
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    const timer = window.setInterval(checkSession, 30_000);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.clearInterval(timer);
    };
  }, [router, sessionReady]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    let isMounted = true;
    fetchAdminProfile().then((remoteProfile) => {
      if (!isMounted || !remoteProfile) {
        return;
      }
      persistAdminProfile(remoteProfile);
    });
    return () => {
      isMounted = false;
    };
  }, [sessionReady]);

  if (!sessionReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-mist px-4 text-ink">
        <section className="panel rounded-lg p-6 text-center">
          <p className="text-sm font-semibold text-slate-500">正在检查后台登录状态...</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-mist text-ink">
      <AdminTopbar
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
      <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-5 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block">
          <AdminSidebar activeModule={effectiveActiveModule} items={visibleMenuItems} onChange={setActiveModule} />
        </aside>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <aside
              className="h-full w-80 max-w-[86vw] bg-white p-4 shadow-soft"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex justify-end">
                <button
                  aria-label="关闭菜单"
                  onClick={() => setSidebarOpen(false)}
                  className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200"
                >
                  <X size={18} />
                </button>
              </div>
              <AdminSidebar
                activeModule={effectiveActiveModule}
                items={visibleMenuItems}
                onChange={(key) => {
                  setActiveModule(key);
                  setSidebarOpen(false);
                }}
              />
            </aside>
          </div>
        ) : null}

        <main className="min-w-0">
          <AdminPageHeader
            activeModule={effectiveActiveModule}
            onOpenInstitutionFinance={() => {
              setActiveModule("institution");
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent(ADMIN_INSTITUTION_TAB_EVENT, { detail: "finance" }));
              }, 0);
            }}
          />
          <div className={effectiveActiveModule === "dashboard" ? "block" : "hidden"}>
            <RealDashboardPanel />
          </div>
          <div className={effectiveActiveModule === "institution" ? "block" : "hidden"}>
            <InstitutionPanel />
          </div>
          <div className={effectiveActiveModule === "courseCategories" ? "block" : "hidden"}>
            <CourseCategoryManagement />
          </div>
          <div className={effectiveActiveModule === "activities" ? "block" : "hidden"}>
            <ActivityManagement />
          </div>
          <div className={effectiveActiveModule === "learningPaths" ? "block" : "hidden"}>
            <LearningPathManagement />
          </div>
          <div className={effectiveActiveModule === "mockExams" ? "block" : "hidden"}>
            <ExamPaperManagement kind="mock_exam" />
          </div>
          <div className={effectiveActiveModule === "competitions" ? "block" : "hidden"}>
            <ExamPaperManagement kind="competition" />
          </div>
          <div className={effectiveActiveModule === "cancellations" ? "block" : "hidden"}>
            <CancellationManagementPanel isActive={effectiveActiveModule === "cancellations"} />
          </div>
          <div className={effectiveActiveModule === "courses" ? "block" : "hidden"}>
            <CourseManagement isActive={effectiveActiveModule === "courses"} />
          </div>
          <div className={effectiveActiveModule === "questions" ? "block" : "hidden"}>
            <QuestionBankPanel />
          </div>
          <div className={effectiveActiveModule === "teachers" ? "block" : "hidden"}>
            <TeacherManagement />
          </div>
          <div className={effectiveActiveModule === "users" ? "block" : "hidden"}>
            <UserPermissionManagement />
          </div>
          <div className={effectiveActiveModule === "grading" ? "block" : "hidden"}>
            <GradingPanel isActive={effectiveActiveModule === "grading"} />
          </div>
          <div className={effectiveActiveModule === "blogs" ? "block" : "hidden"}>
            <BlogManagement />
          </div>
        </main>
      </div>
      {profileOpen ? <ProfileEditorModal onClose={() => setProfileOpen(false)} /> : null}
    </div>
  );
}

function AdminTopbar({
  onOpenProfile,
  onOpenSidebar
}: {
  onOpenProfile: () => void;
  onOpenSidebar: () => void;
}) {
  const { logoUrl, institutionName } = useAdminBrand();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[96rem] items-center gap-4 px-4 py-3">
        <button
          aria-label="打开菜单"
          onClick={onOpenSidebar}
          className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 lg:hidden"
        >
          <Menu size={18} />
        </button>
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-16 w-[120px] place-items-center overflow-hidden rounded-lg bg-white">
            <img src={logoUrl} alt={`${institutionName} Logo`} className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="font-bold text-ink">{institutionName}</p>
            <p className="text-sm text-slate-500">Europe · 机构工作台</p>
          </div>
        </Link>
        <div className="ml-auto hidden w-full max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 md:flex">
          <Search size={17} />
          <span>搜索课程、题目、老师、文章</span>
        </div>
        <button
          onClick={onOpenProfile}
          className="focus-ring hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-bold md:inline-flex"
        >
          <Settings size={17} /> 个人资料
        </button>
        <Link
          href="/admin/login"
          onClick={clearAdminSession}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 font-bold text-white"
        >
          <LogOut size={17} /> 登出
        </Link>
      </div>
    </header>
  );
}

function AdminSidebar({
  activeModule,
  items,
  onChange
}: {
  activeModule: ModuleKey;
  items: Array<{ key: ModuleKey; label: string; icon: typeof LayoutDashboard }>;
  onChange: (key: ModuleKey) => void;
}) {
  const profile = useAdminProfile();

  return (
    <div className="panel rounded-lg p-4">
      <div className="rounded-lg bg-ink p-4 text-white">
        <p className="text-sm font-semibold text-white/70">当前登录</p>
        <div className="mt-4 flex items-center gap-3">
          <img src={profile.avatar} alt={profile.name} className="h-12 w-12 rounded-lg object-cover" />
          <div>
            <p className="font-bold">{profile.name}</p>
            <p className="text-sm text-white/60">{profile.role}</p>
          </div>
        </div>
      </div>
      <nav className="mt-4 grid gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`focus-ring flex items-center justify-between rounded-lg px-4 py-3 text-left font-bold ${
              activeModule === item.key ? "bg-mint text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="flex items-center gap-3">
              <item.icon size={19} /> {item.label}
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </nav>
    </div>
  );
}

function AdminPageHeader({
  activeModule,
  onOpenInstitutionFinance
}: {
  activeModule: ModuleKey;
  onOpenInstitutionFinance: () => void;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotice[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsStatus, setNotificationsStatus] = useState("正在读取财务通知...");

  async function loadNotifications() {
    setNotificationsLoading(true);
    const result = await fetchInstitutionFinance();
    if (result.finance) {
      const nextNotifications = buildAdminStripeFinanceNotifications(result.finance);
      setNotifications(nextNotifications);
      setNotificationsStatus(nextNotifications.length ? "Stripe 财务待办" : "当前没有 Stripe 财务待办。");
    } else {
      setNotifications([
        {
          id: "stripe-finance-unavailable",
          tone: "warning",
          title: "财务通知读取失败",
          body: result.error ?? "无法读取 Stripe 财务状态。"
        }
      ]);
      setNotificationsStatus("财务通知读取失败。");
    }
    setNotificationsLoading(false);
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  function openFinanceCenter() {
    setNotificationsOpen(false);
    onOpenInstitutionFinance();
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="font-bold text-coral">机构后台管理系统</p>
        <h1 className="mt-2 text-3xl font-black text-ink">{moduleLabels[activeModule]}</h1>
      </div>
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const nextOpen = !notificationsOpen;
            setNotificationsOpen(nextOpen);
            if (nextOpen) {
              void loadNotifications();
            }
          }}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold"
        >
          <Bell size={18} /> 通知
          {notifications.length ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-xs text-white">{notifications.length}</span>
          ) : null}
        </button>
        {notificationsOpen ? (
          <div className="absolute right-0 top-full z-30 mt-2 w-[24rem] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">机构通知</p>
                <p className="mt-1 text-xs text-slate-500">{notificationsStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadNotifications()}
                disabled={notificationsLoading}
                className="focus-ring inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-60"
              >
                <RefreshCw size={13} className={notificationsLoading ? "animate-spin" : ""} /> 刷新
              </button>
            </div>
            <div className="mt-3 grid max-h-80 gap-2 overflow-auto pr-1">
              {notifications.length ? (
                notifications.map((notice) => {
                  const toneClass =
                    notice.tone === "danger"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : notice.tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-sky-100 bg-sky-50 text-sky-700";
                  return (
                    <div key={notice.id} className={`rounded-lg border p-3 ${toneClass}`}>
                      <p className="text-sm font-bold">{notice.title}</p>
                      <p className="mt-1 text-xs leading-5 opacity-90">{notice.body}</p>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  当前没有需要处理的 Stripe 财务提醒。
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={openFinanceCenter}
              className="focus-ring mt-3 w-full rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white"
            >
              前往财务中心
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
function ProfileEditorModal({ onClose }: { onClose: () => void }) {
  const profile = useAdminProfile();
  const [draft, setDraft] = useState<AdminProfile>(profile);
  const [activeProfileTab, setActiveProfileTab] = useState<"basic" | "teacher">("basic");
  const [status, setStatus] = useState("修改后点击保存，资料会同步到当前后台会话。");
  const [saving, setSaving] = useState(false);
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState({ verificationCode: "", newPassword: "", confirmPassword: "" });
  const [passwordStatus, setPasswordStatus] = useState("通过邮箱验证码设置新密码。");
  const [passwordDemoCode, setPasswordDemoCode] = useState("");
  const [requestingPasswordCode, setRequestingPasswordCode] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [certificateUploadProgress, setCertificateUploadProgress] = useState<Record<number, number | null>>({});
  const canEditTeacherProfile = draft.roleValue === "teacher" || draft.roleValue === "super_admin";

  useEffect(() => {
    let isMounted = true;
    fetchAdminProfile().then((remoteProfile) => {
      if (!isMounted || !remoteProfile) {
        return;
      }
      persistAdminProfile(remoteProfile);
      setDraft(remoteProfile);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  function updateDraft<K extends keyof AdminProfile>(field: K, value: AdminProfile[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateTeacherProfile<K extends keyof AdminTeacherProfile>(field: K, value: AdminTeacherProfile[K]) {
    setDraft((current) => ({
      ...current,
      teacherProfile: {
        ...current.teacherProfile,
        [field]: value
      }
    }));
  }

  function updateCertificate(index: number, patch: Partial<AdminTeacherCertificate>) {
    setDraft((current) => {
      const certificates = [...current.teacherProfile.certificates];
      certificates[index] = { ...emptyTeacherCertificate(), ...certificates[index], ...patch };
      return { ...current, teacherProfile: { ...current.teacherProfile, certificates } };
    });
  }

  function addCertificate() {
    setDraft((current) => ({
      ...current,
      teacherProfile: {
        ...current.teacherProfile,
        certificates: [...current.teacherProfile.certificates, emptyTeacherCertificate()]
      }
    }));
  }

  function removeCertificate(index: number) {
    setDraft((current) => ({
      ...current,
      teacherProfile: {
        ...current.teacherProfile,
        certificates: current.teacherProfile.certificates.filter((_, certificateIndex) => certificateIndex !== index)
      }
    }));
  }

  async function handleCertificateImageUpload(index: number, file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("\u8bf7\u4e0a\u4f20\u56fe\u7247\u683c\u5f0f\u7684\u8bc1\u4e66\u56fe\u7247\u3002");
      return;
    }
    setCertificateUploadProgress((current) => ({ ...current, [index]: 1 }));
    setStatus("\u8bc1\u4e66\u56fe\u7247\u6b63\u5728\u4e0a\u4f20...");
    try {
      const url = await uploadAdminFile(file, "teacher_certificate", (progress) => {
        setCertificateUploadProgress((current) => ({ ...current, [index]: progress.percent }));
      });
      updateCertificate(index, { imageUrl: url });
      setStatus("\u8bc1\u4e66\u56fe\u7247\u5df2\u4e0a\u4f20\uff0c\u4fdd\u5b58\u8d44\u6599\u540e\u751f\u6548\u3002");
    } catch (error) {
      setStatus(`\u8bc1\u4e66\u56fe\u7247\u4e0a\u4f20\u5931\u8d25\uff1a${uploadFailureMessage(error, "\u8bf7\u786e\u8ba4 FastAPI \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002")}`);
    } finally {
      setCertificateUploadProgress((current) => ({ ...current, [index]: null }));
    }
  }

  function updatePasswordDraft(field: keyof typeof passwordDraft, value: string) {
    setPasswordDraft((current) => ({ ...current, [field]: value }));
  }

  function handleAvatarUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("请上传图片格式的头像。");
      return;
    }
    if (file.size > 600 * 1024) {
      setStatus("头像图片请控制在 600KB 以内。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setStatus("头像读取失败，请重新选择图片。");
        return;
      }
      updateDraft("avatar", dataUrl);
      setStatus("头像已上传，可预览后保存。");
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setSaving(true);
    const savedProfile = await saveAdminProfile(draft);
    persistAdminProfile(savedProfile ?? draft);
    setStatus(savedProfile ? "个人资料已保存。" : "API 不可用，已保存到本地演示状态。");
    setSaving(false);
    onClose();
  }

  const profileTabs: Array<{ key: "basic" | "teacher"; label: string }> = [
    { key: "basic", label: "基本资料" },
    ...(canEditTeacherProfile ? [{ key: "teacher" as const, label: "老师详细信息" }] : [])
  ];
  async function sendPasswordCode() {
    setRequestingPasswordCode(true);
    setPasswordDemoCode("");
    setPasswordStatus("正在发送邮箱验证码...");
    const result = await requestAdminPasswordChangeCode();
    if (result.ok) {
      setPasswordDemoCode(result.demoCode ?? "");
      setPasswordStatus(
        result.demoCode
          ? `已生成验证码。本地演示验证码：${result.demoCode}，${Math.floor(result.expiresInSeconds / 60)} 分钟内有效。`
          : "验证码已发送到当前绑定邮箱。"
      );
    } else {
      setPasswordStatus(result.message);
    }
    setRequestingPasswordCode(false);
  }

  async function savePassword() {
    if (!passwordDraft.verificationCode.trim()) {
      setPasswordStatus("请先输入邮箱验证码。");
      return;
    }
    if (passwordDraft.newPassword.length < 8) {
      setPasswordStatus("新密码至少需要 8 位。");
      return;
    }
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordStatus("两次输入的新密码不一致。");
      return;
    }
    setSavingPassword(true);
    setPasswordStatus("正在修改密码...");
    const result = await updateAdminPassword(passwordDraft.verificationCode, passwordDraft.newPassword);
    if (result.ok) {
      persistAdminProfile(result.profile);
      setDraft(result.profile);
      setPasswordDraft({ verificationCode: "", newPassword: "", confirmPassword: "" });
      setPasswordDemoCode("");
      setPasswordPanelOpen(false);
      setPasswordStatus("密码已修改，下次登录请使用新密码。");
      setStatus("密码已修改，下次登录请使用新密码。");
    } else {
      setPasswordStatus(result.message);
    }
    setSavingPassword(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-8">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-coral">个人资料</p>
            <h2 className="mt-1 text-2xl font-black text-ink">编辑个人资料</h2>
          </div>
          <button
            onClick={onClose}
            className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200"
            aria-label="关闭个人资料编辑"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex gap-2 rounded-lg bg-slate-100 p-1">
          {profileTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveProfileTab(tab.key)}
              className={`focus-ring rounded-md px-4 py-2 text-sm font-bold ${activeProfileTab === tab.key ? "bg-ink text-white" : "text-slate-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeProfileTab === "basic" ? (
          <div className="mt-5 grid gap-5 md:grid-cols-[11rem_1fr]">
            <aside className="rounded-lg bg-slate-50 p-4">
              <img src={draft.avatar} alt={draft.name} className="h-36 w-36 rounded-lg object-cover" />
              <label className="focus-ring mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                <ImagePlus size={16} /> 上传头像
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleAvatarUpload(event.target.files?.[0])} />
              </label>
            </aside>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  姓名
                  <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Email
                  <input className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500" type="email" value={draft.email} readOnly aria-readonly="true" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  角色
                  <input className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500" value={draft.role} readOnly aria-readonly="true" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  职务
                  <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  电话
                  <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  所在地区
                  <select className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2" value={draft.region} onChange={(event) => updateDraft("region", event.target.value)}>
                    {profileRegionOptions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                个人简介
                <textarea className="focus-ring min-h-28 rounded-lg border border-slate-200 px-3 py-2 leading-7" value={draft.bio} onChange={(event) => updateDraft("bio", event.target.value)} />
              </label>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">修改密码</h3>
                    <p className="mt-1 text-sm text-slate-500">通过邮箱验证码设置新密码。</p>
                  </div>
                  <button type="button" onClick={() => setPasswordPanelOpen((current) => !current)} className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                    {passwordPanelOpen ? "收起" : "修改密码"}
                  </button>
                </div>
                {passwordPanelOpen ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={sendPasswordCode}
                      disabled={requestingPasswordCode || savingPassword}
                      className="focus-ring rounded-lg border border-mint/40 bg-white px-3 py-2 text-sm font-bold text-mint disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {requestingPasswordCode ? "发送中" : "发送验证码"}
                    </button>
                    {passwordDemoCode ? (
                      <button type="button" onClick={() => updatePasswordDraft("verificationCode", passwordDemoCode)} className="focus-ring ml-2 rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold text-slate-600">
                        使用演示验证码：{passwordDemoCode}
                      </button>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        验证码
                        <input className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2" inputMode="numeric" value={passwordDraft.verificationCode} onChange={(event) => updatePasswordDraft("verificationCode", event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        新密码
                        <input className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2" type="password" value={passwordDraft.newPassword} onChange={(event) => updatePasswordDraft("newPassword", event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        确认新密码
                        <input className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2" type="password" value={passwordDraft.confirmPassword} onChange={(event) => updatePasswordDraft("confirmPassword", event.target.value)} />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">{passwordStatus}</p>
                      <button type="button" onClick={savePassword} disabled={savingPassword || requestingPasswordCode} className="focus-ring rounded-lg bg-mint px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
                        {savingPassword ? "修改中" : "确认修改密码"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                最高学历
                <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.teacherProfile.highestEducation} onChange={(event) => updateTeacherProfile("highestEducation", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                毕业院校
                <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.teacherProfile.graduationSchool} onChange={(event) => updateTeacherProfile("graduationSchool", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                当前职位
                <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.teacherProfile.currentPosition} onChange={(event) => updateTeacherProfile("currentPosition", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                教学年限
                <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.teacherProfile.teachingYears} onChange={(event) => updateTeacherProfile("teachingYears", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                职称
                <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2" value={draft.teacherProfile.professionalTitle} onChange={(event) => updateTeacherProfile("professionalTitle", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                当前或曾任职学校、大学、培训机构
                <textarea className="focus-ring min-h-28 rounded-lg border border-slate-200 px-3 py-2 leading-7" value={draft.teacherProfile.employmentHistory} onChange={(event) => updateTeacherProfile("employmentHistory", event.target.value)} />
              </label>
            </div>

            <section className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{"\u8d44\u8d28\u6216\u8363\u8a89\u8bc1\u4e66"}</h3>
                  <p className="mt-1 text-sm text-slate-500">{"\u53ef\u4ee5\u6dfb\u52a0\u591a\u9879\u8bc1\u4e66\u3001\u5956\u9879\u6216\u4e13\u4e1a\u8d44\u8d28\uff0c\u5e76\u4e0a\u4f20\u8bc1\u4e66\u56fe\u7247\u3002"}</p>
                </div>
                <button type="button" onClick={addCertificate} className="focus-ring rounded-lg bg-coral px-3 py-2 text-sm font-bold text-white">
                  <Plus size={16} className="inline-block" /> {"\u6dfb\u52a0\u8bc1\u4e66"}
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {draft.teacherProfile.certificates.length ? (
                  draft.teacherProfile.certificates.map((certificate, index) => {
                    const certificateProgress = certificateUploadProgress[index];
                    return (
                      <div key={index} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[10rem_1fr_auto]">
                        <div className="grid content-start gap-2">
                          {certificate.imageUrl ? (
                            <img src={certificate.imageUrl} alt={certificate.name || "\u8bc1\u4e66\u56fe\u7247"} className="h-28 w-full rounded-lg border border-slate-200 bg-white object-cover" />
                          ) : (
                            <div className="grid h-28 place-items-center rounded-lg border border-dashed border-slate-200 bg-white text-center text-xs font-semibold text-slate-400">
                              {"\u5c1a\u672a\u4e0a\u4f20\u8bc1\u4e66\u56fe\u7247"}
                            </div>
                          )}
                          <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                            <ImagePlus size={14} /> {"\u4e0a\u4f20\u56fe\u7247"}
                            <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleCertificateImageUpload(index, event.target.files?.[0])} />
                          </label>
                          {certificateProgress != null ? <UploadProgressRing progress={certificateProgress} size={18} /> : null}
                          {certificate.imageUrl ? (
                            <button type="button" onClick={() => updateCertificate(index, { imageUrl: "" })} className="focus-ring rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-500">
                              {"\u79fb\u9664\u56fe\u7247"}
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-3">
                          <label className="grid gap-2 text-sm font-semibold text-slate-700">
                            {"\u8bc1\u4e66\u540d\u79f0"}
                            <input
                              className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                              value={certificate.name}
                              onChange={(event) => updateCertificate(index, { name: event.target.value })}
                              placeholder="\u8bc1\u4e66\u540d\u79f0"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-semibold text-slate-700">
                            {"\u8bc1\u4e66\u4ecb\u7ecd"}
                            <textarea
                              className="focus-ring min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 leading-7"
                              value={certificate.description}
                              onChange={(event) => updateCertificate(index, { description: event.target.value })}
                              placeholder="\u8bc1\u4e66\u4ecb\u7ecd\uff0c\u4f8b\u5982\u9881\u53d1\u673a\u6784\u3001\u83b7\u5f97\u65f6\u95f4\u3001\u8bc1\u4e66\u8bf4\u660e"
                            />
                          </label>
                        </div>
                        <button type="button" onClick={() => removeCertificate(index)} className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-red-100 bg-white text-red-500" aria-label="\u5220\u9664\u8bc1\u4e66">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">{"\u6682\u672a\u6dfb\u52a0\u8bc1\u4e66\u3002"}</div>
                )}
              </div>
            </section>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">{status}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="focus-ring rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">取消</button>
            <button onClick={saveProfile} disabled={saving} className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "保存中..." : "保存资料"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function formatAdminNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value) || 0));
}

function formatAdminEuro(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatAdminPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function AdminMetricCard({
  label,
  value,
  hint,
  tone = "mint",
  compact = false
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "mint" | "coral" | "ink" | "amber";
  compact?: boolean;
}) {
  const toneClass =
    tone === "coral"
      ? "text-coral"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "ink"
          ? "text-ink"
          : "text-mint";
  return (
    <div className={`panel h-full rounded-lg ${compact ? "p-4" : "p-5"}`}>
      <p className={`${compact ? "text-xs" : "text-sm"} font-bold text-slate-500`}>{label}</p>
      <p className={`${compact ? "mt-2 text-2xl" : "mt-3 text-3xl"} font-black text-ink`}>{value}</p>
      {hint ? <p className={`${compact ? "mt-1.5 text-xs" : "mt-2 text-sm"} font-bold ${toneClass}`}>{hint}</p> : null}
    </div>
  );
}

function AdminMetricGroup({
  title,
  subtitle,
  tone,
  stacked = false,
  children
}: {
  title: string;
  subtitle: string;
  tone: "mint" | "coral" | "amber";
  stacked?: boolean;
  children: ReactNode;
}) {
  const toneClass =
    tone === "coral"
      ? "border-coral/20 bg-coral/5"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/60"
        : "border-mint/20 bg-mint/5";
  const dotClass = tone === "coral" ? "bg-coral" : tone === "amber" ? "bg-amber-500" : "bg-mint";

  return (
    <section className={`flex h-full flex-col rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-3 flex items-start gap-2">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
        <div>
          <h3 className="text-base font-black text-ink">{title}</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className={`grid flex-1 gap-3 ${stacked ? "auto-rows-fr grid-cols-1" : "sm:grid-cols-2"}`}>{children}</div>
    </section>
  );
}

function CourseRankingList({
  title,
  items,
  valueFormatter
}: {
  title: string;
  items: AdminCourseRanking[];
  valueFormatter: (item: AdminCourseRanking) => string;
}) {
  return (
    <section className="panel rounded-lg p-5">
      <h3 className="text-lg font-black text-ink">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.length ? (
          items.slice(0, 6).map((course, index) => (
            <div key={`${title}-${course.course_id}`} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white font-black text-coral">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{course.title}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{course.teacher || "未设置老师"}</p>
              </div>
              <p className="shrink-0 text-sm font-black text-mint">{valueFormatter(course)}</p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
            暂无排行数据。
          </p>
        )}
      </div>
    </section>
  );
}

function RealDashboardPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("正在读取后台数据...");

  async function loadOverview() {
    setLoading(true);
    setStatus("正在读取后台数据...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/overview`, {
        headers: getAdminRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(await readAdminApiErrorMessage(response, "后台数据读取失败"));
      }
      setOverview((await response.json()) as AdminOverview);
      setStatus("");
    } catch (error) {
      setOverview(null);
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message === "Failed to fetch" || !message
          ? apiConnectionErrorMessage("后台数据读取失败")
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  if (!overview) {
    return (
      <section className="panel rounded-lg p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">主页面板</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{status || "暂无数据。"}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">主页面板</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              统计当前机构的订阅、收入、学习和资源数据。
            </p>
            {status ? <p className="mt-1 text-sm font-semibold text-coral">{status}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <AdminMetricCard compact label="课程总数" value={formatAdminNumber(overview.total_courses)} hint={`已发布 ${overview.published_courses} / 草稿 ${overview.draft_courses}`} />
        <AdminMetricCard compact label="题目总数" value={formatAdminNumber(overview.total_questions)} />
        <AdminMetricCard compact label="教师总数" value={formatAdminNumber(overview.total_teachers)} />
        <AdminMetricCard compact label="模拟试卷" value={formatAdminNumber(overview.total_exam_papers)} />
        <AdminMetricCard compact label="竞赛" value={formatAdminNumber(overview.total_competitions)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr_0.9fr]">
        <AdminMetricGroup title="订阅" subtitle="订阅增长、活跃状态和退订申请。" tone="mint">
          <AdminMetricCard compact label="总学生订阅量" value={formatAdminNumber(overview.total_subscriptions)} hint={`当前活跃 ${formatAdminNumber(overview.active_subscriptions)}`} />
          <AdminMetricCard compact label="待处理退订" value={formatAdminNumber(overview.pending_cancellations)} hint={`平均退订率 ${formatAdminPercent(overview.average_cancellation_rate)}`} />
          <AdminMetricCard compact label="月订阅量增长" value={formatAdminNumber(overview.monthly_subscription_growth.current)} hint={`较上月 ${formatAdminPercent(overview.monthly_subscription_growth.growth_percent)}`} tone="coral" />
          <AdminMetricCard compact label="周订阅量增长" value={formatAdminNumber(overview.weekly_subscription_growth.current)} hint={`较上周 ${formatAdminPercent(overview.weekly_subscription_growth.growth_percent)}`} tone="amber" />
        </AdminMetricGroup>

        <AdminMetricGroup stacked title="收入" subtitle="订阅收入和经常性收入。" tone="coral">
          <AdminMetricCard compact label="累计总收入" value={formatAdminEuro(overview.total_revenue_eur)} hint="已确认订阅收入" tone="ink" />
          <AdminMetricCard compact label="本月总收入" value={formatAdminEuro(overview.current_month_revenue_eur)} hint={`MRR ${formatAdminEuro(overview.monthly_recurring_revenue_eur)}`} />
        </AdminMetricGroup>

        <AdminMetricGroup stacked title="学生学习" subtitle="学习时长和按时完课质量。" tone="amber">
          <AdminMetricCard compact label="学生平均月学习时间" value={`${formatAdminNumber(overview.average_monthly_learning_minutes)} 分钟`} hint="按学习记录估算" tone="amber" />
          <AdminMetricCard compact label="按时完课率" value={formatAdminPercent(overview.on_time_completion_rate)} hint="按课程时长计算" tone="coral" />
        </AdminMetricGroup>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <CourseRankingList title="课程订阅量排行" items={overview.subscription_rankings} valueFormatter={(item) => `${item.subscriptions} 人`} />
        <CourseRankingList title="课程收入排行" items={overview.revenue_rankings} valueFormatter={(item) => formatAdminEuro(item.revenue_eur)} />
        <CourseRankingList title="课程订阅月增长率排行" items={overview.monthly_growth_rankings} valueFormatter={(item) => formatAdminPercent(item.growth_percent)} />
        <CourseRankingList title="课程学生满意度排行" items={overview.satisfaction_rankings} valueFormatter={(item) => `${Number(item.rating_average || 0).toFixed(1)} 分`} />
      </section>
    </div>
  );
}

function DashboardPanel() {
  const [range, setRange] = useState(dashboardRanges[1].key);
  const activeRange = dashboardRanges.find((item) => item.key === range) ?? dashboardRanges[1];

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {usefulMetrics.map((metric) => (
          <div key={metric.label} className="panel rounded-lg p-5">
            <p className="text-sm font-semibold text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-black text-ink">{metric.value}</p>
            <p className="mt-2 text-sm font-semibold text-mint">{metric.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="panel rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">课程订阅增长</h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeRange.label}新增 {activeRange.total} 人，增长 {activeRange.growth}
              </p>
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {dashboardRanges.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setRange(item.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold ${
                    range === item.key ? "bg-white text-ink shadow-sm" : "text-slate-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {courseRankings.map((course) => (
              <div key={course.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="truncate font-bold text-ink">{course.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{course.teacher} · 完课率 {course.completionRate}%</p>
                  </div>
                  <p className="font-black text-coral">{course.subscriptions} 订阅</p>
                </div>
                <div className="mt-4 flex h-20 items-end gap-2">
                  {course.trend.map((value, index) => (
                    <div
                      key={`${course.id}-${index}`}
                      className="flex-1 rounded-t-md bg-mint/70"
                      style={{ height: `${Math.max(18, value / 2)}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel h-fit rounded-lg p-5">
          <h3 className="font-bold text-ink">课程订阅排行</h3>
          <div className="mt-4 grid gap-3">
            {courseRankings.map((course, index) => (
              <div key={course.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black text-coral">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{course.title}</p>
                  <p className="text-sm text-slate-500">{course.revenue} 欧元/月</p>
                </div>
                <ArrowUpRight size={18} className="text-mint" />
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function InstitutionPanel() {
  const [draft, setDraft] = useState<InstitutionDraft>(defaultInstitutionDraft);
  const [activeTab, setActiveTab] = useState<"basic" | "finance">("basic");
  const [finance, setFinance] = useState<InstitutionFinance | null>(null);
  const [status, setStatus] = useState("修改机构信息后点击更新。");
  const [financeStatus, setFinanceStatus] = useState("正在加载 Stripe 财务信息...");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const categoryLabel =
    institutionCategoryOptions.find((option) => option.value === draft.category)?.label ?? draft.category;
  const agreementReady = draft.serviceAgreementAccepted && draft.gdprAgreementAccepted && draft.feeAgreementAccepted;
  const isPlatformOwned = draft.payoutMode === "platform";
  const stripeReady = Boolean(draft.stripeChargesEnabled && draft.stripeDetailsSubmitted);
  const institutionTypeLabel = draft.institutionType === "organization" ? "组织机构" : "个人机构";
  const accountModeLabel = isPlatformOwned ? "平台自营账户" : "合作机构账户";
  const financeSnapshot = finance;
  const connectedAccountType = financeSnapshot?.stripe_account_type ?? null;
  const expectedStripeAccountType = draft.institutionType === "organization" ? "standard" : "express";
  const expectedStripeAccountLabel = expectedStripeAccountType === "standard" ? "Standard" : "Express";
  const hasMismatchedStripeAccount =
    !isPlatformOwned && Boolean(connectedAccountType && connectedAccountType !== expectedStripeAccountType);
  const stripeRequirements = financeSnapshot?.requirements;
  const missingRequirements = [
    ...(stripeRequirements?.currently_due ?? []),
    ...(stripeRequirements?.past_due ?? []),
    ...(stripeRequirements?.eventually_due ?? []),
    ...(stripeRequirements?.pending_verification ?? [])
  ].filter((item, index, items) => item && items.indexOf(item) === index);
  const stripeNeedsOnboarding =
    !isPlatformOwned &&
    (!financeSnapshot
      ? !draft.stripeDetailsSubmitted
      : !financeSnapshot.stripe_connected ||
        hasMismatchedStripeAccount ||
        !financeSnapshot.details_submitted ||
        Boolean(financeSnapshot.requirements.disabled_reason) ||
        financeSnapshot.requirements.currently_due.length > 0 ||
        financeSnapshot.requirements.past_due.length > 0);

  useEffect(() => {
    let isMounted = true;
    fetchAdminInstitution().then((remoteInstitution) => {
      if (!isMounted || !remoteInstitution) {
        return;
      }
      setDraft(remoteInstitution);
      persistAdminBrandFromInstitution(remoteInstitution);
      setStatus("已从服务器加载机构信息。");
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void loadFinance();
  }, []);

  useEffect(() => {
    function handleInstitutionTab(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "finance") {
        setActiveTab("finance");
        void loadFinance();
      }
      if (detail === "basic") {
        setActiveTab("basic");
      }
    }

    window.addEventListener(ADMIN_INSTITUTION_TAB_EVENT, handleInstitutionTab);
    return () => window.removeEventListener(ADMIN_INSTITUTION_TAB_EVENT, handleInstitutionTab);
  }, []);

  function updateDraft(field: keyof InstitutionDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateDraftBoolean(field: keyof InstitutionDraft, value: boolean) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function syncFinanceInstitution(nextFinance: InstitutionFinance) {
    const nextDraft = institutionFromApi(nextFinance.institution);
    setDraft(nextDraft);
    persistAdminBrandFromInstitution(nextDraft);
  }

  async function loadFinance() {
    setFinanceLoading(true);
    const result = await fetchInstitutionFinance();
    if (result.finance) {
      setFinance(result.finance);
      syncFinanceInstitution(result.finance);
      setFinanceStatus("已从 Stripe 和数据库加载财务信息。");
    } else {
      setFinance(null);
      setFinanceStatus(result.error ?? "财务数据读取失败。");
    }
    setFinanceLoading(false);
  }

  function formatMoney(amount: number) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2
    }).format(amount);
  }

  function formatBalance(items: StripeBalanceAmount[]) {
    if (!items.length) {
      return "€0.00";
    }
    return items
      .map((item) =>
        new Intl.NumberFormat("zh-CN", {
          style: "currency",
          currency: item.currency || "EUR",
          minimumFractionDigits: 2
        }).format(item.amount)
      )
      .join(" / ");
  }

  function formatPeriod(payment: AdminSubscriptionPayment) {
    const start = payment.current_period_start ? new Date(payment.current_period_start) : null;
    const end = payment.current_period_end ? new Date(payment.current_period_end) : null;
    const formatter = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" });
    if (!start || Number.isNaN(start.getTime())) {
      return "周期未记录";
    }
    return end && !Number.isNaN(end.getTime()) ? `${formatter.format(start)} - ${formatter.format(end)}` : formatter.format(start);
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("请上传图片格式的机构 Logo。");
      return;
    }
    setUploadingLogo(true);
    setLogoUploadProgress(1);
    setStatus("正在上传机构 Logo...");
    try {
      const logoUrl = await uploadAdminFile(file, "logo", (progress) => setLogoUploadProgress(progress.percent));
      setDraft((current) => ({ ...current, logoUrl }));
      persistAdminBrandFromInstitution({ ...draft, logoUrl });
      setStatus("机构 Logo 已上传，点击更新机构信息后保存。");
    } catch (error) {
      setStatus(`机构 Logo 上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingLogo(false);
      setLogoUploadProgress(null);
    }
  }

  async function updateInstitution() {
    setSaving(true);
    setStatus("正在更新机构信息...");
    const savedInstitution = await saveAdminInstitution(draft);
    if (savedInstitution) {
      setDraft(savedInstitution);
      persistAdminBrandFromInstitution(savedInstitution);
      setStatus("机构信息已更新。");
      void loadFinance();
    } else {
      setStatus("机构信息更新失败，请确认 FastAPI 服务正在运行。");
    }
    setSaving(false);
  }

  async function handleStripeOnboarding() {
    setStripeBusy(true);
    setFinanceStatus(
      hasMismatchedStripeAccount
        ? `正在切换到 Stripe ${expectedStripeAccountLabel} 收款账户...`
        : "正在创建 Stripe 验证入口..."
    );
    const result = await startStripeConnectOnboarding();
    if (result.draft) {
      setDraft(result.draft);
    }
    if (result.url) {
      setFinanceStatus("正在打开 Stripe 验证页面...");
      window.location.assign(result.url);
    } else {
      setFinanceStatus(result.error ?? "Stripe 验证入口创建失败。");
    }
    setStripeBusy(false);
  }

  async function handleStripeDashboard() {
    const dashboardWindow = window.open("about:blank", "_blank");
    if (dashboardWindow) {
      dashboardWindow.opener = null;
    }
    setStripeBusy(true);
    setFinanceStatus("正在创建 Stripe 收款账户管理入口...");
    const result = await createStripeDashboardLink();
    if (result.draft) {
      setDraft(result.draft);
    }
    if (result.url) {
      setFinanceStatus("已在新标签页打开 Stripe 收款账户管理页。");
      if (dashboardWindow) {
        dashboardWindow.location.href = result.url;
      } else {
        setFinanceStatus("浏览器阻止了新标签页，请允许弹窗后重试。");
      }
    } else {
      dashboardWindow?.close();
      setFinanceStatus(result.error ?? "Stripe 收款账户管理入口创建失败。");
    }
    setStripeBusy(false);
  }

  async function handleStripeSync() {
    setStripeBusy(true);
    setFinanceStatus("正在同步 Stripe 状态...");
    const result = await syncStripeConnectStatus();
    if (result.draft) {
      setDraft(result.draft);
      setFinanceStatus("Stripe 状态已同步。");
      await loadFinance();
    } else {
      setFinanceStatus(result.error ?? "Stripe 状态同步失败。");
    }
    setStripeBusy(false);
  }

  function statusPill(ready: boolean, readyText: string, pendingText: string) {
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ready ? "bg-mint/10 text-mint" : "bg-amber-100 text-amber-700"}`}>
        {ready ? readyText : pendingText}
      </span>
    );
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">机构信息</h2>
          <p className="mt-1 text-sm text-slate-500">管理机构资料、平台协议和 Stripe 收款状态。</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab("basic")}
            className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === "basic" ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            基本信息
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("finance")}
            className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === "finance" ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            财务中心
          </button>
        </div>
      </div>

      {activeTab === "basic" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_18rem]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">基本资料</h3>
                <p className="mt-1 text-sm text-slate-500">{status}</p>
              </div>
              <button
                onClick={updateInstitution}
                disabled={saving}
                className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "更新中" : "更新机构信息"}
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构类别
                <select
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
                  value={draft.category}
                  disabled
                  aria-label={`机构类别：${categoryLabel}`}
                >
                  {institutionCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构类型
                <input
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
                  value={institutionTypeLabel}
                  disabled
                  readOnly
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                收款模式
                <input
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
                  value={accountModeLabel}
                  disabled
                  readOnly
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                机构名称
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                联系电话
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.phone}
                  onChange={(event) => updateDraft("phone", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                邮箱
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  type="email"
                  value={draft.email}
                  onChange={(event) => updateDraft("email", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                地址
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.address}
                  onChange={(event) => updateDraft("address", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                网站
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.website}
                  onChange={(event) => updateDraft("website", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                联系人
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.contactPerson}
                  onChange={(event) => updateDraft("contactPerson", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                所在地区
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.region}
                  onChange={(event) => updateDraft("region", event.target.value)}
                />
              </label>
            </div>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
              机构介绍
              <textarea
                className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-2 leading-7"
                value={draft.description}
                onChange={(event) => updateDraft("description", event.target.value)}
              />
            </label>
          </div>
          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-700">机构 Logo</p>
            <div className="mt-3 grid aspect-square place-items-center overflow-hidden rounded-lg bg-white p-4 text-mint">
              {draft.logoUrl ? (
                <img src={draft.logoUrl} alt={`${draft.name} Logo`} className="h-full w-full object-contain" />
              ) : (
                <Building2 size={56} />
              )}
            </div>
            <label className="focus-ring mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 font-bold text-white">
              {uploadingLogo ? <UploadProgressRing progress={logoUploadProgress} /> : <ImagePlus size={16} />} {uploadingLogo ? "上传中" : "上传新 Logo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploadingLogo}
                onChange={(event) => {
                  void handleLogoUpload(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-ink">平台协议</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">平台按课程订阅金额抽取 15% 服务费。Stripe 需要的税务、身份和银行信息会在财务中心继续完善。</p>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.serviceAgreementAccepted}
                    onChange={(event) => updateDraftBoolean("serviceAgreementAccepted", event.target.checked)}
                  />
                  服务协议
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.gdprAgreementAccepted}
                    onChange={(event) => updateDraftBoolean("gdprAgreementAccepted", event.target.checked)}
                  />
                  GDPR 协议
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.feeAgreementAccepted}
                    onChange={(event) => updateDraftBoolean("feeAgreementAccepted", event.target.checked)}
                  />
                  收费协议
                </label>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div className="grid gap-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-ink">Stripe 财务中心</h3>
                  <p className="mt-1 text-sm text-slate-500">{financeStatus}</p>
                </div>
                <button
                  type="button"
                  onClick={loadFinance}
                  disabled={financeLoading}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
                >
                  <RefreshCw size={15} className={financeLoading ? "animate-spin" : ""} /> 刷新
                </button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">Stripe 连接</p>
                  <div className="mt-3">{statusPill(Boolean(draft.stripeAccountId) || isPlatformOwned, "已连接", "未连接")}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">身份验证</p>
                  <div className="mt-3">{statusPill(stripeReady, "已完成", "待补充")}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">Charges</p>
                  <div className="mt-3">{statusPill(draft.stripeChargesEnabled, "可收款", "未开启")}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">Payouts</p>
                  <div className="mt-3">{statusPill(draft.stripePayoutsEnabled, "可提现", "未开启")}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-500">订阅月收入</p>
                <p className="mt-2 text-3xl font-black text-ink">{formatMoney(financeSnapshot?.total_monthly_revenue_eur ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-500">平台服务费</p>
                <p className="mt-2 text-3xl font-black text-coral">{formatMoney(financeSnapshot?.platform_fee_monthly_eur ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-500">机构预计收入</p>
                <p className="mt-2 text-3xl font-black text-mint">{formatMoney(financeSnapshot?.net_monthly_revenue_eur ?? 0)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-500">当前可用余额</p>
                <p className="mt-2 text-2xl font-black text-ink">{formatBalance(financeSnapshot?.available_balance ?? [])}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-500">待结算余额</p>
                <p className="mt-2 text-2xl font-black text-ink">{formatBalance(financeSnapshot?.pending_balance ?? [])}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-ink">订阅收款记录</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4">课程</th>
                      <th className="py-3 pr-4">学生</th>
                      <th className="py-3 pr-4">状态</th>
                      <th className="py-3 pr-4">月付金额</th>
                      <th className="py-3 pr-4">机构收入</th>
                      <th className="py-3">当前周期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(financeSnapshot?.subscription_payments ?? []).map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-bold text-ink">{payment.course_title}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          <span className="font-semibold text-ink">{payment.student_name}</span>
                          <span className="block text-xs text-slate-400">{payment.student_email}</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{payment.status}</td>
                        <td className="py-3 pr-4 font-semibold text-ink">{formatMoney(payment.amount_eur_monthly)}</td>
                        <td className="py-3 pr-4 font-semibold text-mint">{formatMoney(payment.net_amount_eur_monthly)}</td>
                        <td className="py-3 text-slate-500">{formatPeriod(payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {financeSnapshot && financeSnapshot.subscription_payments.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                    暂无订阅收款记录。
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-ink">收款账户</h3>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">收款模式</span><span className="font-bold text-ink">{accountModeLabel}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">机构类型</span><span className="font-bold text-ink">{institutionTypeLabel}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">Stripe 账户</span><span className="max-w-44 break-all text-right font-bold text-ink">{isPlatformOwned ? "平台主账户" : draft.stripeAccountId || "未连接"}</span></div>
              </div>
              <div className="mt-5 grid gap-2">
                {stripeNeedsOnboarding ? (
                  <button
                    type="button"
                    onClick={handleStripeOnboarding}
                    disabled={!agreementReady || stripeBusy}
                    className="focus-ring rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {stripeBusy ? "处理中..." : hasMismatchedStripeAccount ? `切换到 ${expectedStripeAccountLabel} 账户` : "继续完成验证"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleStripeDashboard}
                  disabled={stripeBusy || (!isPlatformOwned && (!draft.stripeAccountId || hasMismatchedStripeAccount))}
                  className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  管理 Stripe 收款账户
                </button>
                <button
                  type="button"
                  onClick={handleStripeSync}
                  disabled={stripeBusy || (!isPlatformOwned && !draft.stripeAccountId)}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={15} /> 同步状态
                </button>
              </div>
              {!agreementReady ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                  请先在基本信息中勾选服务协议、GDPR 协议和收费协议，再进入 Stripe 验证。
                </p>
              ) : null}
              {hasMismatchedStripeAccount ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                  当前 Stripe 账户类型与机构类型不匹配。请切换到 {expectedStripeAccountLabel} 账户后，再进入机构自己的 Stripe Dashboard。
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-ink">资料待补充</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">平台不再单独收集税务和银行资料。Stripe 需要补充的内容会显示在这里。</p>
              {stripeRequirements?.disabled_reason ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-700">{stripeRequirements.disabled_reason}</p>
              ) : null}
              {missingRequirements.length ? (
                <ul className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
                  {missingRequirements.map((item) => (
                    <li key={item} className="rounded-md bg-slate-50 px-3 py-2">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg bg-mint/10 p-3 text-xs font-semibold text-mint">当前没有 Stripe 待补充资料。</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
function CourseCategoryManagement() {
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [draft, setDraft] = useState<CourseCategoryDraft>(() => createBlankCourseCategoryDraft());
  const [status, setStatus] = useState("正在加载课程类别...");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();

  const parentCategories = useMemo(
    () =>
      categories
        .filter((category) => category.parentId === null)
        .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "zh-Hans-CN")),
    [categories]
  );
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const childCategories = useMemo(
    () =>
      categories
        .filter((category) => category.parentId === selectedCategory?.id)
        .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "zh-Hans-CN")),
    [categories, selectedCategory]
  );
  const parentOptions = parentCategories.filter((category) => category.id !== draft.id);

  async function loadCategories() {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/course-categories`, {
        headers: getAdminRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("Course category API unavailable");
      }
      const nextCategories = ((await response.json()) as ApiCourseCategory[]).map((category) =>
        courseCategoryFromApi(category)
      );
      setCategories(nextCategories);
      setSelectedCategoryId((currentId) =>
          currentId && nextCategories.some((category) => category.id === currentId)
            ? currentId
            : nextCategories.find((category) => category.parentId === null)?.id ?? nextCategories[0]?.id ?? null
      );
      setStatus(nextCategories.length ? "已从数据库加载课程类别。" : "还没有课程类别，可以先新增一个大类。");
    } catch {
      setCategories([]);
      setSelectedCategoryId(null);
      setDraft(createBlankCourseCategoryDraft());
      setStatus("课程类别 API 暂时不可用，请确认 FastAPI 服务正在运行。");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCategories();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedCategory) {
        setDraft(createBlankCourseCategoryDraft());
        return;
      }
      setDraft(courseCategoryDraftFromCategory(selectedCategory));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedCategory]);

  function addParentCategory() {
    const nextDraft = createBlankCourseCategoryDraft();
    setSelectedCategoryId(null);
    setDraft(nextDraft);
    setStatus("正在创建新的课程大类。");
  }

  function addChildCategory(parentId: number) {
    const nextDraft = createBlankCourseCategoryDraft(parentId);
    setSelectedCategoryId(null);
    setDraft(nextDraft);
    setStatus("正在创建新的课程子类。");
  }

  async function saveCategory() {
    if (!draft.name.trim()) {
      setStatus("请填写类别名称。");
      return;
    }
    setSaving(true);
    setStatus("正在保存课程类别...");
    try {
      const isNew = draft.id < 0;
      const response = await fetch(`${API_BASE_URL}/admin/course-categories${isNew ? "" : `/${draft.id}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: {
          ...getAdminRequestHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(courseCategoryDraftToApiPayload(draft))
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        const detail = typeof errorPayload?.detail === "string" ? errorPayload.detail : "课程类别保存失败。";
        throw new Error(detail);
      }
      const savedCategory = courseCategoryFromApi((await response.json()) as ApiCourseCategory);
      setCategories((currentCategories) => {
        if (isNew) {
          return [savedCategory, ...currentCategories];
        }
        return currentCategories.map((category) =>
          category.id === savedCategory.id ? savedCategory : category
        );
      });
      setSelectedCategoryId(savedCategory.id);
      setDraft(courseCategoryDraftFromCategory(savedCategory));
      setStatus("课程类别已保存。");
      window.dispatchEvent(new Event(COURSE_CATEGORY_CHANGE_EVENT));
    } catch (error) {
      setStatus(uploadFailureMessage(error, "课程类别保存失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: CourseCategory) {
    const confirmed = await confirmDelete({
      title: "\u5220\u9664\u8bfe\u7a0b\u7c7b\u522b",
      itemName: category.name,
      description:
        category.parentId === null
          ? "\u5220\u9664\u5927\u7c7b\u4f1a\u540c\u65f6\u79fb\u9664\u5b83\u4e0b\u9762\u7684\u5b50\u7c7b\u3002\u8bf7\u786e\u8ba4\u662f\u5426\u7ee7\u7eed\u3002"
          : "\u5220\u9664\u540e\uff0c\u8be5\u7c7b\u522b\u4f1a\u4ece\u8bfe\u7a0b\u7c7b\u522b\u5217\u8868\u4e2d\u79fb\u9664\u3002",
    });
    if (!confirmed) return;

    setDeleting(true);
    setStatus("正在删除课程类别...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/course-categories/${category.id}`, {
        method: "DELETE",
        headers: getAdminRequestHeaders()
      });
      if (!response.ok) {
        throw new Error(`服务器返回 ${response.status}`);
      }
      const removedIds = new Set([
        category.id,
        ...categories.filter((item) => item.parentId === category.id).map((item) => item.id)
      ]);
      const nextCategories = categories.filter((item) => !removedIds.has(item.id));
      setCategories(nextCategories);
      const nextSelected = nextCategories.find((item) => item.parentId === null) ?? nextCategories[0] ?? null;
      setSelectedCategoryId(nextSelected?.id ?? null);
      setDraft(nextSelected ? courseCategoryDraftFromCategory(nextSelected) : createBlankCourseCategoryDraft());
      setStatus("课程类别已删除。");
      window.dispatchEvent(new Event(COURSE_CATEGORY_CHANGE_EVENT));
    } catch (error) {
      setStatus(uploadFailureMessage(error, "课程类别删除失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
      {deleteConfirmDialog}
      <section className="panel rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">课程类别</h2>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
          <button
            type="button"
            onClick={addParentCategory}
            className="focus-ring inline-flex h-11 min-w-[7.5rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-coral px-4 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54]"
          >
            <Plus size={16} className="shrink-0" /> 新增大类
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {parentCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              className={`focus-ring rounded-lg border p-4 text-left transition ${
                selectedCategoryId === category.id
                  ? "border-mint bg-mint/10"
                  : "border-slate-200 bg-white hover:border-mint/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{category.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {categories.filter((item) => item.parentId === category.id).length} 个子类
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    category.isActive ? "bg-mint/12 text-mint" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {category.isActive ? "启用" : "停用"}
                </span>
              </div>
            </button>
          ))}
          {parentCategories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              暂无课程大类。
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">类别编辑</h2>
            <p className="mt-1 text-sm text-slate-500">课程类别最多支持大类和子类两级。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategory ? (
              <button
                type="button"
                onClick={() => void addChildCategory(selectedCategory.parentId ? selectedCategory.parentId : selectedCategory.id)}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              >
                <Plus size={16} /> 新增子类
              </button>
            ) : null}
            {draft.id > 0 ? (
              <button
                type="button"
                onClick={() => void deleteCategory(draft as CourseCategory)}
                disabled={deleting}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral/40 bg-white px-3 py-2 text-sm font-bold text-coral disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} /> 删除
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void saveCategory()}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} /> {saving ? "保存中" : "保存类别"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_10rem]">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            类别名称
            <input
              className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="例如：语言教育"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            所属大类
            <select
              className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
              value={String(draft.parentId ?? "")}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  parentId: event.target.value ? Number(event.target.value) : null
                }))
              }
              disabled={childCategories.length > 0}
            >
              <option value="">作为大类</option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            排序
            <input
              className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
              type="number"
              min={0}
              value={draft.position}
              onChange={(event) =>
                setDraft((current) => ({ ...current, position: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 md:col-span-3">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
              className="accent-coral"
            />
            启用这个课程类别
          </label>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-ink">当前大类下的子类</h3>
            {selectedCategory && selectedCategory.parentId === null ? (
              <button
                type="button"
                onClick={() => addChildCategory(selectedCategory.id)}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              >
                <Plus size={15} /> 添加子类
              </button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {childCategories.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedCategoryId(child.id)}
                className="focus-ring rounded-lg border border-slate-200 bg-slate-50 p-4 text-left hover:border-mint/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{child.name}</p>
                    <p className="mt-1 text-sm text-slate-500">排序 {child.position}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      child.isActive ? "bg-mint/12 text-mint" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {child.isActive ? "启用" : "停用"}
                  </span>
                </div>
              </button>
            ))}
            {childCategories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500 md:col-span-2">
                当前大类还没有子类。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function LearningPathManagement() {
  const profile = useAdminProfile();
  const [paths, setPaths] = useState<AdminLearningPath[]>([]);
  const [availableCourses, setAvailableCourses] = useState<AdminCourseSummary[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [draft, setDraft] = useState<AdminLearningPath>(() => createBlankLearningPathDraft());
  const [status, setStatus] = useState("正在加载学习路径...");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIntroVideo, setUploadingIntroVideo] = useState(false);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState<number | null>(null);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();

  const selectedPath = paths.find((path) => path.id === selectedPathId) ?? null;
  const isNew = draft.id < 0;
  const courseMap = useMemo(() => {
    const map = new Map<number, AdminCourseSummary>();
    [...availableCourses, ...draft.courses].forEach((course) => map.set(course.id, course));
    return map;
  }, [availableCourses, draft.courses]);
  const selectedCourses = draft.courseIds
    .map((courseId) => courseMap.get(courseId))
    .filter((course): course is AdminCourseSummary => Boolean(course));
  const selectedCourseIds = new Set(draft.courseIds);

  async function loadLearningPathData() {
    setStatus("正在加载学习路径...");
    try {
      const [pathsResponse, coursesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/learning-paths`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        }),
        fetch(`${API_BASE_URL}/admin/learning-path-course-options`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        })
      ]);
      if (!pathsResponse.ok || !coursesResponse.ok) {
        throw new Error("Learning path API unavailable");
      }
      const nextPaths = ((await pathsResponse.json()) as ApiLearningPath[]).map(learningPathFromApi);
      const nextCourses = ((await coursesResponse.json()) as ApiCourseCard[]).map(normalizeCourseCardFromApi);
      const institutionCourses = profile.institutionId
        ? nextCourses.filter((course) => course.institutionId === profile.institutionId)
        : nextCourses;
      setPaths(nextPaths);
      setAvailableCourses(institutionCourses);
      setSelectedPathId((currentId) =>
        currentId && nextPaths.some((path) => path.id === currentId) ? currentId : nextPaths[0]?.id ?? null
      );
      if (!nextPaths.length) {
        setDraft(createBlankLearningPathDraft());
      }
      setStatus(nextPaths.length ? "已从数据库加载学习路径。" : "还没有学习路径，可以先新增一个。");
    } catch {
      setPaths([]);
      setAvailableCourses([]);
      setSelectedPathId(null);
      setDraft(createBlankLearningPathDraft());
      setStatus("学习路径 API 暂时不可用，请确认 FastAPI 服务正在运行。");
    }
  }

  useEffect(() => {
    void loadLearningPathData();
  }, [profile.institutionId]);

  useEffect(() => {
    if (selectedPath) {
      setDraft(selectedPath);
    }
  }, [selectedPath]);

  function addLearningPath() {
    setSelectedPathId(null);
    setDraft(createBlankLearningPathDraft());
    setStatus("正在创建新的学习路径。");
  }

  function updateDraft<K extends keyof AdminLearningPath>(field: K, value: AdminLearningPath[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleCourse(courseId: number) {
    updateDraft(
      "courseIds",
      selectedCourseIds.has(courseId)
        ? draft.courseIds.filter((id) => id !== courseId)
        : [...draft.courseIds, courseId]
    );
  }

  function removeCourse(courseId: number) {
    updateDraft("courseIds", draft.courseIds.filter((id) => id !== courseId));
  }

  function moveCourse(courseId: number, direction: -1 | 1) {
    const currentIndex = draft.courseIds.indexOf(courseId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= draft.courseIds.length) {
      return;
    }
    const nextCourseIds = [...draft.courseIds];
    [nextCourseIds[currentIndex], nextCourseIds[nextIndex]] = [nextCourseIds[nextIndex], nextCourseIds[currentIndex]];
    updateDraft("courseIds", nextCourseIds);
  }

  async function uploadLearningPathCover(file: File | undefined) {
    if (!file) return;
    setUploadingCover(true);
    setCoverUploadProgress(1);
    setStatus("正在上传路径封面...");
    try {
      const url = await uploadAdminFile(file, "course_cover", (progress) => setCoverUploadProgress(progress.percent));
      updateDraft("coverUrl", url);
      setStatus("路径封面已上传，保存路径后生效。");
    } catch (error) {
      setStatus(`路径封面上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingCover(false);
      setCoverUploadProgress(null);
    }
  }

  async function uploadLearningPathIntroVideo(file: File | undefined) {
    if (!file) return;
    setUploadingIntroVideo(true);
    setIntroVideoUploadProgress(1);
    setStatus("正在上传路径介绍视频...");
    try {
      const url = await uploadAdminFile(file, "course_intro_video", (progress) => setIntroVideoUploadProgress(progress.percent));
      updateDraft("introVideoUrl", url);
      setStatus("路径介绍视频已上传，保存路径后生效。");
    } catch (error) {
      setStatus(`介绍视频上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingIntroVideo(false);
      setIntroVideoUploadProgress(null);
    }
  }

  async function readLearningPathError(response: Response) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    if (payload?.detail === "Some courses cannot be added to this learning path") {
      return "部分课程不属于当前机构或已经不存在，不能加入学习路径。";
    }
    return typeof payload?.detail === "string" ? payload.detail : `服务器返回 ${response.status}`;
  }

  async function saveLearningPath() {
    if (!draft.title.trim()) {
      setStatus("请填写学习路径标题。");
      return;
    }
    setSaving(true);
    setStatus("正在保存学习路径...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/learning-paths${isNew ? "" : `/${draft.id}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(learningPathToApiPayload(draft))
      });
      if (!response.ok) {
        throw new Error(await readLearningPathError(response));
      }
      const savedPath = learningPathFromApi((await response.json()) as ApiLearningPath);
      setPaths((currentPaths) => {
        if (isNew) {
          return [savedPath, ...currentPaths];
        }
        return currentPaths.map((path) => (path.id === savedPath.id ? savedPath : path));
      });
      setSelectedPathId(savedPath.id);
      setDraft(savedPath);
      setStatus("学习路径已保存。");
    } catch (error) {
      setStatus(uploadFailureMessage(error, "学习路径保存失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteLearningPath() {
    if (isNew) {
      setDraft(createBlankLearningPathDraft());
      setStatus("已取消新学习路径草稿。");
      return;
    }
    const confirmed = await confirmDelete({
      title: "删除学习路径",
      itemName: draft.title,
      description: "删除后，该学习路径会从后台和前台列表中移除，路径中的课程本身不会被删除。请确认是否继续。"
    });
    if (!confirmed) return;

    setDeleting(true);
    setStatus("正在删除学习路径...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/learning-paths/${draft.id}`, {
        method: "DELETE",
        headers: getAdminRequestHeaders()
      });
      if (!response.ok) {
        throw new Error(`服务器返回 ${response.status}`);
      }
      const nextPaths = paths.filter((path) => path.id !== draft.id);
      setPaths(nextPaths);
      const nextPath = nextPaths[0] ?? null;
      setSelectedPathId(nextPath?.id ?? null);
      setDraft(nextPath ?? createBlankLearningPathDraft());
      setStatus("学习路径已删除。");
    } catch (error) {
      setStatus(uploadFailureMessage(error, "学习路径删除失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_1fr]">
      {deleteConfirmDialog}
      <section className="panel rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">学习路径</h2>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
          <button
            type="button"
            onClick={addLearningPath}
            className="focus-ring inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-coral px-4 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54]"
          >
            <Plus size={16} /> 新增路径
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {paths.map((path) => (
            <button
              key={path.id}
              type="button"
              onClick={() => setSelectedPathId(path.id)}
              className={`focus-ring rounded-lg border p-4 text-left transition ${
                selectedPathId === path.id
                  ? "border-mint bg-mint/10"
                  : "border-slate-200 bg-white hover:border-mint/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{path.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{path.courseIds.length} 门课程</p>
                  <p className="mt-2 text-xs font-bold text-slate-400">{path.audience || "学生人群未设置"}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    path.status === "published" ? "bg-mint/12 text-mint" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {path.status === "published" ? "已发布" : "草稿"}
                </span>
              </div>
            </button>
          ))}
          {!paths.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
              暂时还没有学习路径。
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">路径编辑</h2>
            <p className="mt-1 text-sm text-slate-500">把多个课程组合成一个循序渐进的系列课程。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={deleteLearningPath}
              disabled={deleting}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral/30 px-4 py-2 text-sm font-bold text-coral hover:bg-coral/10 disabled:opacity-60"
            >
              <Trash2 size={16} /> 删除路径
            </button>
            <button
              type="button"
              onClick={saveLearningPath}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              <Save size={16} /> 保存路径
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            路径标题
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="例如：IB 中文写作完整路径"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            状态
            <select
              value={draft.status}
              onChange={(event) => updateDraft("status", event.target.value as LearningPathStatus)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            副标题
            <input
              value={draft.subtitle}
              onChange={(event) => updateDraft("subtitle", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="用一句话说明这条学习路径"
            />
          </label>
          <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-700">路径封面图</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-[12rem_1fr]">
                {draft.coverUrl ? (
                  <img
                    src={draft.coverUrl}
                    alt={draft.title || "学习路径封面"}
                    className="h-32 w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center rounded-lg border border-dashed border-slate-200 bg-white text-sm font-bold text-slate-400">
                    尚未上传封面
                  </div>
                )}
                <div className="flex flex-col justify-center gap-3">
                  <label className="focus-ring inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-mint">
                    {uploadingCover ? <UploadProgressRing progress={coverUploadProgress} /> : <ImagePlus size={16} />} {uploadingCover ? "上传中" : "封面图片"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingCover}
                      onChange={(event) => {
                        void uploadLearningPathCover(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {draft.coverUrl ? (
                    <button
                      type="button"
                      onClick={() => updateDraft("coverUrl", "")}
                      className="focus-ring w-fit rounded-lg border border-coral/30 bg-white px-4 py-2 text-sm font-bold text-coral hover:bg-coral/10"
                    >
                      移除封面
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-700">路径介绍视频</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-[12rem_1fr]">
                {draft.introVideoUrl ? (
                  <video
                    controls
                    src={draft.introVideoUrl}
                    className="h-32 w-full rounded-lg bg-ink object-contain"
                  />
                ) : (
                  <div className="grid h-32 place-items-center rounded-lg border border-dashed border-slate-200 bg-white text-sm font-bold text-slate-400">
                    尚未上传视频
                  </div>
                )}
                <div className="flex flex-col justify-center gap-3">
                  <label className="focus-ring inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-mint">
                    {uploadingIntroVideo ? <UploadProgressRing progress={introVideoUploadProgress} /> : <Video size={16} />} {uploadingIntroVideo ? "上传中" : "介绍视频"}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={uploadingIntroVideo}
                      onChange={(event) => {
                        void uploadLearningPathIntroVideo(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {draft.introVideoUrl ? (
                    <button
                      type="button"
                      onClick={() => updateDraft("introVideoUrl", "")}
                      className="focus-ring w-fit rounded-lg border border-coral/30 bg-white px-4 py-2 text-sm font-bold text-coral hover:bg-coral/10"
                    >
                      移除视频
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            适合人群
            <input
              value={draft.audience}
              onChange={(event) => updateDraft("audience", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="例如：A1-A2 初级学习者"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            路径级别
            <input
              value={draft.level}
              onChange={(event) => updateDraft("level", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="例如：A1-B1"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700 lg:col-span-2">
            路径介绍
            <textarea
              value={draft.description}
              onChange={(event) => updateDraft("description", event.target.value)}
              className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6"
              placeholder="说明学习目标、课程安排和完成后能达到的能力。"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">可选课程</h3>
                <p className="mt-1 text-sm text-slate-500">选择当前机构可管理的课程加入路径。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                {availableCourses.length} 门
              </span>
            </div>
            <div className="mt-4 grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
              {availableCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  className={`focus-ring grid gap-3 rounded-lg border p-3 text-left transition md:grid-cols-[5rem_1fr_auto] ${
                    selectedCourseIds.has(course.id)
                      ? "border-mint bg-mint/10"
                      : "border-slate-200 bg-white hover:border-mint/50"
                  }`}
                >
                  {course.image ? (
                    <img src={course.image} alt={course.title} className="h-16 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-16 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400">
                      无封面
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{course.title}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {course.category} · {course.level}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{course.teacher}</p>
                  </div>
                  <span
                    className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${
                      course.statusValue === "published" ? "bg-mint/12 text-mint" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {course.status}
                  </span>
                </button>
              ))}
              {!availableCourses.length ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-500">
                  暂时没有可选择的课程。
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">路径课程顺序</h3>
                <p className="mt-1 text-sm text-slate-500">课程会按照这里的顺序显示在前台。</p>
              </div>
              <span className="rounded-full bg-mint/12 px-3 py-1 text-xs font-bold text-mint">
                {selectedCourses.length} 门
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {selectedCourses.map((course, index) => (
                <div key={course.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-coral">第 {index + 1} 门课</p>
                      <p className="mt-1 truncate font-bold text-ink">{course.title}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {course.category} · {course.level}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => moveCourse(course.id, -1)}
                        disabled={index === 0}
                        className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-40"
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCourse(course.id, 1)}
                        disabled={index === selectedCourses.length - 1}
                        className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-40"
                      >
                        下移
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCourse(course.id)}
                        className="focus-ring rounded-lg border border-coral/30 bg-white px-2 py-1 text-xs font-bold text-coral"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!selectedCourses.length ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm font-semibold text-slate-500">
                  还没有添加课程，请从左侧选择。
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function CourseManagement({ isActive }: { isActive: boolean }) {
  const profile = useAdminProfile();
  const [courses, setCourses] = useState<AdminCourseSummary[]>([]);
  const [courseCategories, setCourseCategories] = useState<CourseCategory[]>([]);
  const [courseLevelOptions, setCourseLevelOptions] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(emptyCourseSummary.id);
  const [courseDetailReloadToken, setCourseDetailReloadToken] = useState(0);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<number | null>(null);
  const [courseTeacherFilter, setCourseTeacherFilter] = useState<number | "all" | "self">("self");
  const isSuperAdmin = profile.roleValue === "super_admin";
  const currentTeacherOption =
    teacherOptions.find((teacher) => teacher.sourceUserId === currentAdminUserId) ?? null;
  const currentTeacherId = currentTeacherOption?.id ?? null;
  const resolvedCourseTeacherFilter =
    isSuperAdmin && courseTeacherFilter === "self"
      ? currentTeacherId ?? "all"
      : courseTeacherFilter;
  const visibleCourses = useMemo(() => {
    if (!isSuperAdmin || resolvedCourseTeacherFilter === "all") {
      return courses;
    }
    return courses.filter((course) => course.teacherId === resolvedCourseTeacherFilter);
  }, [courses, isSuperAdmin, resolvedCourseTeacherFilter]);
  const hasVisibleCourses = visibleCourses.length > 0;
  const selectedCourse =
    visibleCourses.find((course) => course.id === selectedCourseId) ??
    visibleCourses[0] ??
    emptyCourseSummary;
  const defaultCourseDraft = createDefaultCourseDraft(selectedCourse, teacherOptions);
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(defaultCourseDraft);
  const courseDraftRef = useRef<CourseDraft>(defaultCourseDraft);
  const courseDetailRequestKeyRef = useRef(0);
  const [availableQuestions, setAvailableQuestions] = useState<CourseQuestion[]>(() =>
    fallbackAdminQuestions
      .map((question) => normalizeQuestionForCoursePicker(question))
      .filter((question): question is CourseQuestion => Boolean(question))
  );
  const [questionOwnerOptions, setQuestionOwnerOptions] = useState<CourseQuestionOwnerOption[]>([]);
  const [questionPoolReloadToken, setQuestionPoolReloadToken] = useState(0);
  const [courseMessage, setCourseMessage] = useState("课程编辑内容会保留在本地草稿中。");
  const [savingCourse, setSavingCourse] = useState(false);
  const [publishingCourse, setPublishingCourse] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIntroVideo, setUploadingIntroVideo] = useState(false);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState<number | null>(null);
  const selectedCourseTeacherId = courseDraft.teacherId ?? selectedCourse.teacherId;
  const selectedCourseBelongsToCurrentUser = Boolean(
    currentTeacherId && selectedCourseTeacherId === currentTeacherId
  );
  const isViewingAnotherTeacher =
    isSuperAdmin &&
    resolvedCourseTeacherFilter !== "all" &&
    resolvedCourseTeacherFilter !== currentTeacherId;
  const canEditSelectedCourse =
    !isSuperAdmin ||
    selectedCourseBelongsToCurrentUser ||
    (!isViewingAnotherTeacher && isLocalNewCourse(courseDraft.courseId));
  const shouldShowCourseEditor =
    hasVisibleCourses || (!isViewingAnotherTeacher && isLocalNewCourse(selectedCourse.id));
  const canUseCourseActions = shouldShowCourseEditor && canEditSelectedCourse;
  const selectedCourseStatus =
    courses.find((course) => course.id === courseDraft.courseId)?.statusValue ?? "draft";
  const isSelectedCoursePublished = selectedCourseStatus === "published";
  const canModifyCourseContent = canUseCourseActions && !isSelectedCoursePublished;
  const canSaveSelectedCourse = canModifyCourseContent;
  const courseCategoryOptions = useMemo(
    () => selectableCourseCategoryLabels(courseCategories),
    [courseCategories]
  );
  const visibleCourseLevelOptions = useMemo(() => {
    if (courseLevelOptions.length > 0) {
      return courseLevelOptions;
    }
    if (courseDraft.level) {
      return [courseDraft.level];
    }
    return [];
  }, [courseDraft.level, courseLevelOptions]);

  function replaceCourseDraft(nextDraft: CourseDraft) {
    courseDraftRef.current = nextDraft;
    setCourseDraft(nextDraft);
  }

  useEffect(() => {
    let ignore = false;

    async function loadCourseCatalog() {
      const sessionUser = getAdminSessionUser();
      const sessionUserId = sessionUser?.id ?? getAdminSessionUserId();
      if (!ignore) {
        setCurrentAdminUserId(sessionUserId);
      }
      let loadedTeachers: TeacherOption[] = [];
      try {
        const [coursesResponse, teachersResponse, categoriesResponse, levelsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/courses`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          }),
          fetch(`${API_BASE_URL}/admin/teachers`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          }),
          fetch(`${API_BASE_URL}/admin/course-categories`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          }),
          fetch(`${API_BASE_URL}/admin/difficulty-levels`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          })
        ]);
        if (ignore) {
          return;
        }
        if (teachersResponse.ok) {
          const teachers = ((await teachersResponse.json()) as ApiTeacher[]).map((teacher) =>
            normalizeTeacherFromApi(teacher)
          );
          loadedTeachers = teachers;
          setTeacherOptions(teachers);
        }
        if (categoriesResponse.ok) {
          const categories = ((await categoriesResponse.json()) as ApiCourseCategory[]).map((category) =>
            courseCategoryFromApi(category)
          );
          setCourseCategories(categories);
        } else {
          setCourseCategories([]);
        }
        if (levelsResponse.ok) {
          const levelsData = (await levelsResponse.json()) as { levels?: unknown };
          const levels = Array.isArray(levelsData.levels)
            ? levelsData.levels.filter((level): level is string => typeof level === "string")
            : [];
          setCourseLevelOptions(levels);
        } else {
          setCourseLevelOptions([]);
        }
        if (coursesResponse.ok) {
          const apiCourses = ((await coursesResponse.json()) as ApiCourseCard[]).map((course) =>
            normalizeCourseCardFromApi(course)
          );
          setCourses(apiCourses);
          if (apiCourses.length > 0) {
            const storedCourseId = readSelectedCourseIdFromStorage();
            const ownTeacher = sessionUser
              ? loadedTeachers.find((teacher) => teacher.sourceUserId === sessionUser.id)
              : null;
            const ownCourseId = ownTeacher
              ? apiCourses.find((course) => course.teacherId === ownTeacher.id)?.id ?? null
              : null;
            setSelectedCourseId((currentId) => {
              const sessionIsSuperAdmin = sessionUser?.role === "super_admin";
              const preferredCourseId =
                sessionIsSuperAdmin && ownCourseId ? ownCourseId : storedCourseId ?? ownCourseId ?? currentId;
              const nextCourseId = apiCourses.some((course) => course.id === preferredCourseId)
                ? preferredCourseId
                : ownCourseId ?? apiCourses[0].id;
              persistSelectedCourseId(nextCourseId);
              return nextCourseId;
            });
          } else {
            setSelectedCourseId(emptyCourseSummary.id);
            persistSelectedCourseId(emptyCourseSummary.id);
            replaceCourseDraft(createDefaultCourseDraft(emptyCourseSummary, loadedTeachers));
            setCourseMessage("当前数据库中还没有课程，请先新增课程。");
          }
        }
      } catch {
        if (!ignore) {
          setCourses([]);
          setCourseCategories([]);
          setCourseLevelOptions([]);
          setTeacherOptions([]);
          setSelectedCourseId(emptyCourseSummary.id);
          replaceCourseDraft(createDefaultCourseDraft(emptyCourseSummary, []));
          setCourseMessage("后台课程列表暂时不可连接，未显示本地演示课程。");
        }
      }
    }

    void loadCourseCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function refreshCourseCategories() {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/course-categories`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        });
        if (!response.ok || ignore) {
          return;
        }
        const categories = ((await response.json()) as ApiCourseCategory[]).map((category) =>
          courseCategoryFromApi(category)
        );
        setCourseCategories(categories);
      } catch {
        if (!ignore) {
          setCourseCategories([]);
        }
      }
    }

    const handleCourseCategoryChange = () => {
      void refreshCourseCategories();
    };
    window.addEventListener(COURSE_CATEGORY_CHANGE_EVENT, handleCourseCategoryChange);
    return () => {
      ignore = true;
      window.removeEventListener(COURSE_CATEGORY_CHANGE_EVENT, handleCourseCategoryChange);
    };
  }, []);

  useEffect(() => {
    const nextDefaultDraft = createDefaultCourseDraft(selectedCourse, teacherOptions);
    let ignore = false;

    if (selectedCourse.id === emptyCourseSummary.id) {
      const emptyDraftTimer = window.setTimeout(() => {
        if (ignore) return;
        replaceCourseDraft(nextDefaultDraft);
        setCourseMessage("当前数据库中还没有课程，请先新增课程。");
      }, 0);
      return () => {
        ignore = true;
        window.clearTimeout(emptyDraftTimer);
      };
    }

    if (isLocalNewCourse(selectedCourse.id)) {
      const localDraftTimer = window.setTimeout(() => {
        if (ignore) return;
        replaceCourseDraft(nextDefaultDraft);
        setCourseMessage("正在编辑新课程草稿。");
      }, 0);
      return () => {
        ignore = true;
        window.clearTimeout(localDraftTimer);
      };
    }

    const requestKey = courseDetailRequestKeyRef.current + 1;
    courseDetailRequestKeyRef.current = requestKey;
    const loadingMessageTimer = window.setTimeout(() => {
      if (!ignore && requestKey === courseDetailRequestKeyRef.current) {
        setCourseMessage("正在加载课程详情...");
      }
    }, 0);

    async function loadCourseDetail() {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/courses/${selectedCourse.id}`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        });
        if (ignore || requestKey !== courseDetailRequestKeyRef.current) {
          return;
        }
        window.clearTimeout(loadingMessageTimer);
        if (!response.ok) {
          if (hasStoredCourseDraft(selectedCourse.id)) {
            replaceCourseDraft(readCourseDraft(nextDefaultDraft));
            setCourseMessage("后台课程详情暂时不可连接，已加载本地草稿。");
          } else {
            replaceCourseDraft(nextDefaultDraft);
            setCourseMessage(`课程详情加载失败，服务器返回 ${response.status}。`);
          }
          return;
        }
        const detail = (await response.json()) as ApiCourseDetail;
        if (ignore || requestKey !== courseDetailRequestKeyRef.current) {
          return;
        }
        const nextDraft = courseDraftFromApi(detail, nextDefaultDraft, teacherOptions);
        replaceCourseDraft(nextDraft);
        persistCourseDraft(nextDraft);
        setCourseMessage("课程编辑内容会保留在本地草稿中。");
      } catch {
        window.clearTimeout(loadingMessageTimer);
        if (!ignore && requestKey === courseDetailRequestKeyRef.current) {
          if (hasStoredCourseDraft(selectedCourse.id)) {
            replaceCourseDraft(readCourseDraft(nextDefaultDraft));
            setCourseMessage("后台暂时不可连接，当前使用本地课程草稿。");
          } else {
            replaceCourseDraft(nextDefaultDraft);
            setCourseMessage("后台暂时不可连接，当前显示课程列表中的基础信息。");
          }
        }
      }
    }
    void loadCourseDetail();

    return () => {
      ignore = true;
      window.clearTimeout(loadingMessageTimer);
    };
  }, [selectedCourse, teacherOptions, courseDetailReloadToken]);

  useEffect(() => {
    let ignore = false;
    async function loadQuestions() {
      const sessionUser = getAdminSessionUser();
      const sessionUserId = sessionUser?.id ?? getAdminSessionUserId();
      if (!ignore) {
        setCurrentAdminUserId(sessionUserId);
      }
      try {
        const [questionsResponse, creatorsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/question-pool`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          }),
          fetch(`${API_BASE_URL}/admin/question-creators`, {
            headers: getAdminRequestHeaders(),
            cache: "no-store"
          })
        ]);
        if (ignore) {
          return;
        }
        if (creatorsResponse.ok) {
          const owners = ((await creatorsResponse.json()) as ApiManagedUser[]).map(questionOwnerFromApi);
          setQuestionOwnerOptions(sortQuestionOwners(owners, sessionUserId));
        } else if (sessionUser) {
          setQuestionOwnerOptions(
            sortQuestionOwners(
              [
                {
                  id: sessionUser.id,
                  name: sessionUser.full_name,
                  role: normalizeManagedUserRole(sessionUser.role)
                }
              ],
              sessionUserId
            )
          );
        }
        if (questionsResponse.ok) {
          const questions = ((await questionsResponse.json()) as unknown[])
            .map((question) => normalizeQuestionForCoursePicker(question))
            .filter((question): question is CourseQuestion => Boolean(question));
          setAvailableQuestions(questions);
        } else if (sessionUser) {
          setAvailableQuestions((currentQuestions) =>
            currentQuestions.map((question) =>
              question.createdByUserId === null
                ? { ...question, createdByUserId: sessionUserId }
                : question
            )
          );
        }
      } catch {
        // Keep bundled demo questions when the local API is not running.
        if (!ignore && sessionUser) {
          setAvailableQuestions((currentQuestions) =>
            currentQuestions.map((question) =>
              question.createdByUserId === null
                ? { ...question, createdByUserId: sessionUserId }
                : question
            )
          );
          setQuestionOwnerOptions(
            sortQuestionOwners(
              [
                {
                  id: sessionUserId,
                  name: sessionUser.full_name,
                  role: normalizeManagedUserRole(sessionUser.role)
                }
              ],
              sessionUserId
            )
          );
        }
      }
    }
    void loadQuestions();

    const handleQuestionBankChange = () => {
      setQuestionPoolReloadToken((current) => current + 1);
    };
    window.addEventListener(QUESTION_BANK_CHANGE_EVENT, handleQuestionBankChange);

    return () => {
      ignore = true;
      window.removeEventListener(QUESTION_BANK_CHANGE_EVENT, handleQuestionBankChange);
    };
  }, [questionPoolReloadToken]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const refreshTimer = window.setTimeout(() => {
      setQuestionPoolReloadToken((current) => current + 1);
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [isActive]);

  function updateCourseDraftWith(updater: (current: CourseDraft) => CourseDraft) {
    if (!canModifyCourseContent) {
      setCourseMessage(
        isSelectedCoursePublished
          ? "课程已发布，请先取消发布后再编辑。"
          : "当前正在查看其他老师的课程，只能查看，不能编辑。"
      );
      return;
    }
    const next = normalizeCourseDraft(updater(courseDraftRef.current), defaultCourseDraft, teacherOptions);
    replaceCourseDraft(next);
    persistCourseDraft(next);
    setCourseMessage("已保存到本地草稿。");
  }

  function selectCourse(courseId: number) {
    const course = courses.find((item) => item.id === courseId);
    if (!course) {
      return;
    }
    if (course.id === selectedCourseId) {
      setCourseDetailReloadToken((current) => current + 1);
      setCourseMessage("正在加载课程详情...");
      return;
    }
    const nextDefaultDraft = createDefaultCourseDraft(course, teacherOptions);
    setSelectedCourseId(course.id);
    persistSelectedCourseId(course.id);
    if (isLocalNewCourse(course.id)) {
      replaceCourseDraft(nextDefaultDraft);
    }
    setCourseMessage(
      isLocalNewCourse(course.id) ? "正在编辑新课程草稿。" : "正在加载课程详情..."
    );
  }

  function changeCourseTeacherFilter(nextFilter: number | "all" | "self") {
    setCourseTeacherFilter(nextFilter);
    const nextResolvedFilter =
      isSuperAdmin && nextFilter === "self" ? currentTeacherId ?? "all" : nextFilter;
    const nextVisibleCourses =
      !isSuperAdmin || nextResolvedFilter === "all"
        ? courses
        : courses.filter((course) => course.teacherId === nextResolvedFilter);
    const nextCourse = nextVisibleCourses[0] ?? null;
    if (!nextCourse) {
      setSelectedCourseId(emptyCourseSummary.id);
      persistSelectedCourseId(emptyCourseSummary.id);
      replaceCourseDraft(createDefaultCourseDraft(emptyCourseSummary, teacherOptions));
      setCourseMessage("该老师暂时还没有课程。");
      return;
    }
    setSelectedCourseId(nextCourse.id);
    persistSelectedCourseId(nextCourse.id);
    setCourseMessage("正在加载课程详情...");
  }

  function startNewCourse() {
    if (isViewingAnotherTeacher) {
      setCourseMessage("当前正在查看其他老师的课程，不能新增课程。");
      return;
    }
    if (teacherOptions.length === 0) {
      setCourseMessage("请先在用户权限管理中创建角色为老师的真实用户。");
      return;
    }
    if (isSuperAdmin && !currentTeacherOption) {
      setCourseMessage("正在同步当前账号的老师资料，请稍后再新增课程。");
      return;
    }
    const ownerTeacherOptions =
      isSuperAdmin && currentTeacherOption ? [currentTeacherOption] : teacherOptions;
    const newCourse = createNewCourseSummary(ownerTeacherOptions);
    const newDraft = createDefaultCourseDraft(newCourse, ownerTeacherOptions);
    setCourses((current) => [newCourse, ...current]);
    setSelectedCourseId(newCourse.id);
    persistSelectedCourseId(newCourse.id);
    replaceCourseDraft(newDraft);
    persistCourseDraft(newDraft);
    setCourseMessage("正在编辑新课程草稿。填写信息后点击保存课程。");
  }

  function updateCourseDraft<K extends keyof CourseDraft>(field: K, value: CourseDraft[K]) {
    updateCourseDraftWith((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (!canModifyCourseContent || courseLevelOptions.length === 0) {
      return;
    }
    if (courseDraft.level && courseLevelOptions.includes(courseDraft.level)) {
      return;
    }
    const nextLevel = courseLevelOptions[0];
    const timer = window.setTimeout(() => {
      const nextDraft = { ...courseDraftRef.current, level: nextLevel };
      courseDraftRef.current = nextDraft;
      setCourseDraft(nextDraft);
      persistCourseDraft(nextDraft);
      setCourseMessage("已自动使用当前机构的课程级别。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canModifyCourseContent, courseDraft.courseId, courseDraft.level, courseLevelOptions]);

  function updateCourseTeacher(teacherId: string) {
    const teacher = getTeacherById(Number(teacherId), teacherOptions);
    if (!teacher) {
      return;
    }
    updateCourseDraftWith((current) => ({
      ...current,
      teacher: teacher.name,
      teacherId: teacher.id
    }));
  }

  async function handleCoverUpload(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }
    setUploadingCover(true);
    setCoverUploadProgress(1);
    setCourseMessage("正在上传课程封面...");
    try {
      const url = await uploadAdminFile(file, "course_cover", (progress) => setCoverUploadProgress(progress.percent));
      updateCourseDraft("coverUrl", url);
      setCourseMessage("课程封面已上传。");
    } catch (error) {
      setCourseMessage(`课程封面上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingCover(false);
      setCoverUploadProgress(null);
    }
  }

  async function handleIntroVideoUpload(file: File | undefined) {
    if (!file || !file.type.startsWith("video/")) {
      return;
    }
    setUploadingIntroVideo(true);
    setIntroVideoUploadProgress(1);
    setCourseMessage("正在上传介绍视频...");
    try {
      const url = await uploadAdminFile(file, "course_intro_video", (progress) => setIntroVideoUploadProgress(progress.percent));
      updateCourseDraft("introVideoUrl", url);
      setCourseMessage("介绍视频已上传。");
    } catch (error) {
      setCourseMessage(`介绍视频上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingIntroVideo(false);
      setIntroVideoUploadProgress(null);
    }
  }

  function addChapter() {
    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters([
        ...current.chapters,
        createNewCourseChapter(current.chapters.length + 1)
      ])
    }));
  }

  function updateChapter(chapterLocalId: string, patch: Partial<CourseChapterDraft>) {
    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters(
        current.chapters.map((chapter) =>
          chapter.localId === chapterLocalId ? { ...chapter, ...patch } : chapter
        )
      )
    }));
  }

  async function removeChapter(chapterLocalId: string) {
    const chapter = courseDraftRef.current?.chapters.find((entry) => entry.localId === chapterLocalId);
    const confirmed = await confirmDelete({
      title: "\u5220\u9664\u7ae0\u8282",
      itemName: chapter?.title.trim() || "\u672a\u547d\u540d\u7ae0\u8282",
      description: "\u5220\u9664\u7ae0\u8282\u4f1a\u540c\u65f6\u79fb\u9664\u8be5\u7ae0\u8282\u4e0b\u7684\u6240\u6709\u8bfe\u7a0b\u9879\u76ee\u3002\u4fdd\u5b58\u8bfe\u7a0b\u540e\u751f\u6548\u3002",
    });
    if (!confirmed) return;

    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters(current.chapters.filter((chapter) => chapter.localId !== chapterLocalId))
    }));
  }

  function addLessonItem(chapterLocalId: string, itemType: CourseLessonItemType) {
    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters(
        current.chapters.map((chapter) =>
          chapter.localId === chapterLocalId
            ? {
                ...chapter,
                items: [
                  ...chapter.items,
                  createNewCourseLessonItem(itemType, chapter.items.length + 1)
                ]
              }
            : chapter
        )
      )
    }));
  }

  function updateLessonItem(
    chapterLocalId: string,
    itemLocalId: string,
    patch: Partial<CourseLessonItemDraft>
  ) {
    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters(
        current.chapters.map((chapter) =>
          chapter.localId === chapterLocalId
            ? {
                ...chapter,
                items: chapter.items.map((item) =>
                  item.localId === itemLocalId ? { ...item, ...patch } : item
                )
              }
            : chapter
        )
      )
    }));
  }

  async function removeLessonItem(chapterLocalId: string, itemLocalId: string) {
    const chapter = courseDraftRef.current?.chapters.find((entry) => entry.localId === chapterLocalId);
    const item = chapter?.items.find((entry) => entry.localId === itemLocalId);
    const confirmed = await confirmDelete({
      title: `\u5220\u9664${item ? courseLessonItemDefaultTitle(item.itemType) : "\u8bfe\u7a0b\u9879\u76ee"}`,
      itemName: item?.title.trim() || (item ? courseLessonItemDefaultTitle(item.itemType) : "\u8bfe\u7a0b\u9879\u76ee"),
      description: "\u8be5\u9879\u76ee\u4f1a\u4ece\u5f53\u524d\u7ae0\u8282\u4e2d\u79fb\u9664\u3002\u4fdd\u5b58\u8bfe\u7a0b\u540e\u751f\u6548\u3002",
    });
    if (!confirmed) return;

    updateCourseDraftWith((current) => ({
      ...current,
      chapters: reindexCourseChapters(
        current.chapters.map((chapter) =>
          chapter.localId === chapterLocalId
            ? {
                ...chapter,
                items: chapter.items.filter((item) => item.localId !== itemLocalId)
              }
            : chapter
        )
      )
    }));
  }

  async function persistCourse(status: CoursePublicationStatus) {
    if (!canEditSelectedCourse) {
      throw new Error("当前正在查看其他老师的课程，只能查看，不能编辑。");
    }
    const isPublishing = status === "published";
    setCourseMessage(isPublishing ? "正在发布课程..." : "正在保存课程草稿...");
    const currentDraft = courseDraftRef.current;
    if (!currentDraft.title.trim()) {
      throw new Error("请填写课程标题。");
    }
    if (!currentDraft.category.trim()) {
      throw new Error("请选择课程类别。");
    }
    if (!currentDraft.level.trim()) {
      throw new Error("请选择课程级别。");
    }
    const selectedTeacher =
      getTeacherById(currentDraft.teacherId, teacherOptions) ??
      getTeacherByName(currentDraft.teacher, teacherOptions);
    if (!selectedTeacher) {
      throw new Error("请先在用户权限管理中创建角色为老师的用户，并在课程编辑中选择授课老师。");
    }
    const selectedSummary = courses.find((course) => course.id === currentDraft.courseId) ?? selectedCourse;
    let targetCourseId = currentDraft.courseId;
    const creatingNewCourse = isLocalNewCourse(currentDraft.courseId);

    if (creatingNewCourse) {
      setCourseMessage(isPublishing ? "正在创建并发布新课程..." : "正在创建新课程草稿...");
      let createResponse: Response;
      try {
        createResponse = await fetch(`${API_BASE_URL}/admin/courses`, {
          method: "POST",
          headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(courseDraftToCreatePayload(currentDraft, selectedSummary, teacherOptions))
        });
      } catch {
        throw new Error(apiConnectionErrorMessage("无法连接课程服务"));
      }
      if (!createResponse.ok) {
        let detail = "";
        try {
          const errorPayload = (await createResponse.json()) as { detail?: unknown };
          detail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
        } catch {
          detail = "";
        }
        throw new Error(detail || `新课程创建失败，服务器返回 ${createResponse.status}。`);
      }
      const createdCourse = (await createResponse.json()) as ApiCourseCard;
      targetCourseId = createdCourse.id;
    }

    const draftForSave = { ...currentDraft, courseId: targetCourseId };
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/admin/courses/${targetCourseId}`, {
        method: "PUT",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(courseDraftToApiPayload(draftForSave, teacherOptions, status))
      });
    } catch {
      throw new Error(apiConnectionErrorMessage("无法连接课程服务"));
    }
    if (!response.ok) {
      let detail = "";
      try {
        const errorPayload = (await response.json()) as { detail?: unknown };
        detail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
      } catch {
        detail = "";
      }
      if (response.status === 404) {
        throw new Error("课程不存在，请刷新课程列表后再保存。");
      }
      throw new Error(detail || `课程保存失败，服务器返回 ${response.status}。`);
    }
    const detail = (await response.json()) as ApiCourseDetail;
    const updatedSummary = applyCoursePublicationStatus(normalizeCourseCardFromApi(detail), status);
    const nextDraft = courseDraftFromApi(
      detail,
      createDefaultCourseDraft(updatedSummary, teacherOptions),
      teacherOptions
    );
    setCourses((current) => {
      const withoutLocalDraft = current.filter((course) => course.id !== currentDraft.courseId);
      return withoutLocalDraft.some((course) => course.id === updatedSummary.id)
        ? withoutLocalDraft.map((course) =>
            course.id === updatedSummary.id ? updatedSummary : course
          )
        : [updatedSummary, ...withoutLocalDraft];
    });
    setSelectedCourseId(updatedSummary.id);
    persistSelectedCourseId(updatedSummary.id);
    replaceCourseDraft(nextDraft);
    persistCourseDraft(nextDraft);
    if (creatingNewCourse && typeof window !== "undefined") {
      window.sessionStorage.removeItem(courseDraftStorageKey(currentDraft.courseId));
    }
    notifyCourseContentChanged(detail);
    setCourseMessage(isPublishing ? "课程已发布，学生端可以看到。" : "课程已保存为草稿。");
    return detail;
  }

  async function saveCourse() {
    if (!canUseCourseActions) {
      setCourseMessage("当前正在查看其他老师的课程，只能查看，不能保存。");
      return;
    }
    const currentDraft = courseDraftRef.current;
    const currentStatus =
      courses.find((course) => course.id === currentDraft.courseId)?.statusValue ?? "draft";
    if (currentStatus === "published") {
      setCourseMessage("课程已发布，请先取消发布后再编辑和保存。");
      return;
    }
    setSavingCourse(true);
    try {
      await persistCourse("draft");
      setCourseMessage("课程已保存为草稿。");
    } catch (error) {
      persistCourseDraft(courseDraftRef.current);
      setCourseMessage(`课程保存失败：${uploadFailureMessage(error, "当前内容已保留在本地草稿。")}`);
    } finally {
      setSavingCourse(false);
    }
  }

  async function updateCourseStatusOnly(status: CoursePublicationStatus) {
    if (!canUseCourseActions) {
      throw new Error("当前正在查看其他老师的课程，只能查看，不能发布或取消发布。");
    }
    const currentDraft = courseDraftRef.current;
    if (isLocalNewCourse(currentDraft.courseId)) {
      throw new Error("新课程需要先保存课程，再发布。");
    }
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/admin/courses/${currentDraft.courseId}`, {
        method: "PUT",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status })
      });
    } catch {
      throw new Error(apiConnectionErrorMessage("无法连接课程服务"));
    }
    if (!response.ok) {
      let detail = "";
      try {
        const errorPayload = (await response.json()) as { detail?: unknown };
        detail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
      } catch {
        detail = "";
      }
      throw new Error(detail || `课程状态更新失败，服务器返回 ${response.status}。`);
    }
    const detail = (await response.json()) as ApiCourseDetail;
    const updatedSummary = applyCoursePublicationStatus(normalizeCourseCardFromApi(detail), status);
    const nextDraft = courseDraftFromApi(
      detail,
      createDefaultCourseDraft(updatedSummary, teacherOptions),
      teacherOptions
    );
    setCourses((current) =>
      current.some((course) => course.id === updatedSummary.id)
        ? current.map((course) => (course.id === updatedSummary.id ? updatedSummary : course))
        : [updatedSummary, ...current]
    );
    setSelectedCourseId(updatedSummary.id);
    persistSelectedCourseId(updatedSummary.id);
    replaceCourseDraft(nextDraft);
    persistCourseDraft(nextDraft);
    notifyCourseContentChanged(detail);
    setCourseMessage(
      status === "published" ? "课程已发布，学生端可以看到。" : "课程已取消发布，可以继续编辑和保存。"
    );
    return detail;
  }

  async function publishCourse() {
    if (!canUseCourseActions) {
      setCourseMessage("当前正在查看其他老师的课程，只能查看，不能发布或取消发布。");
      return;
    }
    setPublishingCourse(true);
    const currentDraft = courseDraftRef.current;
    const currentStatus =
      courses.find((course) => course.id === currentDraft.courseId)?.statusValue ?? "draft";
    const nextStatus: CoursePublicationStatus = currentStatus === "published" ? "draft" : "published";
    try {
      if (nextStatus === "published") {
        await persistCourse("published");
      } else {
        await updateCourseStatusOnly("draft");
      }
    } catch (error) {
      persistCourseDraft(courseDraftRef.current);
      setCourseMessage(
        `${nextStatus === "published" ? "课程发布失败" : "取消发布失败"}：${uploadFailureMessage(
          error,
          "当前内容已保留在本地草稿。"
        )}`
      );
    } finally {
      setPublishingCourse(false);
    }
  }

  async function deleteCourse() {
    if (!canUseCourseActions) {
      setCourseMessage("当前正在查看其他老师的课程，只能查看，不能删除。");
      return;
    }
    const currentDraft = courseDraftRef.current;
    const currentCourse = courses.find((course) => course.id === currentDraft.courseId) ?? selectedCourse;
    const confirmed = await confirmDelete({
      title: "\u5220\u9664\u8bfe\u7a0b",
      itemName: currentCourse.title,
      description: "\u8bfe\u7a0b\u4f1a\u4ece\u540e\u53f0\u5217\u8868\u4e2d\u79fb\u9664\u3002\u5df2\u6709\u8ba2\u9605\u6216\u5b66\u4e60\u8bb0\u5f55\u7684\u8bfe\u7a0b\u4f1a\u88ab\u5f52\u6863\u3002",
    });
    if (!confirmed) return;
    setDeletingCourse(true);
    try {
      if (!isLocalNewCourse(currentDraft.courseId)) {
        const response = await fetch(`${API_BASE_URL}/admin/courses/${currentDraft.courseId}`, {
          method: "DELETE",
          headers: getAdminRequestHeaders()
        });
        if (!response.ok) {
          let detail = "";
          try {
            const errorPayload = (await response.json()) as { detail?: unknown };
            detail = typeof errorPayload.detail === "string" ? errorPayload.detail : "";
          } catch {
            detail = "";
          }
          throw new Error(detail || `课程删除失败，服务器返回 ${response.status}。`);
        }
        const result = (await response.json()) as { archived?: boolean };
        setCourseMessage(result.archived ? "课程已有订阅或学习记录，已归档并从列表隐藏。" : "课程已删除。");
      } else {
        setCourseMessage("本地新课程草稿已删除。");
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(courseDraftStorageKey(currentDraft.courseId));
      }
      const remainingCourses = courses.filter((course) => course.id !== currentDraft.courseId);
      const nextCourses = remainingCourses;
      const nextCourse = nextCourses[0] ?? emptyCourseSummary;
      const nextDraft = createDefaultCourseDraft(nextCourse, teacherOptions);
      setCourses(nextCourses);
      setSelectedCourseId(nextCourse.id);
      persistSelectedCourseId(nextCourse.id);
      replaceCourseDraft(nextDraft);
      if (nextCourse.id === emptyCourseSummary.id) {
        setCourseMessage("课程已删除，当前数据库中还没有课程。");
      } else if (isLocalNewCourse(nextCourse.id)) {
        persistCourseDraft(nextDraft);
      }
    } catch (error) {
      setCourseMessage(`课程删除失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setDeletingCourse(false);
    }
  }

  const courseActionBusy = savingCourse || publishingCourse || deletingCourse;
  const publicationActionLabel = selectedCourseStatus === "published" ? "取消发布" : "发布课程";
  const publicationActionBusyLabel = selectedCourseStatus === "published" ? "取消中" : "发布中";
  const shouldShowLegacyCourseCategory =
    Boolean(courseDraft.category) && !courseCategoryOptions.includes(courseDraft.category);

  return (
    <div className="grid gap-5">
      {deleteConfirmDialog}
      <section className="panel overflow-hidden rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">课程列表</h2>
            {isSuperAdmin ? (
              <p className="mt-1 text-sm text-slate-500">超级管理员可以切换老师查看课程，非本人课程为只读。</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {isSuperAdmin ? (
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                查看老师
                <select
                  className="focus-ring min-w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={String(resolvedCourseTeacherFilter)}
                  onChange={(event) =>
                    changeCourseTeacherFilter(
                      event.target.value === "all" ? "all" : Number(event.target.value)
                    )
                  }
                >
                  {currentTeacherOption ? (
                    <option value={currentTeacherOption.id}>我自己 · {currentTeacherOption.name}</option>
                  ) : null}
                  <option value="all">全部老师</option>
                  {teacherOptions.filter((teacher) => teacher.id !== currentTeacherId).map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              onClick={startNewCourse}
              disabled={
                courseActionBusy ||
                isViewingAnotherTeacher ||
                teacherOptions.length === 0 ||
                (isSuperAdmin && !currentTeacherOption)
              }
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} /> 新增课程
            </button>
          </div>
        </div>
        <div className="mt-5 grid min-w-0 grid-cols-[repeat(auto-fill,minmax(18rem,24rem))] justify-start gap-4">
          {visibleCourses.map((course) => (
            <button
              key={course.id}
              onClick={() => selectCourse(course.id)}
              className={`focus-ring h-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-white p-4 text-left transition ${
                course.id === selectedCourse.id ? "border-mint shadow-soft" : "border-slate-200"
              }`}
            >
              {course.image ? (
                <img src={course.image} alt={course.title} className="h-32 w-full max-w-full rounded-lg object-cover" />
              ) : (
                <div className="grid h-32 w-full place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-500">
                  尚未上传图片
                </div>
              )}
              <div className="mt-4 flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{course.title}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">{course.category} · {course.level}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{course.teacher}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${courseStatusClasses[course.statusValue]}`}
                >
                  {course.status}
                </span>
              </div>
            </button>
          ))}
          {visibleCourses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              该老师暂时还没有课程。
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5">
        <div className="panel rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">课程编辑</h2>
              <p className="mt-1 text-sm text-slate-500">{courseMessage}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={deleteCourse}
                disabled={courseActionBusy || !canUseCourseActions}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral/40 bg-white px-4 py-2 text-sm font-bold text-coral disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} /> {deletingCourse ? "删除中" : "删除课程"}
              </button>
              <button
                onClick={publishCourse}
                disabled={courseActionBusy || !canUseCourseActions}
                className={`focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedCourseStatus === "published"
                    ? "border border-slate-200 bg-white text-slate-700"
                    : "bg-mint text-white"
                }`}
              >
                <ArrowUpRight size={16} /> {publishingCourse ? publicationActionBusyLabel : publicationActionLabel}
              </button>
              <button
                onClick={saveCourse}
                disabled={courseActionBusy || !canSaveSelectedCourse}
                className={`focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed ${
                  canSaveSelectedCourse && !courseActionBusy
                    ? "bg-ink text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                <Save size={16} /> {savingCourse ? "保存中" : "保存课程"}
              </button>
            </div>
          </div>
          {!shouldShowCourseEditor ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              该老师暂时还没有课程，请切换其他老师查看。
            </div>
          ) : null}
          {shouldShowCourseEditor && !canEditSelectedCourse ? (
            <div className="mt-5 rounded-lg border border-mint/30 bg-mint/10 p-4 text-sm font-semibold text-mint">
              当前正在查看其他老师的课程，可以浏览课程内容，但不能编辑、删除、发布或取消发布。
            </div>
          ) : null}
          {shouldShowCourseEditor && canEditSelectedCourse && isSelectedCoursePublished ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              课程已发布，当前内容处于只读状态。请先点击“取消发布”，再编辑并保存课程。
            </div>
          ) : null}
          {shouldShowCourseEditor ? (
            <>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_15rem_10rem_10rem_10rem_18rem]">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              课程标题
              <input
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                value={courseDraft.title}
                onChange={(event) => updateCourseDraft("title", event.target.value)}
                disabled={!canModifyCourseContent}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              课程类别
              <select
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                value={courseDraft.category}
                onChange={(event) => updateCourseDraft("category", event.target.value)}
                disabled={!canModifyCourseContent}
              >
                <option value="" disabled>
                  {courseCategoryOptions.length === 0 ? "请先创建课程类别" : "请选择课程类别"}
                </option>
                {shouldShowLegacyCourseCategory ? (
                  <option value={courseDraft.category}>{courseDraft.category}</option>
                ) : null}
                {courseCategoryOptions.map((categoryLabel) => (
                  <option key={categoryLabel} value={categoryLabel}>
                    {categoryLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              课程级别
              <select
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                value={courseDraft.level}
                onChange={(event) => updateCourseDraft("level", event.target.value)}
                disabled={!canModifyCourseContent}
              >
                <option value="" disabled>
                  {visibleCourseLevelOptions.length === 0 ? "暂无可选级别" : "请选择级别"}
                </option>
                {visibleCourseLevelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              订阅费（欧元/月）
              <input
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                step={0.01}
                value={courseDraft.priceEurMonthly}
                onChange={(event) => updateCourseDraft("priceEurMonthly", normalizeCoursePrice(event.target.value))}
                disabled={!canModifyCourseContent}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              课程时长（天）
              <input
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                max={3650}
                step={1}
                value={courseDraft.expectedDurationDays}
                onChange={(event) =>
                  updateCourseDraft("expectedDurationDays", normalizeCourseDuration(event.target.value, courseDraft.expectedDurationDays))
                }
                disabled={!canModifyCourseContent}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              授课老师
              <select
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                value={String(getTeacherById(courseDraft.teacherId, teacherOptions)?.id ?? "")}
                onChange={(event) => updateCourseTeacher(event.target.value)}
                disabled={teacherOptions.length === 0 || !canModifyCourseContent || isSuperAdmin}
              >
                <option value="" disabled>
                  {teacherOptions.length === 0
                    ? "请先在用户权限管理中创建老师账号"
                    : "请选择授课老师"}
                </option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name} · {teacher.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">课程封面图</span>
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[16rem_1fr]">
                {courseDraft.coverUrl ? (
                  <img
                    src={courseDraft.coverUrl}
                    alt={courseDraft.title || "课程封面图"}
                    className="h-40 w-full rounded-lg bg-white object-cover"
                  />
                ) : (
                  <div className="grid h-40 w-full place-items-center rounded-lg border border-dashed border-slate-200 bg-white text-sm font-bold text-slate-500">
                    尚未上传图片
                  </div>
                )}
                <div className="grid content-center gap-3">
                  <label className="focus-ring inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
                    {uploadingCover ? <UploadProgressRing progress={coverUploadProgress} /> : <ImagePlus size={16} />} {uploadingCover ? "上传中" : "选择封面图片"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploadingCover || !canModifyCourseContent}
                      onChange={(event) => {
                        void handleCoverUpload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <p className="text-sm text-slate-500">上传后会立即预览，并保留在当前课程编辑草稿中。</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">介绍视频</span>
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[16rem_1fr]">
                <div className="grid min-h-36 place-items-center overflow-hidden rounded-lg bg-ink text-sm font-bold text-white">
                  {courseDraft.introVideoUrl ? (
                    <video controls src={courseDraft.introVideoUrl} className="h-full max-h-48 w-full object-contain" />
                  ) : (
                    <span>尚未上传视频</span>
                  )}
                </div>
                <div className="grid content-center gap-3">
                  <label className="focus-ring inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
                    {uploadingIntroVideo ? <UploadProgressRing progress={introVideoUploadProgress} /> : <Video size={16} />} {uploadingIntroVideo ? "上传中" : "选择介绍视频"}
                    <input
                      type="file"
                      accept="video/*"
                      className="sr-only"
                      disabled={uploadingIntroVideo || !canModifyCourseContent}
                      onChange={(event) => {
                        void handleIntroVideoUpload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <p className="text-sm text-slate-500">介绍视频仅通过本地文件上传，上传后会保留在当前课程编辑草稿中。</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-slate-700">课程简介</span>
            <RichTextEditor
              value={courseDraft.description}
              onChange={(value) => updateCourseDraft("description", value)}
              disabled={!canModifyCourseContent}
              placeholder="编辑课程简介，可以加入文字排版、图片和视频素材。"
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink">章节与项目</h3>
              <p className="mt-1 text-sm text-slate-500">每章可添加多个项目，项目可配置为讲课视频、讲义、练习或测验。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            {courseDraft.chapters.map((chapter, chapterIndex) => (
              <CourseChapterEditor
                key={chapter.localId}
                chapter={chapter}
                chapterIndex={chapterIndex}
                availableQuestions={availableQuestions}
                questionOwnerOptions={questionOwnerOptions}
                currentUserId={currentAdminUserId}
                readOnly={!canModifyCourseContent}
                onUpdate={(patch) => updateChapter(chapter.localId, patch)}
                onRemove={() => { void removeChapter(chapter.localId); }}
                onAddItem={(itemType) => addLessonItem(chapter.localId, itemType)}
                onUpdateItem={(itemLocalId, patch) =>
                  updateLessonItem(chapter.localId, itemLocalId, patch)
                }
                onRemoveItem={(itemLocalId) => { void removeLessonItem(chapter.localId, itemLocalId); }}
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              onClick={addChapter}
              disabled={!canModifyCourseContent}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} /> 添加章节
            </button>
            <button
              onClick={saveCourse}
              disabled={courseActionBusy || !canSaveSelectedCourse}
              className={`focus-ring inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed ${
                canSaveSelectedCourse && !courseActionBusy
                  ? "bg-ink text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              <Save size={16} /> {savingCourse ? "保存中" : "保存课程"}
            </button>
          </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CourseChapterEditor({
  chapter,
  chapterIndex,
  availableQuestions,
  questionOwnerOptions,
  currentUserId,
  readOnly,
  onUpdate,
  onRemove,
  onAddItem,
  onUpdateItem,
  onRemoveItem
}: {
  chapter: CourseChapterDraft;
  chapterIndex: number;
  availableQuestions: CourseQuestion[];
  questionOwnerOptions: CourseQuestionOwnerOption[];
  currentUserId: number | null;
  readOnly: boolean;
  onUpdate: (patch: Partial<CourseChapterDraft>) => void;
  onRemove: () => void;
  onAddItem: (itemType: CourseLessonItemType) => void;
  onUpdateItem: (itemLocalId: string, patch: Partial<CourseLessonItemDraft>) => void;
  onRemoveItem: (itemLocalId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(chapterIndex > 0);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="focus-ring flex min-w-0 flex-1 basis-0 items-center gap-3 overflow-hidden rounded-lg px-2 py-2 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            size={18}
            className={`shrink-0 text-slate-500 transition ${collapsed ? "" : "rotate-90"}`}
          />
          <span className="shrink-0 rounded-full bg-mint/12 px-2.5 py-1 text-xs font-bold text-mint">
            第{chapterIndex + 1}章
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate font-bold text-ink">{chapter.title}</span>
            <span className="mt-1 block truncate text-sm text-slate-500">
              {chapter.items.length} 个项目
            </span>
          </span>
        </button>
        <button
          onClick={onRemove}
          disabled={readOnly}
          className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-coral"
          aria-label={`删除第${chapterIndex + 1}章`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {!collapsed ? (
        <>
          <div className="mt-4 grid gap-4">
            <label className="grid max-w-2xl min-w-0 gap-2 text-sm font-semibold text-slate-700">
              章节标题
              <input
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2"
                value={chapter.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
                disabled={readOnly}
              />
            </label>
            <div className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
              章节简介
              <RichTextEditor
                value={chapter.summary}
                onChange={(value) => onUpdate({ summary: value })}
                disabled={readOnly}
                placeholder="编辑本章介绍，可以加入文字排版、图片和视频素材。"
                minHeightClass="min-h-28"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {chapter.items.map((item, itemIndex) => (
              <CourseLessonItemEditor
                key={item.localId}
                item={item}
                itemIndex={itemIndex}
                availableQuestions={availableQuestions}
                questionOwnerOptions={questionOwnerOptions}
                currentUserId={currentUserId}
                readOnly={readOnly}
                onUpdate={(patch) => onUpdateItem(item.localId, patch)}
                onRemove={() => onRemoveItem(item.localId)}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {courseLessonItemTypes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => onAddItem(value)}
                disabled={readOnly}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon size={15} /> 添加{label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function CourseLessonItemEditor({
  item,
  itemIndex,
  availableQuestions,
  questionOwnerOptions,
  currentUserId,
  readOnly,
  onUpdate,
  onRemove
}: {
  item: CourseLessonItemDraft;
  itemIndex: number;
  availableQuestions: CourseQuestion[];
  questionOwnerOptions: CourseQuestionOwnerOption[];
  currentUserId: number | null;
  readOnly: boolean;
  onUpdate: (patch: Partial<CourseLessonItemDraft>) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(itemIndex > 0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<number | null>(null);
  const itemTypeMeta =
    courseLessonItemTypes.find((type) => type.value === item.itemType) ?? courseLessonItemTypes[0];
  const ItemIcon = itemTypeMeta.icon;

  function handleTypeChange(nextType: CourseLessonItemType) {
    const questionIds = getQuestionIdsFromItem(item);
    const isQuestionItem = nextType === "exercise" || nextType === "quiz";
    onUpdate({
      itemType: nextType,
      title: courseLessonItemDefaultTitle(nextType),
      contentUrl: nextType === item.itemType && !isQuestionItem ? item.contentUrl : "",
      body: isQuestionItem ? { question_ids: questionIds } : {}
    });
  }

  async function handleContentFileUpload(file: File | undefined, kind: AdminUploadKind) {
    if (!file) {
      return;
    }
    setUploadingFile(true);
    setFileUploadProgress(1);
    setUploadMessage("正在上传文件...");
    try {
      const url = await uploadAdminFile(file, kind, (progress) => setFileUploadProgress(progress.percent));
      onUpdate({ contentUrl: url });
      setUploadMessage("文件已上传。");
    } catch (error) {
      setUploadMessage(`文件上传失败：${uploadFailureMessage(error, "请确认 FastAPI 服务正在运行。")}`);
    } finally {
      setUploadingFile(false);
      setFileUploadProgress(null);
    }
  }

  const selectedQuestionIds = getQuestionIdsFromItem(item);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="focus-ring flex min-w-0 flex-1 basis-0 items-center gap-3 overflow-hidden rounded-lg px-2 py-2 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            size={17}
            className={`shrink-0 text-slate-500 transition ${collapsed ? "" : "rotate-90"}`}
          />
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-mint">
            <ItemIcon size={16} />
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate font-bold text-ink">{item.title}</span>
            <span className="mt-1 block text-sm text-slate-500">
              {itemTypeMeta.label} · {item.requiredMinutes} 分钟
              {selectedQuestionIds.length > 0 ? ` · ${selectedQuestionIds.length} 道题` : ""}
            </span>
          </span>
        </button>
        <button
          onClick={onRemove}
          disabled={readOnly}
          className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-coral disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="删除项目"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {!collapsed ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(12rem,1fr)_12rem_7rem] xl:grid-cols-[minmax(16rem,1fr)_13rem_7rem]">
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
              项目标题
              <input
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={item.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
                disabled={readOnly}
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
              项目类型
              <select
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={item.itemType}
                onChange={(event) => handleTypeChange(event.target.value as CourseLessonItemType)}
                disabled={readOnly}
              >
                {courseLessonItemTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
              建议分钟
              <input
                type="number"
                min={0}
                className="focus-ring w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center"
                value={item.requiredMinutes}
                onChange={(event) => onUpdate({ requiredMinutes: Number(event.target.value) })}
                disabled={readOnly}
              />
            </label>
          </div>

          {item.itemType === "video" ? (
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-ink">讲课视频</p>
                  <p className="mt-1 text-sm text-slate-500">视频仅支持本地文件上传。</p>
                </div>
                <label className="focus-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">
                  {uploadingFile ? <UploadProgressRing progress={fileUploadProgress} /> : <Video size={16} />} {uploadingFile ? "上传中" : "选择视频"}
                  <input
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    disabled={uploadingFile || readOnly}
                    onChange={(event) => {
                      void handleContentFileUpload(event.target.files?.[0], "lesson_video");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              {uploadMessage ? <p className="text-sm text-slate-500">{uploadMessage}</p> : null}
              {item.contentUrl ? (
                <video controls src={item.contentUrl} className="max-h-64 rounded-lg bg-ink" />
              ) : (
                <div className="grid h-32 place-items-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
                  尚未上传视频
                </div>
              )}
            </div>
          ) : null}

          {item.itemType === "handout" ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-ink">讲义文件</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.contentUrl ? "已选择 Markdown 讲义文件。" : "请选择 Markdown .md 文件。"}
                  </p>
                </div>
                <label className="focus-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">
                  {uploadingFile ? <UploadProgressRing progress={fileUploadProgress} /> : <FileText size={16} />} {uploadingFile ? "上传中" : "选择讲义"}
                  <input
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    className="sr-only"
                    disabled={uploadingFile || readOnly}
                    onChange={(event) => {
                      void handleContentFileUpload(event.target.files?.[0], "handout");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              {uploadMessage ? <p className="mt-3 text-sm text-slate-500">{uploadMessage}</p> : null}
            </div>
          ) : null}

          {item.itemType === "exercise" || item.itemType === "quiz" ? (
            <QuestionPicker
              questions={availableQuestions}
              lessonItemType={item.itemType}
              ownerOptions={questionOwnerOptions}
              currentUserId={currentUserId}
              readOnly={readOnly}
              selectedQuestionIds={selectedQuestionIds}
              onChange={(questionIds) => onUpdate({ body: { ...item.body, question_ids: questionIds } })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QuestionPicker({
  questions,
  lessonItemType,
  ownerOptions,
  currentUserId,
  readOnly,
  selectedQuestionIds,
  onChange
}: {
  questions: CourseQuestion[];
  lessonItemType: Extract<CourseLessonItemType, "exercise" | "quiz">;
  ownerOptions: CourseQuestionOwnerOption[];
  currentUserId: number | null;
  readOnly: boolean;
  selectedQuestionIds: number[];
  onChange: (questionIds: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | "all" | "self">("self");
  const [selectedType, setSelectedType] = useState("all");
  const [draggingQuestionId, setDraggingQuestionId] = useState<number | null>(null);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();

  const normalizedQuery = query.trim().toLowerCase();
  const pickableQuestions =
    lessonItemType === "exercise"
      ? questions.filter((question) => !question.requiresManualGrading)
      : questions;
  const typeOptions = Array.from(new Set(pickableQuestions.map((question) => question.type))).filter(Boolean);
  const currentUserIsQuestionOwner = Boolean(
    currentUserId && ownerOptions.some((owner) => owner.id === currentUserId)
  );
  const selectedOwnerExists =
    typeof selectedOwnerId === "number" && ownerOptions.some((owner) => owner.id === selectedOwnerId);
  const resolvedOwnerId =
    selectedOwnerId === "self"
      ? currentUserIsQuestionOwner
        ? currentUserId ?? "all"
        : "all"
      : selectedOwnerId === "all" || selectedOwnerExists
        ? selectedOwnerId
        : "all";
  const filteredQuestions = pickableQuestions.filter((question) => {
    if (resolvedOwnerId !== "all" && question.createdByUserId !== resolvedOwnerId) {
      return false;
    }
    if (selectedType !== "all" && question.type !== selectedType) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [question.title, question.prompt, question.skillArea, question.difficulty]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const selectedQuestions = selectedQuestionIds
    .map((questionId) => questions.find((question) => question.id === questionId))
    .filter((question): question is CourseQuestion => Boolean(question));

  function toggleQuestion(question: CourseQuestion) {
    if (readOnly) {
      return;
    }
    if (question.status !== "published") {
      return;
    }
    const exists = selectedQuestionIds.includes(question.id);
    onChange(
      exists
        ? selectedQuestionIds.filter((id) => id !== question.id)
        : [...selectedQuestionIds, question.id]
    );
  }

  async function removeQuestion(questionId: number) {
    if (readOnly) {
      return;
    }
    const question = selectedQuestions.find((entry) => entry.id === questionId);
    const confirmed = await confirmDelete({
      title: "\u79fb\u9664\u9898\u76ee",
      itemName: question?.title || question?.prompt || "\u9898\u76ee",
      description: "\u8be5\u9898\u76ee\u4f1a\u4ece\u5f53\u524d\u7ec3\u4e60\u6216\u6d4b\u9a8c\u4e2d\u79fb\u9664\uff0c\u4e0d\u4f1a\u5220\u9664\u9898\u5e93\u4e2d\u7684\u539f\u9898\u3002",
    });
    if (!confirmed) return;
    onChange(selectedQuestionIds.filter((id) => id !== questionId));
  }

  function moveQuestion(sourceId: number, targetId: number) {
    if (readOnly) {
      return;
    }
    if (sourceId === targetId) {
      return;
    }
    const sourceIndex = selectedQuestionIds.indexOf(sourceId);
    const targetIndex = selectedQuestionIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const nextIds = [...selectedQuestionIds];
    const [movingId] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(targetIndex, 0, movingId);
    onChange(nextIds);
  }

  const noMatchMessage = normalizedQuery
    ? `没有找到包含“${query.trim()}”的题目。`
    : "当前筛选条件下没有可选题目。";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      {deleteConfirmDialog}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-ink">已选择题目</p>
            <p className="mt-1 text-sm text-slate-500">
              {readOnly ? "当前为只读查看，题目顺序和内容不可修改。" : "可拖动题目卡片调整练习或测验中的显示顺序。"}
            </p>
          </div>
          <span className="rounded-full bg-mint/12 px-3 py-1 text-xs font-bold text-mint">
            {selectedQuestions.length} 道题
          </span>
        </div>
        {selectedQuestions.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {selectedQuestions.map((question) => (
              <SelectedCourseQuestionCard
                key={question.id}
                question={question}
                draggingQuestionId={draggingQuestionId}
                readOnly={readOnly}
                onDragStart={() => setDraggingQuestionId(question.id)}
                onDragEnd={() => setDraggingQuestionId(null)}
                onDropOn={() => {
                  if (draggingQuestionId) {
                    moveQuestion(draggingQuestionId, question.id);
                  }
                  setDraggingQuestionId(null);
                }}
                onRemove={() => removeQuestion(question.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {readOnly ? "当前项目还没有配置题目。" : "还没有选择题目，可以从下方题库中添加。"}
          </div>
        )}
      </div>

      {!readOnly ? (
        <>
          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 xl:grid-cols-[minmax(9rem,0.8fr)_minmax(11rem,1fr)_minmax(9rem,0.8fr)_minmax(16rem,1.4fr)]">
            <div>
              <p className="font-bold text-ink">题库题目</p>
            <p className="mt-1 text-sm text-slate-500">
                {lessonItemType === "exercise"
                  ? `练习只显示无需人工批改的题目，当前筛选 ${filteredQuestions.length} 道。`
                  : `测验可选择自动批改和人工批改题目，当前筛选 ${filteredQuestions.length} 道。`}
              </p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(QUESTION_BANK_CHANGE_EVENT))}
                className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-mint/60 hover:text-mint"
              >
                <RefreshCw size={13} /> 刷新题库
              </button>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              选择老师
              <select
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={String(resolvedOwnerId)}
                onChange={(event) =>
                  setSelectedOwnerId(event.target.value === "all" ? "all" : Number(event.target.value))
                }
              >
                <option value="all">全部老师</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                    {owner.id === currentUserId ? "（自己）" : ""}
                    {owner.role === "super_admin" ? " · 超级管理员" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              题型
              <select
                className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
              >
                <option value="all">全部题型</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {courseQuestionTypeLabels[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              关键词搜索
              <input
                className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、题干、知识点、难度"
              />
            </label>
          </div>

          <div className="mt-4 grid max-h-80 gap-2 overflow-auto pr-1">
            {filteredQuestions.map((question) => {
              const selected = selectedQuestionIds.includes(question.id);
              const selectable = question.status === "published";
              return (
                <button
                  key={question.id}
                  onClick={() => toggleQuestion(question)}
                  disabled={!selectable}
                  className={`focus-ring flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition ${
                    selected ? "border-mint bg-mint/10" : "border-slate-200 bg-slate-50"
                  } ${selectable ? "" : "cursor-not-allowed opacity-60"}`}
                >
                  <span
                    className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded border ${
                      selected ? "border-mint bg-mint text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{question.title}</span>
                    <span className="mt-1 block text-slate-500">
                      {courseQuestionTypeLabels[question.type] ?? question.type} · {question.difficulty || "未分级"} · {question.points} 分
                    </span>
                  </span>
                  {question.requiresManualGrading ? (
                    <span className="rounded-full bg-coral/10 px-2.5 py-1 text-xs font-bold text-coral">
                      人工批改
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${courseQuestionStatusClasses[question.status]}`}
                  >
                    {courseQuestionStatusLabels[question.status]}
                  </span>
                </button>
              );
            })}
            {filteredQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                {noMatchMessage}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SelectedCourseQuestionCard({
  question,
  draggingQuestionId,
  readOnly,
  onDragStart,
  onDragEnd,
  onDropOn,
  onRemove
}: {
  question: CourseQuestion;
  draggingQuestionId: number | null;
  readOnly: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDragging = draggingQuestionId === question.id;

  return (
    <article
      draggable={!readOnly}
      onDragStart={() => {
        if (!readOnly) {
          onDragStart();
        }
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!readOnly) {
          event.preventDefault();
        }
      }}
      onDrop={() => {
        if (!readOnly) {
          onDropOn();
        }
      }}
      className={`rounded-lg border bg-slate-50 p-3 transition ${
        isDragging ? "border-mint opacity-60" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white ${
            readOnly ? "cursor-default text-slate-300" : "cursor-grab text-slate-400"
          }`}
        >
          <GripVertical size={16} />
        </span>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
          aria-expanded={expanded}
        >
          <ChevronRight
            size={16}
            className={`shrink-0 text-slate-500 transition ${expanded ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate font-bold text-ink">{question.title}</span>
            <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{courseQuestionTypeLabels[question.type] ?? question.type}</span>
              <span>{question.difficulty || "未分级"}</span>
              <span>{question.points} 分</span>
              {question.requiresManualGrading ? <span className="text-coral">人工批改</span> : null}
            </span>
          </span>
        </button>
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-coral"
            aria-label="移除题目"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
          <p className="font-semibold text-ink">题干</p>
          <MathText className="mt-1 block whitespace-pre-wrap">{question.prompt || "暂无题干内容。"}</MathText>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-skysoft/20 px-2.5 py-1 text-blue-700">
              {question.skillArea || "未设置知识点"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${courseQuestionStatusClasses[question.status]}`}
            >
              {courseQuestionStatusLabels[question.status]}
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function QuestionBankPanel() {
  return <QuestionBankManager />;
}

function createBlankManagedUser(defaultRole: ManagedUserRole = "teacher"): ManagedUser {
  return {
    id: -Date.now(),
    email: "",
    fullName: "",
    role: defaultRole,
    title: "",
    phone: "",
    region: "",
    bio: "",
    isActive: true
  };
}

function UserPermissionManagement() {
  const profile = useAdminProfile();
  const roleOptions: ManagedUserRole[] =
    profile.roleValue === "super_admin"
      ? managedUserRoleOptions
      : ["institution_admin", "teacher"];
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [status, setStatus] = useState("正在加载用户列表...");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;

  useEffect(() => {
    let isMounted = true;
    fetchManagedUsers().then((remoteUsers) => {
      if (!isMounted) {
        return;
      }
      if (!remoteUsers) {
        setStatus("用户 API 暂时不可用，请确认 FastAPI 服务正在运行。");
        return;
      }
      setUsers(remoteUsers);
      setSelectedUserId(remoteUsers[0]?.id ?? null);
      setStatus(remoteUsers.length ? "已从服务器加载用户列表。" : "当前还没有后台用户，可以先新增一个。");
    });
    return () => {
      isMounted = false;
    };
  }, []);

  function updateSelectedUser(field: keyof ManagedUser, value: string | boolean) {
    if (!selectedUser) {
      return;
    }
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === selectedUser.id ? { ...user, [field]: value } : user))
    );
  }

  function addUser() {
    const newUser = createBlankManagedUser("teacher");
    setUsers((currentUsers) => [newUser, ...currentUsers]);
    setSelectedUserId(newUser.id);
    setStatus("正在创建新用户，保存后初始密码为 888888。");
  }

  async function saveUser() {
    if (!selectedUser) {
      return;
    }
    if (!selectedUser.fullName.trim() || !selectedUser.email.trim()) {
      setStatus("请填写用户姓名和邮箱。");
      return;
    }
    setSaving(true);
    setStatus("正在保存用户...");
    const isNew = selectedUser.id < 0;
    const result = await saveManagedUser(selectedUser);
    if (!result.user) {
      setStatus(result.error ?? "用户保存失败。");
      setSaving(false);
      return;
    }
    const savedUser = result.user;
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === selectedUser.id ? savedUser : user))
    );
    setSelectedUserId(savedUser.id);
    setStatus(isNew ? "用户已创建，初始密码为 888888。" : "用户信息已更新。");
    setSaving(false);
  }

  async function removeUser(user: ManagedUser) {
    const confirmed = await confirmDelete({
      title: "\u5220\u9664\u7528\u6237",
      itemName: `${user.fullName || "\u672a\u547d\u540d\u7528\u6237"} \u00b7 ${user.email || "\u672a\u586b\u5199\u90ae\u7bb1"}`,
      description: "\u5220\u9664\u540e\u8be5\u7528\u6237\u5c06\u4e0d\u80fd\u518d\u767b\u5f55\u673a\u6784\u540e\u53f0\u3002\u82e5\u7528\u6237\u5df2\u6709\u5173\u8054\u6570\u636e\uff0c\u540e\u7aef\u53ef\u80fd\u4f1a\u62d2\u7edd\u5220\u9664\u3002",
    });
    if (!confirmed) return;

    setDeleting(true);
    setStatus("正在删除用户...");
    const deleted = await deleteManagedUser(user.id);
    if (!deleted) {
      setStatus("用户删除失败，不能删除当前登录账号或该用户仍有关联数据。");
      setDeleting(false);
      return;
    }
    setUsers((currentUsers) => {
      const nextUsers = currentUsers.filter((currentUser) => currentUser.id !== user.id);
      setSelectedUserId(nextUsers[0]?.id ?? null);
      return nextUsers;
    });
    setStatus("用户已删除。");
    setDeleting(false);
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[24rem_1fr]">
      {deleteConfirmDialog}
      <aside className="panel h-fit rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">用户列表</h2>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
          <button
            onClick={addUser}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-3 py-2 text-sm font-bold text-white"
          >
            <Plus size={16} /> 新增用户
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => setSelectedUserId(user.id)}
              className={`focus-ring rounded-lg border p-4 text-left transition ${
                selectedUser?.id === user.id
                  ? "border-mint bg-mint/5"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{user.fullName || "未命名用户"}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">{user.email || "尚未填写邮箱"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {managedUserRoleLabels[user.role]}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {user.isActive ? "启用中" : "已停用"} · {managedUserRoleDescriptions[user.role]}
              </p>
            </button>
          ))}
          {users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              还没有可管理的用户。
            </div>
          ) : null}
        </div>
      </aside>

      <div className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">用户资料与角色</h2>
            <p className="mt-1 text-sm text-slate-500">
              新建用户保存后，初始密码统一为 888888。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedUser ? (
              <button
                onClick={() => void removeUser(selectedUser)}
                disabled={deleting}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral/30 px-4 py-2 text-sm font-bold text-coral disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} /> 删除用户
              </button>
            ) : null}
            <button
              onClick={() => void saveUser()}
              disabled={!selectedUser || saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} /> {saving ? "保存中" : "保存用户"}
            </button>
          </div>
        </div>

        {selectedUser ? (
          <div className="mt-5 grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                姓名
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={selectedUser.fullName}
                  onChange={(event) => updateSelectedUser("fullName", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                邮箱
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  type="email"
                  value={selectedUser.email}
                  onChange={(event) => updateSelectedUser("email", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                用户角色
                <select
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={selectedUser.role}
                  onChange={(event) => updateSelectedUser("role", event.target.value as ManagedUserRole)}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {managedUserRoleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                职务/头衔
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={selectedUser.title}
                  onChange={(event) => updateSelectedUser("title", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                电话
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={selectedUser.phone}
                  onChange={(event) => updateSelectedUser("phone", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                地区
                <input
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2"
                  value={selectedUser.region}
                  onChange={(event) => updateSelectedUser("region", event.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              个人简介
              <textarea
                className="focus-ring min-h-32 rounded-lg border border-slate-200 px-3 py-2 leading-7"
                value={selectedUser.bio}
                onChange={(event) => updateSelectedUser("bio", event.target.value)}
              />
            </label>
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-bold text-ink">当前角色权限</p>
                <p className="mt-1 text-sm text-slate-500">{managedUserRoleDescriptions[selectedUser.role]}</p>
              </div>
              <label className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedUser.isActive}
                  onChange={(event) => updateSelectedUser("isActive", event.target.checked)}
                  className="accent-coral"
                />
                启用该用户
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            请选择一个用户，或点击“新增用户”开始创建。
          </div>
        )}
      </div>
    </section>
  );
}

function hasUploadedTeacherAvatar(avatarUrl?: string) {
  const value = avatarUrl?.trim();
  return Boolean(
    value &&
      value !== DEFAULT_ADMIN_AVATAR &&
      value !== DEFAULT_TEACHER_AVATAR_URL &&
      !value.endsWith(DEFAULT_TEACHER_AVATAR_URL)
  );
}

function TeacherAvatarSlot({
  teacher,
  variant
}: {
  teacher: TeacherOption;
  variant: "card" | "detail";
}) {
  const uploadedAvatar = hasUploadedTeacherAvatar(teacher.avatarUrl);
  const className =
    variant === "detail"
      ? "h-40 w-full rounded-lg object-cover"
      : "h-14 w-14 shrink-0 rounded-lg object-cover";
  if (uploadedAvatar) {
    return <img src={teacher.avatarUrl} alt={teacher.name} className={className} />;
  }
  return (
    <div
      className={`grid place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-100 px-2 text-center font-bold text-slate-400 ${
        variant === "detail" ? "h-40 w-full text-sm" : "h-14 w-14 text-[10px] leading-tight"
      }`}
    >
      尚未上传头像
    </div>
  );
}

function TeacherManagement() {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [courses, setCourses] = useState<AdminCourseSummary[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [status, setStatus] = useState("正在加载老师列表...");
  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId) ?? teachers[0] ?? null,
    [selectedTeacherId, teachers]
  );
  const selectedTeacherCourses = useMemo(
    () => (selectedTeacher ? courses.filter((course) => course.teacherId === selectedTeacher.id) : []),
    [courses, selectedTeacher]
  );

  useEffect(() => {
    let isMounted = true;
    async function loadTeachers() {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/teachers`, {
          headers: getAdminRequestHeaders()
        });
        if (!response.ok) {
          throw new Error("Teacher API unavailable");
        }
        const nextTeachers = ((await response.json()) as ApiTeacher[]).map((teacher) =>
          normalizeTeacherFromApi(teacher)
        );
        let nextCourses: AdminCourseSummary[] = [];
        try {
          const coursesResponse = await fetch(`${API_BASE_URL}/admin/courses`, {
            headers: getAdminRequestHeaders()
          });
          if (coursesResponse.ok) {
            nextCourses = ((await coursesResponse.json()) as ApiCourseCard[]).map((course) =>
              normalizeCourseCardFromApi(course)
            );
          }
        } catch {
          nextCourses = [];
        }
        if (!isMounted) {
          return;
        }
        setTeachers(nextTeachers);
        setCourses(nextCourses);
        setSelectedTeacherId((currentId) =>
          currentId && nextTeachers.some((teacher) => teacher.id === currentId)
            ? currentId
            : nextTeachers[0]?.id ?? null
        );
        setStatus(nextTeachers.length ? "已从数据库加载老师列表。" : "当前机构还没有老师。");
      } catch {
        if (!isMounted) {
          return;
        }
        setTeachers([]);
        setCourses([]);
        setSelectedTeacherId(null);
        setStatus("老师 API 暂时不可用，请确认 FastAPI 服务正在运行。");
      }
    }
    loadTeachers();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="grid gap-5">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">老师列表</h2>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
        </div>
        {teachers.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {teachers.map((teacher) => {
              const selected = selectedTeacher?.id === teacher.id;
              return (
                <button
                  key={teacher.id}
                  type="button"
                  onClick={() => setSelectedTeacherId(teacher.id)}
                  className={`focus-ring h-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-white p-4 text-left transition ${
                    selected ? "border-mint shadow-soft" : "border-slate-200 hover:border-mint/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TeacherAvatarSlot teacher={teacher} variant="card" />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{teacher.name}</p>
                      <p className="truncate text-sm text-slate-500">{teacher.title || "授课老师"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(teacher.specialties?.length ? teacher.specialties : [teacher.region || "Europe"])
                      .slice(0, 3)
                      .map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-mint/12 px-2.5 py-1 text-xs font-bold text-mint"
                        >
                          {item}
                        </span>
                      ))}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            {status}
          </div>
        )}
      </section>

      <section className="panel rounded-lg p-5">
        <h2 className="text-xl font-bold text-ink">老师详细信息</h2>
        {selectedTeacher ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[18rem_1fr]">
            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <TeacherAvatarSlot teacher={selectedTeacher} variant="detail" />
              <p className="mt-4 text-lg font-bold text-ink">{selectedTeacher.name}</p>
              <p className="mt-1 text-sm text-slate-500">{selectedTeacher.title || "授课老师"}</p>
            </aside>
            <div className="grid content-start gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-bold text-ink">个人简介</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {selectedTeacher.bio || "暂未填写个人简介。"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold text-ink">教授课程</p>
                  <span className="rounded-full bg-mint/12 px-3 py-1 text-xs font-bold text-mint">
                    {selectedTeacherCourses.length} 门
                  </span>
                </div>
                {selectedTeacherCourses.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {selectedTeacherCourses.map((course) => (
                      <div
                        key={course.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">{course.title}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {[course.category, course.level].filter(Boolean).join(" · ") || "未设置分类"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${courseStatusClasses[course.statusValue]}`}
                          >
                            {course.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    当前老师还没有关联课程。
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            请选择一个老师查看详细资料。
          </div>
        )}
      </section>
    </div>
  );
}

const cancellationStatusLabels: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  withdrawn: "已撤回"
};

function CancellationManagementPanel({ isActive }: { isActive: boolean }) {
  const [requests, setRequests] = useState<SubscriptionCancellationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState("正在读取退订申请...");

  async function loadRequests(nextStatus = statusFilter) {
    setLoading(true);
    setStatus("正在读取退订申请...");
    try {
      const query = nextStatus === "all" ? "" : `?status=${encodeURIComponent(nextStatus)}`;
      const response = await fetch(`${API_BASE_URL}/admin/cancellations${query}`, {
        headers: getAdminRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(await readAdminApiErrorMessage(response, "退订申请读取失败"));
      }
      const payload = (await response.json()) as SubscriptionCancellationRequest[];
      setRequests(payload);
      setStatus(payload.length ? "" : "当前没有符合条件的退订申请。");
    } catch (error) {
      setRequests([]);
      setStatus(error instanceof Error ? error.message : apiConnectionErrorMessage("退订申请读取失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isActive) {
      void loadRequests();
    }
  }, [isActive, statusFilter]);

  async function reviewRequest(requestId: number, action: "approve" | "reject") {
    setBusyId(requestId);
    setStatus(action === "approve" ? "正在通过退订申请..." : "正在拒绝退订申请...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/cancellations/${requestId}/${action}`, {
        method: "POST",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_note: notes[requestId] ?? "" })
      });
      if (!response.ok) {
        throw new Error(await readAdminApiErrorMessage(response, "退订申请处理失败"));
      }
      const updated = (await response.json()) as SubscriptionCancellationRequest;
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus(action === "approve" ? "退订申请已通过。" : "退订申请已拒绝。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : apiConnectionErrorMessage("退订申请处理失败"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-ink">退订管理</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            学生提交退订理由后在这里审批。通过后系统会停止该课程后续订阅。
          </p>
          {status ? <p className="mt-2 text-sm font-semibold text-slate-500">{status}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="pending">待审批</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
            <option value="withdrawn">已撤回</option>
            <option value="all">全部</option>
          </select>
          <button
            type="button"
            onClick={() => void loadRequests()}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {requests.map((request) => {
          const expanded = expandedId === request.id;
          const isPending = request.status === "pending";
          return (
            <article key={request.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : request.id)}
                className="focus-ring flex w-full items-center justify-between gap-4 rounded-lg text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-ink">{request.course_title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {request.student_name} · {request.student_email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                    {cancellationStatusLabels[request.status] ?? request.status}
                  </span>
                  <ChevronRight size={18} className={`transition ${expanded ? "rotate-90" : ""}`} />
                </div>
              </button>

              {expanded ? (
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-500">学生退订理由</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">
                      {request.reason || "学生没有填写理由。"}
                    </p>
                  </div>
                  {request.admin_note ? (
                    <div className="rounded-lg bg-mint/10 p-4">
                      <p className="text-sm font-bold text-mint">审批备注</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{request.admin_note}</p>
                    </div>
                  ) : null}
                  {isPending ? (
                    <div className="grid gap-3">
                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        审批备注
                        <textarea
                          className="focus-ring min-h-24 rounded-lg border border-slate-200 px-3 py-2"
                          value={notes[request.id] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="可选：填写给学生看的处理说明"
                        />
                      </label>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void reviewRequest(request.id, "reject")}
                          disabled={busyId === request.id}
                          className="focus-ring rounded-lg border border-coral/30 px-4 py-2 text-sm font-bold text-coral disabled:opacity-60"
                        >
                          拒绝申请
                        </button>
                        <button
                          type="button"
                          onClick={() => void reviewRequest(request.id, "approve")}
                          disabled={busyId === request.id}
                          className="focus-ring rounded-lg bg-mint px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                        >
                          通过退订
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function GradingPanel({ isActive }: { isActive: boolean }) {
  const [submissions, setSubmissions] = useState<ManualGradingSubmission[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ManualGradingDraft>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("正在加载待批改测验...");
  const [loading, setLoading] = useState(false);

  const groupedSubmissions = useMemo<ManualGradingGroup[]>(() => {
    const groups = new Map<string, ManualGradingGroup>();
    submissions.forEach((submission) => {
      const key = [
        submission.student.id || submission.userId,
        submission.course.id ?? "course",
        submission.lessonItem.id ?? submission.lessonItemId ?? "item"
      ].join("-");
      const existing = groups.get(key);
      if (existing) {
        existing.submissions.push(submission);
        if (submission.createdAt > existing.submittedAt) {
          existing.submittedAt = submission.createdAt;
        }
        return;
      }
      groups.set(key, {
        key,
        student: submission.student,
        course: submission.course,
        lessonItem: submission.lessonItem,
        submittedAt: submission.createdAt,
        submissions: [submission]
      });
    });
    return Array.from(groups.values()).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  }, [submissions]);

  async function loadManualGradingQueue() {
    setLoading(true);
    setStatus("正在加载待批改测验...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/grading`, {
        headers: getAdminRequestHeaders(),
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(await readSimpleApiDetail(response, "待批改测验读取失败。"));
      }
      const payload = (await response.json()) as unknown[];
      const nextSubmissions = payload
        .map((submission) => normalizeManualGradingSubmission(submission))
        .filter((submission): submission is ManualGradingSubmission => Boolean(submission));
      setSubmissions(nextSubmissions);
      setDrafts((currentDrafts) => {
        const nextDrafts: Record<number, ManualGradingDraft> = {};
        nextSubmissions.forEach((submission) => {
          nextDrafts[submission.id] = currentDrafts[submission.id] ?? {
            score: submission.score === null ? "" : String(submission.score),
            feedback: submission.feedback ?? "",
            saving: false,
            message: ""
          };
        });
        return nextDrafts;
      });
      setExpandedGroups((currentGroups) => {
        const validKeys = new Set(nextSubmissions.map((submission) => [
          submission.student.id || submission.userId,
          submission.course.id ?? "course",
          submission.lessonItem.id ?? submission.lessonItemId ?? "item"
        ].join("-")));
        return new Set(Array.from(currentGroups).filter((key) => validKeys.has(key)));
      });
      setStatus(nextSubmissions.length ? `当前有 ${nextSubmissions.length} 道题需要人工批改。` : "当前没有需要人工批改的测验。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "待批改测验读取失败，请确认 FastAPI 服务正在运行。");
      setSubmissions([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const loadTimer = window.setTimeout(() => {
      void loadManualGradingQueue();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [isActive]);

  function toggleGroup(groupKey: string) {
    setExpandedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups);
      if (nextGroups.has(groupKey)) {
        nextGroups.delete(groupKey);
      } else {
        nextGroups.add(groupKey);
      }
      return nextGroups;
    });
  }

  function updateDraft(submissionId: number, patch: Partial<ManualGradingDraft>) {
    setDrafts((currentDrafts) => {
      const existingDraft = currentDrafts[submissionId] ?? {
        score: "",
        feedback: "",
        saving: false,
        message: ""
      };
      return {
        ...currentDrafts,
        [submissionId]: {
          ...existingDraft,
          ...patch
        }
      };
    });
  }

  async function gradeSubmission(submission: ManualGradingSubmission) {
    const draft = drafts[submission.id] ?? { score: "", feedback: "", saving: false, message: "" };
    const score = Number(draft.score);
    if (!Number.isFinite(score) || score < 0) {
      updateDraft(submission.id, { message: "请填写有效分数。" });
      return;
    }
    if (submission.question.points > 0 && score > submission.question.points) {
      updateDraft(submission.id, { message: `分数不能超过 ${submission.question.points} 分。` });
      return;
    }
    updateDraft(submission.id, { saving: true, message: "正在保存批改..." });
    try {
      const response = await fetch(`${API_BASE_URL}/admin/submissions/${submission.id}/grade`, {
        method: "PATCH",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          score,
          feedback: draft.feedback.trim()
        })
      });
      if (!response.ok) {
        throw new Error(await readSimpleApiDetail(response, "批改保存失败。"));
      }
      setSubmissions((currentSubmissions) =>
        currentSubmissions.filter((entry) => entry.id !== submission.id)
      );
      setDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[submission.id];
        return nextDrafts;
      });
      setStatus("批改已保存，待批改列表已更新。");
    } catch (error) {
      updateDraft(submission.id, {
        saving: false,
        message: error instanceof Error ? error.message : "批改保存失败，请确认 FastAPI 服务正在运行。"
      });
    }
  }

  return (
    <div className="grid gap-5">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">待手动批改</h2>
            <p className="mt-1 text-sm text-slate-500">
              按提交学生和对应测验分组，同一次测验中的人工批改题会放在同一个项目卡里。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadManualGradingQueue()}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          {status}
        </p>

        <div className="mt-5 grid gap-4">
          {groupedSubmissions.map((group) => {
            const expanded = expandedGroups.has(group.key);
            return (
              <article key={group.key} className="rounded-lg border border-slate-200 bg-white p-4">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="focus-ring flex w-full items-start gap-3 rounded-lg text-left"
                  aria-expanded={expanded}
                >
                  <ChevronRight
                    size={18}
                    className={`mt-1 shrink-0 text-slate-500 transition ${expanded ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{group.student.name}</span>
                      {group.student.email ? (
                        <span className="text-sm text-slate-500">{group.student.email}</span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {group.course.title} · {group.lessonItem.title} · {formatManualGradingTime(group.submittedAt)}
                    </span>
                  </span>
                  <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-bold text-coral">
                    {group.submissions.length} 道待批改
                  </span>
                </button>

                {expanded ? (
                  <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4">
                    {group.submissions.map((submission, index) => {
                      const draft = drafts[submission.id] ?? {
                        score: "",
                        feedback: "",
                        saving: false,
                        message: ""
                      };
                      return (
                        <div key={submission.id} className="rounded-lg bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-coral">
                                第 {index + 1} 题 · {courseQuestionTypeLabels[submission.question.type] ?? submission.question.type}
                              </p>
                              <h3 className="mt-1 font-bold text-ink">{submission.question.title}</h3>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {submission.question.difficulty || "未分级"} · {submission.question.points} 分
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                              人工批改
                            </span>
                          </div>

                          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
                            <div className="grid gap-3">
                              <div className="rounded-lg bg-white p-3">
                                <p className="text-sm font-bold text-ink">题干</p>
                                <MathText className="mt-2 block whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                  {submission.question.prompt || "暂无题干内容。"}
                                </MathText>
                              </div>
                              <div className="rounded-lg bg-white p-3">
                                <p className="text-sm font-bold text-ink">学生答案</p>
                                <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-sm leading-6 text-white">
                                  {formatManualGradingAnswer(submission.answer)}
                                </pre>
                              </div>
                            </div>

                            <div className="grid content-start gap-3">
                              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                                分数
                                <input
                                  type="number"
                                  min={0}
                                  max={submission.question.points || undefined}
                                  step={0.5}
                                  className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2"
                                  value={draft.score}
                                  onChange={(event) => updateDraft(submission.id, { score: event.target.value, message: "" })}
                                  placeholder={`满分 ${submission.question.points}`}
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                                批改反馈
                                <textarea
                                  className="focus-ring min-h-28 rounded-lg border border-slate-200 bg-white px-3 py-2 leading-6"
                                  value={draft.feedback}
                                  onChange={(event) => updateDraft(submission.id, { feedback: event.target.value, message: "" })}
                                  placeholder="写给学生的反馈"
                                />
                              </label>
                              {draft.message ? <p className="text-sm text-slate-500">{draft.message}</p> : null}
                              <button
                                type="button"
                                onClick={() => void gradeSubmission(submission)}
                                disabled={draft.saving}
                                className="focus-ring rounded-lg bg-mint px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {draft.saving ? "保存中..." : "提交批改"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!loading && groupedSubmissions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
              暂时没有需要人工批改的测验提交。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const examPaperKindLabels: Record<ExamPaperKind, string> = {
  mock_exam: "模拟考试",
  competition: "竞赛"
};

const examPaperStatusLabels: Record<ExamPaperStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

const examPaperSourceLabels: Record<ExamPaperSourceType, string> = {
  mock: "模拟卷",
  past_paper: "历年真题卷"
};

function ExamPaperManagement({ kind }: { kind: ExamPaperKind }) {
  const isCompetition = kind === "competition";
  const apiPath = isCompetition ? "competitions" : "exam-papers";
  const moduleTitle = isCompetition ? "竞赛" : "模拟考试";
  const [papers, setPapers] = useState<AdminExamPaper[]>([]);
  const [draft, setDraft] = useState<AdminExamPaper>(() => createBlankExamPaperDraft(kind));
  const [selectedPaperId, setSelectedPaperId] = useState<number>(draft.id);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<CourseQuestion[]>([]);
  const [difficultyOptions, setDifficultyOptions] = useState<string[]>([]);
  const [questionQuery, setQuestionQuery] = useState("");
  const [status, setStatus] = useState(`正在加载${moduleTitle}...`);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();

  const categoryOptions = useMemo(() => {
    const activeCategories = categories.filter((category) => category.isActive);
    const parentIds = new Set(activeCategories.map((category) => category.parentId).filter(Boolean));
    return activeCategories
      .filter((category) => !parentIds.has(category.id))
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "zh-Hans-CN"))
      .map((category) => ({
        id: category.id,
        label: buildCourseCategoryLabel(category, activeCategories)
      }));
  }, [categories]);

  const selectedQuestionIds = useMemo(
    () => new Set(draft.questions.map((link) => link.question.id)),
    [draft.questions]
  );

  const filteredQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase();
    return availableQuestions
      .filter((question) => !selectedQuestionIds.has(question.id))
      .filter((question) => {
        if (!query) {
          return true;
        }
        return [question.title, question.prompt, question.type, question.difficulty, question.skillArea]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 80);
  }, [availableQuestions, questionQuery, selectedQuestionIds]);

  async function loadData(nextSelectedId?: number) {
    setIsLoading(true);
    try {
      const [papersResponse, categoriesResponse, questionsResponse, difficultyResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/${apiPath}${isCompetition ? "" : `?kind=${kind}`}`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        }),
        fetch(`${API_BASE_URL}/admin/course-categories`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        }),
        fetch(`${API_BASE_URL}/admin/question-pool`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        }),
        fetch(`${API_BASE_URL}/admin/difficulty-levels`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        })
      ]);

      if (!papersResponse.ok) {
        throw new Error(`试卷读取失败：API 返回 ${papersResponse.status}`);
      }
      if (categoriesResponse.ok) {
        const nextCategories = ((await categoriesResponse.json()) as ApiCourseCategory[]).map((category) =>
          courseCategoryFromApi(category)
        );
        setCategories(nextCategories);
      }
      if (questionsResponse.ok) {
        const nextQuestions = ((await questionsResponse.json()) as unknown[])
          .map((question) => normalizeQuestionForCoursePicker(question))
          .filter((question): question is CourseQuestion => Boolean(question));
        setAvailableQuestions(nextQuestions);
      }
      if (difficultyResponse.ok) {
        const nextDifficulty = (await difficultyResponse.json()) as { levels?: string[] };
        setDifficultyOptions(nextDifficulty.levels ?? []);
      }

      const nextPapers = ((await papersResponse.json()) as ApiExamPaper[]).map((paper) => examPaperFromApi(paper));
      setPapers(nextPapers);
      const selected = nextPapers.find((paper) => paper.id === nextSelectedId) ?? nextPapers[0];
      if (selected) {
        setDraft(selected);
        setSelectedPaperId(selected.id);
        setStatus(`已加载 ${nextPapers.length} 份${moduleTitle}。`);
      } else {
        const blank = createBlankExamPaperDraft(kind);
        setDraft(blank);
        setSelectedPaperId(blank.id);
        setStatus(`当前还没有${moduleTitle}，可以从右侧创建。`);
      }
    } catch (error) {
      setStatus(uploadFailureMessage(error, `${moduleTitle}读取失败，请确认 FastAPI 服务正在运行。`));
      const blank = createBlankExamPaperDraft(kind);
      setDraft(blank);
      setSelectedPaperId(blank.id);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [kind]);

  function updateDraft(updates: Partial<AdminExamPaper>) {
    setDraft((current) => ({ ...current, ...updates }));
  }

  function createNewPaper() {
    const blank = createBlankExamPaperDraft(kind);
    setDraft(blank);
    setSelectedPaperId(blank.id);
    setStatus(`正在创建新的${moduleTitle}。`);
  }

  function addQuestion(question: CourseQuestion) {
    setDraft((current) => ({
      ...current,
      questions: [
        ...current.questions,
        {
          id: -Date.now() - question.id,
          position: current.questions.length + 1,
          points: question.points,
          question
        }
      ]
    }));
  }

  function removeQuestion(questionId: number) {
    setDraft((current) => ({
      ...current,
      questions: current.questions
        .filter((link) => link.question.id !== questionId)
        .map((link, index) => ({ ...link, position: index + 1 }))
    }));
  }

  function moveQuestion(questionId: number, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.questions.findIndex((link) => link.question.id === questionId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.questions.length) {
        return current;
      }
      const nextQuestions = [...current.questions];
      const [item] = nextQuestions.splice(index, 1);
      nextQuestions.splice(targetIndex, 0, item);
      return {
        ...current,
        questions: nextQuestions.map((link, nextIndex) => ({ ...link, position: nextIndex + 1 }))
      };
    });
  }

  function addPrize() {
    setDraft((current) => ({
      ...current,
      prizes: [
        ...current.prizes,
        {
          rank: current.prizes.length + 1,
          prizeType: "item",
          description: ""
        }
      ]
    }));
  }

  function updatePrize(index: number, updates: Partial<AdminCompetitionPrize>) {
    setDraft((current) => ({
      ...current,
      prizes: current.prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...updates } : prize
      )
    }));
  }

  function removePrize(index: number) {
    setDraft((current) => ({
      ...current,
      prizes: current.prizes
        .filter((_, prizeIndex) => prizeIndex !== index)
        .map((prize, prizeIndex) => ({ ...prize, rank: prizeIndex + 1 }))
    }));
  }

  async function savePaper() {
    setIsSaving(true);
    try {
      const isNew = draft.id < 0;
      const response = await fetch(`${API_BASE_URL}/admin/${apiPath}${isNew ? "" : `/${draft.id}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(examPaperToApiPayload(draft))
      });
      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}`);
      }
      const savedPaper = examPaperFromApi((await response.json()) as ApiExamPaper);
      setDraft(savedPaper);
      setSelectedPaperId(savedPaper.id);
      setStatus(`${moduleTitle}已保存。`);
      await loadData(savedPaper.id);
    } catch (error) {
      setStatus(uploadFailureMessage(error, `${moduleTitle}保存失败，请确认 FastAPI 服务正在运行。`));
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePaper() {
    if (draft.id < 0) {
      createNewPaper();
      return;
    }
    const confirmed = await confirmDelete({
      title: `删除${moduleTitle}`,
      description: `确定要删除「${draft.title}」吗？删除后学生将无法再看到这份${moduleTitle}。`,
      confirmLabel: "删除"
    });
    if (!confirmed) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/admin/${apiPath}/${draft.id}`, {
        method: "DELETE",
        headers: getAdminRequestHeaders()
      });
      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}`);
      }
      setStatus(`${moduleTitle}已删除。`);
      await loadData();
    } catch (error) {
      setStatus(uploadFailureMessage(error, `${moduleTitle}删除失败，请确认 FastAPI 服务正在运行。`));
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="panel p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-ink">{moduleTitle}列表</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {isLoading ? "正在读取..." : `${papers.length} 份${moduleTitle}`}
            </p>
          </div>
          <button
            type="button"
            onClick={createNewPaper}
            className="inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-3 text-sm font-black text-white transition hover:bg-coral/90"
          >
            <Plus size={16} />
            新增
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {papers.map((paper) => (
            <button
              type="button"
              key={paper.id}
              onClick={() => {
                setDraft(paper);
                setSelectedPaperId(paper.id);
                setStatus(`正在编辑「${paper.title}」。`);
              }}
              className={`w-full rounded-lg border p-4 text-left transition ${
                selectedPaperId === paper.id ? "border-mint bg-mint/5" : "border-slate-200 bg-white hover:border-mint/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-ink">{paper.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {paper.categoryName || "未选择类别"} · {paper.durationMinutes} 分钟 · {paper.questions.length} 题
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    paper.status === "published" ? "bg-mint/15 text-mint" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {examPaperStatusLabels[paper.status]}
                </span>
              </div>
            </button>
          ))}
          {!papers.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500">
              还没有{moduleTitle}，点击“新增”或直接在右侧填写后保存。
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-ink">{moduleTitle}编辑</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{status}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void deletePaper()}
              className="inline-flex items-center gap-2 rounded-lg border border-coral/30 px-4 py-3 text-sm font-black text-coral transition hover:bg-coral/5"
            >
              <Trash2 size={16} />
              删除
            </button>
            <button
              type="button"
              onClick={() => void savePaper()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Save size={16} />
              {isSaving ? "保存中" : "保存"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-sm font-black text-slate-700">标题</span>
            <input
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">所属类别</span>
            <select
              value={draft.categoryId ?? ""}
              onChange={(event) => updateDraft({ categoryId: event.target.value ? Number(event.target.value) : null })}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            >
              <option value="">不选择类别</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          {!isCompetition ? (
            <>
              <label className="block">
                <span className="text-sm font-black text-slate-700">试卷类型</span>
                <select
                  value={draft.sourceType}
                  onChange={(event) => updateDraft({ sourceType: event.target.value as ExamPaperSourceType })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
                >
                  <option value="mock">{examPaperSourceLabels.mock}</option>
                  <option value="past_paper">{examPaperSourceLabels.past_paper}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-black text-slate-700">真题年份</span>
                <input
                  value={draft.pastYear}
                  disabled={draft.sourceType !== "past_paper"}
                  onChange={(event) => updateDraft({ pastYear: event.target.value })}
                  placeholder="例如 2025"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                />
              </label>
            </>
          ) : null}
          {isCompetition ? (
            <label className="block">
              <span className="text-sm font-black text-slate-700">难度级别</span>
              <select
                value={draft.difficulty}
                onChange={(event) => updateDraft({ difficulty: event.target.value })}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
              >
                <option value="">请选择难度级别</option>
                {difficultyOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="text-sm font-black text-slate-700">答题时长（分钟）</span>
            <input
              type="number"
              min={1}
              value={draft.durationMinutes}
              onChange={(event) => updateDraft({ durationMinutes: Number(event.target.value) })}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">发布状态</span>
            <select
              value={draft.status}
              onChange={(event) => updateDraft({ status: event.target.value as ExamPaperStatus })}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
          </label>
          {isCompetition ? (
            <>
              <label className="block">
                <span className="text-sm font-black text-slate-700">开始时间</span>
                <input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => updateDraft({ startsAt: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-slate-700">结束时间</span>
                <input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => updateDraft({ endsAt: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-sm font-black text-slate-700">适合学生人群</span>
            <input
              value={draft.audience}
              onChange={(event) => updateDraft({ audience: event.target.value })}
              placeholder="例如 AP 备考学生、8-10 年级数学提升"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">封面图链接</span>
            <input
              value={draft.coverUrl}
              onChange={(event) => updateDraft({ coverUrl: event.target.value })}
              placeholder="可选"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 focus:border-mint focus:outline-none"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-black text-slate-700">详细介绍</span>
          <textarea
            value={draft.description}
            onChange={(event) => updateDraft({ description: event.target.value })}
            rows={4}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 focus:border-mint focus:outline-none"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-black text-slate-700">考试说明</span>
          <textarea
            value={draft.instructions}
            onChange={(event) => updateDraft({ instructions: event.target.value })}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 focus:border-mint focus:outline-none"
          />
        </label>

        {isCompetition ? (
          <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-ink">优胜者奖金/奖品</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  可以按名次设置奖金、奖品或荣誉，保存后会显示到前台竞赛详情。
                </p>
              </div>
              <button
                type="button"
                onClick={addPrize}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-black text-amber-700 shadow-sm ring-1 ring-amber-200 transition hover:bg-amber-50"
              >
                <Plus size={16} />
                添加奖项
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {draft.prizes.map((prize, index) => (
                <div
                  key={`${prize.rank}-${index}`}
                  className="grid gap-3 rounded-lg border border-amber-100 bg-white p-3 md:grid-cols-[110px_140px_minmax(0,1fr)_auto]"
                >
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">名次</span>
                    <input
                      type="number"
                      min={1}
                      value={prize.rank}
                      onChange={(event) => updatePrize(index, { rank: Number(event.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold focus:border-mint focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">类型</span>
                    <select
                      value={prize.prizeType}
                      onChange={(event) => updatePrize(index, { prizeType: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold focus:border-mint focus:outline-none"
                    >
                      <option value="cash">奖金</option>
                      <option value="item">奖品</option>
                      <option value="certificate">证书/荣誉</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">奖金/奖品说明</span>
                    <input
                      value={prize.description}
                      onChange={(event) => updatePrize(index, { description: event.target.value })}
                      placeholder="例如 第 1 名 100 欧元 / 荣誉证书"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold focus:border-mint focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removePrize(index)}
                    className="self-end rounded-lg border border-coral/30 px-3 py-2 text-sm font-black text-coral transition hover:bg-coral/5"
                    aria-label="删除奖项"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!draft.prizes.length ? (
                <div className="rounded-lg border border-dashed border-amber-200 bg-white/70 p-4 text-sm font-semibold text-slate-500">
                  暂未设置奖项。没有奖项时前台不会显示奖金/奖品说明。
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">已选题目</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {draft.questions.length} 道题 · 总分 {draft.questions.reduce((sum, link) => sum + link.points, 0)} 分
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {draft.questions.map((link, index) => (
              <div key={`${link.question.id}-${index}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">第 {index + 1} 题</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-ink">{link.question.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {link.question.type} · {link.question.difficulty} · {link.question.points} 分
                    {link.question.requiresManualGrading ? " · 需人工批改" : ""}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={link.points}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      questions: current.questions.map((item) =>
                        item.question.id === link.question.id ? { ...item, points: Number(event.target.value) } : item
                      )
                    }))
                  }
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
                  aria-label="题目分值"
                />
                <button
                  type="button"
                  onClick={() => moveQuestion(link.question.id, -1)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-500"
                >
                  上移
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(link.question.id, 1)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-500"
                >
                  下移
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(link.question.id)}
                  className="rounded-lg border border-coral/30 px-3 py-2 text-xs font-black text-coral"
                >
                  移除
                </button>
              </div>
            ))}
            {!draft.questions.length ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                请从下方题库选择题目组成试卷。
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">题库题目</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">只显示本机构已发布题目。</p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={questionQuery}
                onChange={(event) => setQuestionQuery(event.target.value)}
                placeholder="搜索题干、知识点、题型"
                className="w-full rounded-lg border border-slate-200 py-3 pl-9 pr-3 text-sm font-bold focus:border-mint focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {filteredQuestions.map((question) => (
              <button
                type="button"
                key={question.id}
                onClick={() => addQuestion(question)}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-mint hover:bg-mint/5"
              >
                <p className="line-clamp-1 text-sm font-black text-ink">{question.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {question.type} · {question.difficulty} · {question.points} 分
                  {question.requiresManualGrading ? " · 需人工批改" : ""}
                </p>
              </button>
            ))}
            {!filteredQuestions.length ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500 md:col-span-2">
                没有可添加的题目。请先在题库管理中发布题目。
              </div>
            ) : null}
          </div>
        </div>

        {isCompetition ? (
          <div className="mt-6 rounded-lg border border-slate-200 p-4">
            <h3 className="text-lg font-black text-ink">报名学生</h3>
            <div className="mt-3 space-y-2">
              {draft.registrations.map((registration) => (
                <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-black text-ink">{registration.studentName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{registration.studentEmail}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{formatAdminDateTime(registration.createdAt)}</span>
                </div>
              ))}
              {!draft.registrations.length ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                  暂无学生报名。
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <h3 className="text-lg font-black text-ink">提交记录</h3>
          <div className="mt-3 space-y-2">
            {draft.submissions.map((submission) => (
              <div key={submission.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-black text-ink">{submission.studentName}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {submission.studentEmail} · {formatAdminDateTime(submission.submittedAt)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                  {submission.score}/{submission.totalScore}
                </span>
              </div>
            ))}
            {!draft.submissions.length ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                暂无提交记录。
              </p>
            ) : null}
          </div>
        </div>

        {deleteConfirmDialog}
      </section>
    </div>
  );
}

function ActivityManagement() {
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState<AdminActivity>(() => createBlankActivityDraft());
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [status, setStatus] = useState("正在加载活动...");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirmDelete, deleteConfirmDialog } = useDeleteConfirmation();

  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId) ?? null;
  const currentTeacherOption =
    teacherOptions.find((teacher) => teacher.sourceUserId === currentAdminUserId) ?? null;
  const isNew = draft.id < 0;

  async function loadActivities() {
    try {
      const sessionUser = getAdminSessionUser();
      const sessionUserId = sessionUser?.id ?? getAdminSessionUserId();
      setCurrentAdminUserId(sessionUserId);
      const [activitiesResponse, teachersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/activities`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        }),
        fetch(`${API_BASE_URL}/admin/teachers`, {
          headers: getAdminRequestHeaders(),
          cache: "no-store"
        })
      ]);
      if (!activitiesResponse.ok) {
        throw new Error("Activity API unavailable");
      }
      const nextTeachers = teachersResponse.ok
        ? ((await teachersResponse.json()) as ApiTeacher[]).map((teacher) => normalizeTeacherFromApi(teacher))
        : [];
      const nextCurrentTeacher =
        nextTeachers.find((teacher) => teacher.sourceUserId === sessionUserId) ?? null;
      const nextActivities = ((await activitiesResponse.json()) as ApiAdminActivity[]).map(activityFromApi);
      setTeacherOptions(nextTeachers);
      setActivities(nextActivities);
      setSelectedActivityId((currentId) =>
        currentId && nextActivities.some((activity) => activity.id === currentId)
          ? currentId
          : nextActivities[0]?.id ?? null
      );
      if (!nextActivities.length) {
        setDraft(createBlankActivityDraft(nextTeachers, nextCurrentTeacher?.id ?? null));
      }
      setStatus(nextActivities.length ? "已从数据库加载活动。" : "还没有活动，可以先新增一个。");
    } catch {
      setActivities([]);
      setTeacherOptions([]);
      setDraft(createBlankActivityDraft());
      setSelectedActivityId(null);
      setStatus("活动 API 暂时不可用，请确认 FastAPI 服务正在运行。");
    }
  }

  useEffect(() => {
    void loadActivities();
  }, []);

  useEffect(() => {
    if (selectedActivity) {
      setDraft(selectedActivity);
    }
  }, [selectedActivity]);

  function addActivity() {
    const nextDraft = createBlankActivityDraft(teacherOptions, currentTeacherOption?.id ?? null);
    setSelectedActivityId(null);
    setDraft(nextDraft);
    setStatus("正在创建新的活动。");
  }

  function updateDraft<K extends keyof AdminActivity>(field: K, value: AdminActivity[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateActivityTeacher(value: string) {
    const teacher = value ? getTeacherById(Number(value), teacherOptions) : null;
    setDraft((current) => ({
      ...current,
      teacherId: teacher?.id ?? null,
      teacherName: teacher?.name ?? "",
      teacherTitle: teacher?.title ?? ""
    }));
  }

  async function readActivityError(response: Response) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    return typeof payload?.detail === "string" ? payload.detail : `服务器返回 ${response.status}`;
  }

  async function saveActivity() {
    if (!draft.title.trim()) {
      setStatus("请填写活动主题。");
      return;
    }
    if (!draft.description.trim()) {
      setStatus("请填写活动详细介绍。");
      return;
    }
    if (!draft.startsAt) {
      setStatus("请选择活动开始时间。");
      return;
    }
    setSaving(true);
    setStatus("正在保存活动...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/activities${isNew ? "" : `/${draft.id}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: getAdminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(activityToApiPayload(draft))
      });
      if (!response.ok) {
        throw new Error(await readActivityError(response));
      }
      const savedActivity = activityFromApi((await response.json()) as ApiAdminActivity);
      setActivities((currentActivities) => {
        if (isNew) {
          return [savedActivity, ...currentActivities];
        }
        return currentActivities.map((activity) => (activity.id === savedActivity.id ? savedActivity : activity));
      });
      setSelectedActivityId(savedActivity.id);
      setDraft(savedActivity);
      setStatus("活动已保存。");
    } catch (error) {
      setStatus(uploadFailureMessage(error, "活动保存失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteActivity() {
    if (isNew) {
      setDraft(createBlankActivityDraft(teacherOptions, currentTeacherOption?.id ?? null));
      setStatus("已取消新活动草稿。");
      return;
    }
    const confirmed = await confirmDelete({
      title: "删除活动",
      itemName: draft.title,
      description: "删除后，该活动和报名记录都会从后台移除。请确认是否继续。"
    });
    if (!confirmed) return;

    setDeleting(true);
    setStatus("正在删除活动...");
    try {
      const response = await fetch(`${API_BASE_URL}/admin/activities/${draft.id}`, {
        method: "DELETE",
        headers: getAdminRequestHeaders()
      });
      if (!response.ok) {
        throw new Error(`服务器返回 ${response.status}`);
      }
      const nextActivities = activities.filter((activity) => activity.id !== draft.id);
      setActivities(nextActivities);
      const nextActivity = nextActivities[0] ?? null;
      setSelectedActivityId(nextActivity?.id ?? null);
      setDraft(nextActivity ?? createBlankActivityDraft(teacherOptions, currentTeacherOption?.id ?? null));
      setStatus("活动已删除。");
    } catch (error) {
      setStatus(uploadFailureMessage(error, "活动删除失败，请确认 FastAPI 服务正在运行。"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_1fr]">
      {deleteConfirmDialog}
      <section className="panel rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">活动列表</h2>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
          <button
            type="button"
            onClick={addActivity}
            className="focus-ring inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-coral px-4 text-sm font-bold text-white shadow-sm hover:bg-[#f25f54]"
          >
            <Plus size={16} /> 新增活动
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {activities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => setSelectedActivityId(activity.id)}
              className={`focus-ring rounded-lg border p-4 text-left transition ${
                selectedActivityId === activity.id
                  ? "border-mint bg-mint/10"
                  : "border-slate-200 bg-white hover:border-mint/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{activity.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{formatAdminDateTime(activity.startsAt)}</p>
                  <p className="mt-2 text-xs font-bold text-slate-400">
                    {activity.mode === "online" ? "线上活动" : "线下活动"} · {activity.registrationsCount} 人报名
                  </p>
                  {activity.teacherName ? (
                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                      指派老师：{activity.teacherName}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    activity.registrationStatus === "open"
                      ? "bg-mint/12 text-mint"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {activity.registrationStatus === "open" ? "开放" : "关闭"}
                </span>
              </div>
            </button>
          ))}
          {!activities.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
              暂时还没有活动。
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">活动编辑</h2>
            <p className="mt-1 text-sm text-slate-500">发布线上或线下活动，并在这里查看报名学生。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={deleteActivity}
              disabled={deleting}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral/30 px-4 py-2 text-sm font-bold text-coral hover:bg-coral/10 disabled:opacity-60"
            >
              <Trash2 size={16} /> 删除活动
            </button>
            <button
              type="button"
              onClick={saveActivity}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              <Save size={16} /> 保存活动
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            活动主题
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="例如：欧洲中文写作公开课"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            适合学生人群
            <input
              value={draft.audience}
              onChange={(event) => updateDraft("audience", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="例如：7-12 岁中文学习者"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            指派老师
            <select
              value={draft.teacherId ? String(draft.teacherId) : ""}
              onChange={(event) => updateActivityTeacher(event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="">暂不指派</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.title ? ` · ${teacher.title}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            开始时间
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => updateDraft("startsAt", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            结束时间
            <input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => updateDraft("endsAt", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            活动类型
            <select
              value={draft.mode}
              onChange={(event) => updateDraft("mode", event.target.value as ActivityMode)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="online">线上活动</option>
              <option value="offline">线下活动</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            活动状态
            <select
              value={draft.registrationStatus}
              onChange={(event) => updateDraft("registrationStatus", event.target.value as ActivityRegistrationStatus)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="open">开放注册</option>
              <option value="closed">关闭注册</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            {draft.mode === "online" ? "在线会议链接" : "线下活动地点"}
            <input
              value={draft.mode === "online" ? draft.meetingUrl : draft.location}
              onChange={(event) =>
                draft.mode === "online"
                  ? updateDraft("meetingUrl", event.target.value)
                  : updateDraft("location", event.target.value)
              }
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder={draft.mode === "online" ? "https://..." : "城市、地址或教室"}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            人数上限
            <input
              type="number"
              min={1}
              value={draft.capacity}
              onChange={(event) => updateDraft("capacity", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 px-3 py-3 text-sm"
              placeholder="不填写表示不限人数"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700 lg:col-span-2">
            活动详细介绍
            <textarea
              value={draft.description}
              onChange={(event) => updateDraft("description", event.target.value)}
              className="focus-ring min-h-36 rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6"
              placeholder="介绍活动主题、适合学生、流程安排和准备事项。"
            />
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-ink">报名学生</h3>
              <p className="mt-1 text-sm text-slate-500">{draft.registrationsCount} 人已报名</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {draft.registrations.map((registration) => (
              <div
                key={registration.id}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]"
              >
                <div>
                  <p className="font-bold text-ink">{registration.studentName}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{registration.studentEmail}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-500">{registration.phone || "未填写电话"}</p>
                  {registration.note ? <p className="mt-1 text-sm text-slate-500">{registration.note}</p> : null}
                </div>
                <p className="text-sm font-semibold text-slate-400">{formatAdminDateTime(registration.createdAt)}</p>
              </div>
            ))}
            {!draft.registrations.length ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-500">
                暂时还没有学生报名。
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function BlogManagement() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">博客文章</h2>
          <button className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white">
            <Plus size={16} /> 新增文章
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          {adminBlogPosts.map((post) => (
            <div key={post.id} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[9rem_1fr_auto]">
              <img src={post.cover_url} alt={post.title} className="h-28 w-full rounded-lg object-cover" />
              <div>
                <p className="font-bold text-ink">{post.title}</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{post.excerpt}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">{post.channel} · {post.views} 浏览</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded-full bg-mint/12 px-2.5 py-1 text-xs font-bold text-mint">{post.status}</span>
                <button className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-slate-200">
                  <Edit3 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="panel h-fit rounded-lg p-5">
        <h3 className="font-bold text-ink">文章编辑</h3>
        <div className="mt-4 grid gap-3">
          <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="文章标题" defaultValue="海外中文学习方法" />
          <input className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="封面图 URL" />
          <textarea className="focus-ring min-h-40 rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6" placeholder="文章正文" />
          <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">
            <ImagePlus size={16} /> 保存文章
          </button>
        </div>
      </aside>
    </div>
  );
}

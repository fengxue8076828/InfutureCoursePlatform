export type Institution = {
  id: number;
  name: string;
  slug: string;
  logo_url: string;
  category: string;
  region: string;
  description: string;
};

export type CourseCategory = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  position: number;
  is_active: boolean;
};

export type Teacher = {
  id: number;
  name: string;
  slug: string;
  title: string;
  bio: string;
  avatar_url: string;
  region: string;
  specialties: { items: string[] };
  institution?: Institution;
};

export type LessonItem = {
  id: number;
  title: string;
  item_type: "video" | "handout" | "exercise" | "quiz";
  content_url?: string | null;
  body: Record<string, unknown>;
  required_minutes: number;
  position: number;
};

export type Chapter = {
  id: number;
  title: string;
  summary: string;
  position: number;
  items: LessonItem[];
};

export type Course = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description?: string;
  category: string;
  level: string;
  price_eur_monthly: number;
  hero_image_url: string;
  intro_video_url?: string;
  syllabus?: { items: string[] };
  tags?: { items: string[] };
  is_hot: boolean;
  students_count: number;
  institution: Institution;
  teacher: Teacher;
  chapters?: Chapter[];
};

export type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string;
  content: string;
  author_name: string;
  created_at: string;
};

export type LessonProgress = {
  lesson_item_id: number;
  completed_at?: string | null;
  score?: number | null;
};

export type Enrollment = {
  id: number;
  status: "active" | "completed";
  progress_percent: number;
  progress_records?: LessonProgress[];
  course: Course;
};

export type StudentLeaderboardEntry = {
  rank: number;
  student_id: number;
  student_name: string;
  avatar_url?: string | null;
  total_points: number;
  weekly_points: number;
  completed_courses: number;
  active_courses: number;
  average_progress: number;
};

export type StudentLeaderboard = {
  total_points: StudentLeaderboardEntry[];
  rising: StudentLeaderboardEntry[];
};

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "fill_blank"
  | "coding"
  | "code_review"
  | "true_false"
  | "reading"
  | "listening"
  | "pronunciation"
  | "writing"
  | "media_upload";

export type QuestionOption = {
  id: number;
  label: string;
  text: string;
  is_correct?: boolean;
  explanation?: string | null;
  position: number;
};

export type QuestionMedia = {
  id: number;
  media_type: "image" | "audio" | "video" | "handout";
  title: string;
  url: string;
  position: number;
};

export type Question = {
  id: number;
  type: QuestionType;
  prompt: string;
  hint?: string | null;
  content: Record<string, unknown>;
  skill_area: string;
  difficulty: string;
  points: number;
  requires_manual_grading: boolean;
  options: QuestionOption[];
  media_assets: QuestionMedia[];
};


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

export type StudentPointEvent = {
  label: string;
  source: string;
  points: number;
  occurred_at?: string | null;
  course_title?: string | null;
  detail?: string | null;
};

export type StudentCoursePointBreakdown = {
  course_id: number;
  course_slug: string;
  course_title: string;
  status: string;
  progress_percent: number;
  progress_points: number;
  activity_points: number;
  assessment_points: number;
  completion_bonus: number;
  total_points: number;
};

export type StudentLeaderboardDetail = {
  student: StudentLeaderboardEntry;
  total_rank?: number | null;
  rising_rank?: number | null;
  course_breakdown: StudentCoursePointBreakdown[];
  recent_events: StudentPointEvent[];
};
export type StudentProfileSummary = {
  id: number;
  email?: string | null;
  full_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  region?: string | null;
  community_points?: number;
};

export type StudentLearningNote = {
  id: number;
  enrollment_id: number;
  course_id: number;
  course_slug: string;
  course_title: string;
  course_image_url?: string | null;
  chapter_id: number;
  chapter_title: string;
  chapter_position: number;
  content: string;
  updated_at?: string | null;
};

export type StudentPost = {
  id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  content: string;
  course_id?: number | null;
  course_title?: string | null;
  created_at: string;
};

export type StudentSocialHome = {
  profile: StudentProfileSummary;
  active_courses: Enrollment[];
  completed_courses: Enrollment[];
  recommended_courses: Course[];
  total_points: number;
  weekly_points: number;
  achievements: string[];
  posts: StudentPost[];
  suggested_students: StudentProfileSummary[];
  following_ids: number[];
};

export type StudentPublicProfile = {
  profile: StudentProfileSummary;
  active_courses: Enrollment[];
  completed_courses: Enrollment[];
  posts: StudentPost[];
  is_following: boolean;
};
export type CommunityReferenceChapter = {
  id: number;
  title: string;
  position: number;
};

export type CommunityReferenceCourse = {
  id: number;
  title: string;
  slug: string;
  chapters: CommunityReferenceChapter[];
};

export type CommunityReferenceQuestion = {
  id: number;
  prompt: string;
  type: QuestionType;
  difficulty: string;
  skill_area: string;
};

export type CommunityAnswer = {
  id: number;
  question_id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  body: string;
  likes_count: number;
  liked_by_me: boolean;
  is_best: boolean;
  created_at: string;
};

export type CommunityQuestion = {
  id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  title: string;
  body: string;
  course_id?: number | null;
  course_title?: string | null;
  chapter_id?: number | null;
  chapter_title?: string | null;
  linked_question_id?: number | null;
  linked_question_title?: string | null;
  tags: string[];
  is_resolved: boolean;
  answers_count: number;
  answers: CommunityAnswer[];
  created_at: string;
};

export type CommunityNoteShare = {
  id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  title: string;
  content: string;
  course_id?: number | null;
  course_title?: string | null;
  likes_count: number;
  liked_by_me: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type CommunityMessage = {
  id: number;
  sender_id: number;
  sender_name: string;
  receiver_id: number;
  receiver_name: string;
  content: string;
  created_at: string;
};

export type CommunityHome = {
  questions: CommunityQuestion[];
  recommended_questions?: CommunityQuestion[];
  notes: CommunityNoteShare[];
  students: StudentProfileSummary[];
  hot_students?: StudentProfileSummary[];
  following_ids: number[];
  my_courses: CommunityReferenceCourse[];
  reference_questions: CommunityReferenceQuestion[];
  recent_messages: CommunityMessage[];
  community_points: number;
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
  institution_id?: number;
  institution?: Institution | null;
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



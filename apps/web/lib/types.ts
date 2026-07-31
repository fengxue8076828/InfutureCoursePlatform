export type Institution = {
  id: number;
  name: string;
  slug: string;
  logo_url: string;
  category: string;
  region: string;
  description: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
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
  item_type: "video" | "handout" | "exercise" | "quiz" | "review";
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
  rating_average?: number;
  rating_count?: number;
  institution: Institution;
  teacher: Teacher;
  chapters?: Chapter[];
};

export type CourseReview = {
  id?: number | null;
  course_id: number;
  enrollment_id?: number | null;
  rating?: number | null;
  comment: string;
  created_at?: string | null;
  updated_at?: string | null;
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

export type StudentPointLevel = {
  index: number;
  name: string;
  icon: string;
  min_points: number;
  next_level_points?: number | null;
  progress_percent: number;
};

export type StudentLeaderboardEntry = {
  rank: number;
  student_id: number;
  student_name: string;
  avatar_url?: string | null;
  total_points: number;
  weekly_points: number;
  course_points?: number;
  community_points?: number;
  competition_points?: number;
  follower_points?: number;
  followers_count?: number;
  completed_courses: number;
  active_courses: number;
  average_progress: number;
  level: StudentPointLevel;
};

export type StudentLeaderboard = {
  total_points: StudentLeaderboardEntry[];
  rising: StudentLeaderboardEntry[];
  course_points?: StudentLeaderboardEntry[];
  community_points?: StudentLeaderboardEntry[];
  competition_points?: StudentLeaderboardEntry[];
  followers?: StudentLeaderboardEntry[];
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
  note_points?: number;
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

export type StudentPostComment = {
  id: number;
  post_id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  body: string;
  created_at: string;
};

export type StudentPost = {
  id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  content: string;
  image_urls?: string[];
  course_id?: number | null;
  course_title?: string | null;
  likes_count?: number;
  liked_by_me?: boolean;
  comments_count?: number;
  comments?: StudentPostComment[];
  created_at: string;
};

export type StudentSocialHome = {
  profile: StudentProfileSummary;
  active_courses: Enrollment[];
  completed_courses: Enrollment[];
  recommended_courses: Course[];
  total_points: number;
  weekly_points: number;
  level: StudentPointLevel;
  achievements: string[];
  posts: StudentPost[];
  suggested_students: StudentProfileSummary[];
  following_ids: number[];
  following_students?: StudentProfileSummary[];
  follower_students?: StudentProfileSummary[];
  following_count?: number;
  followers_count?: number;
  questions?: CommunityQuestion[];
  answered_questions?: CommunityQuestion[];
  notes?: CommunityNoteShare[];
};

export type StudentPublicProfile = {
  profile: StudentProfileSummary;
  active_courses: Enrollment[];
  completed_courses: Enrollment[];
  posts: StudentPost[];
  questions?: CommunityQuestion[];
  answered_questions?: CommunityQuestion[];
  notes?: CommunityNoteShare[];
  following_students?: StudentProfileSummary[];
  follower_students?: StudentProfileSummary[];
  following_count?: number;
  followers_count?: number;
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
  student_level?: StudentPointLevel | null;
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
  likes_count?: number;
  liked_by_me?: boolean;
  answers_count: number;
  answers: CommunityAnswer[];
  created_at: string;
};

export type CommunityNoteShare = {
  id: number;
  user_id: number;
  student_name: string;
  avatar_url?: string | null;
  chapter_note_id?: number | null;
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

export type ExamPaperKind = "mock_exam" | "competition";
export type ExamPaperSourceType = "mock" | "past_paper";
export type ExamPaperStatus = "draft" | "published" | "archived";
export type ExamSubmissionStatus = "submitted" | "pending_manual" | "graded";

export type ExamPaperQuestion = {
  id: number;
  position: number;
  points: number;
  question: Question;
};

export type ExamPaperSubmission = {
  id: number;
  paper_id: number;
  student_name: string;
  student_email: string;
  answers: Record<string, unknown>;
  score: number;
  total_score: number;
  status: ExamSubmissionStatus;
  started_at?: string | null;
  submitted_at: string;
};

export type CompetitionRegistration = {
  id: number;
  paper_id?: number | null;
  competition_id?: number | null;
  student_name: string;
  student_email: string;
  phone?: string | null;
  note?: string | null;
  user_id?: number | null;
  created_at: string;
};

export type CompetitionPrize = {
  rank: number;
  prize_type: string;
  description: string;
};

export type ExamPaper = {
  id: number;
  institution_id: number;
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
  prizes?: CompetitionPrize[];
  duration_minutes: number;
  status: ExamPaperStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  institution: Institution;
  category?: CourseCategory | null;
  questions_count: number;
  registrations_count: number;
  submissions_count?: number;
  questions: ExamPaperQuestion[];
  registrations?: CompetitionRegistration[];
  submissions?: ExamPaperSubmission[];
  created_at?: string;
  updated_at?: string;
};



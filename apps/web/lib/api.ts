import { API_BASE_URL } from "./api-config";
import type {
  BlogPost,
  Course,
  CourseCategory,
  Enrollment,
  Institution,
  Question,
  StudentLeaderboard,
  StudentLeaderboardDetail,
  StudentPublicProfile,
  Teacher
} from "./types";


async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function fetchPublicJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function getInstitutions(): Promise<Institution[]> {
  return fetchJson("/institutions", []);
}

export function getCourses(): Promise<Course[]> {
  return fetchJson("/courses", []);
}

export function getCourseCategories(): Promise<CourseCategory[]> {
  return fetchJson("/course-categories", []);
}

export async function getCourse(slug: string): Promise<Course | undefined> {
  return fetchJson(`/courses/${slug}`, undefined);
}

export function getTeachers(): Promise<Teacher[]> {
  return fetchJson("/teachers", []);
}

export function getStudentLeaderboard(): Promise<StudentLeaderboard> {
  return fetchJson("/leaderboard", {
    total_points: [],
    rising: [],
    course_points: [],
    community_points: [],
    competition_points: [],
    followers: []
  });
}

export function getStudentLeaderboardDetail(studentId: number): Promise<StudentLeaderboardDetail | undefined> {
  return fetchJson(`/leaderboard/${studentId}`, undefined);
}

export function getStudentPublicProfile(studentId: number): Promise<StudentPublicProfile | undefined> {
  return fetchPublicJson(`/learn/students/${studentId}/profile`, undefined);
}

export function getPublishedQuestions(): Promise<Question[]> {
  return fetchJson("/learn/public-questions", []);
}

export async function getTeacher(identifier: string): Promise<Teacher | undefined> {
  const normalizedIdentifier = String(identifier ?? "").trim();
  if (!normalizedIdentifier) {
    return undefined;
  }

  const teacher = await fetchJson<Teacher | undefined>(
    `/teachers/${encodeURIComponent(normalizedIdentifier)}`,
    undefined
  );
  if (teacher) {
    return teacher;
  }

  const decodedIdentifier = decodeURIComponent(normalizedIdentifier);
  const teachers = await getTeachers();
  return teachers.find(
    (item) => item.slug === decodedIdentifier || String(item.id) === decodedIdentifier
  );
}

export function getBlogPosts(): Promise<BlogPost[]> {
  return fetchJson("/blog", []);
}

export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  return fetchJson(`/blog/${slug}`, undefined);
}

export function getEnrollments(): Promise<Enrollment[]> {
  return fetchJson("/learn/me/courses", []);
}


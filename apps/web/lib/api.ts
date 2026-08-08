import { API_BASE_URL } from "./api-config";
import type {
  BlogPost,
  Course,
  CourseCategory,
  Enrollment,
  Institution,
  Question,
  ResourceTag,
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

export type ResourceSearchFilters = {
  institutionCategory?: string;
  tagIds?: number[];
};

export function buildResourceQuery(filters?: ResourceSearchFilters) {
  const params = new URLSearchParams();
  if (filters?.institutionCategory) {
    params.set("institution_category", filters.institutionCategory);
  }
  const tagIds = filters?.tagIds?.filter((id) => Number.isFinite(id));
  if (tagIds?.length) {
    params.set("tag_ids", tagIds.join(","));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getInstitutions(): Promise<Institution[]> {
  return fetchJson("/institutions", []);
}

export function getTags(institutionCategory?: string): Promise<ResourceTag[]> {
  const query = institutionCategory ? `?institution_category=${encodeURIComponent(institutionCategory)}` : "";
  return fetchJson(`/tags${query}`, []);
}

export function getCourses(filters?: ResourceSearchFilters): Promise<Course[]> {
  return fetchJson(`/courses${buildResourceQuery(filters)}`, []);
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

export function getPublishedQuestions(filters?: ResourceSearchFilters): Promise<Question[]> {
  return fetchJson(`/learn/public-questions${buildResourceQuery(filters)}`, []);
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

export function getBlogPosts(filters?: ResourceSearchFilters): Promise<BlogPost[]> {
  return fetchJson(`/blog${buildResourceQuery(filters)}`, []);
}

export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  return fetchJson(`/blog/${slug}`, undefined);
}

export function getEnrollments(): Promise<Enrollment[]> {
  return fetchJson("/learn/me/courses", []);
}


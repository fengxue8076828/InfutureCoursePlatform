import { blogPosts, courses, teachers } from "./mock-data";
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: { "x-demo-user-id": "1" }
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
  const fallback = courses.find((course) => course.slug === slug);
  return fetchJson(`/courses/${slug}`, fallback);
}

export function getTeachers(): Promise<Teacher[]> {
  return fetchJson("/teachers", teachers);
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
  return fetchJson("/learn/questions", []);
}

export async function getTeacher(slug: string): Promise<Teacher | undefined> {
  const fallback = teachers.find((teacher) => teacher.slug === slug);
  return fetchJson(`/teachers/${slug}`, fallback);
}

export function getBlogPosts(): Promise<BlogPost[]> {
  return fetchJson("/blog", blogPosts);
}

export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  const fallback = blogPosts.find((post) => post.slug === slug);
  return fetchJson(`/blog/${slug}`, fallback);
}

export function getEnrollments(): Promise<Enrollment[]> {
  return fetchJson("/learn/me/courses", []);
}


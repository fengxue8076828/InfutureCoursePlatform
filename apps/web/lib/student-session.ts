export const STUDENT_AUTH_TOKEN_STORAGE_KEY = "infuture-student-auth-token";
export const STUDENT_AUTH_USER_STORAGE_KEY = "infuture-student-auth-user";
export const STUDENT_SESSION_EVENT = "infuture-student-session-change";

export type StudentSessionUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  institution_id?: number | null;
};

export type StudentAuthResponse = {
  access_token: string;
  token_type: string;
  user: StudentSessionUser;
};

let cachedStudentSessionRaw: string | null = null;
let cachedStudentSessionUser: StudentSessionUser | null = null;

function emitStudentSessionChange() {
  window.dispatchEvent(new Event(STUDENT_SESSION_EVENT));
}

export function getStudentSessionUser(): StudentSessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STUDENT_AUTH_USER_STORAGE_KEY);
  if (!raw) {
    cachedStudentSessionRaw = null;
    cachedStudentSessionUser = null;
    return null;
  }
  if (raw === cachedStudentSessionRaw) {
    return cachedStudentSessionUser;
  }
  try {
    cachedStudentSessionRaw = raw;
    cachedStudentSessionUser = JSON.parse(raw) as StudentSessionUser;
    return cachedStudentSessionUser;
  } catch {
    cachedStudentSessionRaw = raw;
    cachedStudentSessionUser = null;
    return null;
  }
}

export function persistStudentSession(auth: StudentAuthResponse) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STUDENT_AUTH_TOKEN_STORAGE_KEY, auth.access_token);
  window.localStorage.setItem(STUDENT_AUTH_USER_STORAGE_KEY, JSON.stringify(auth.user));
  emitStudentSessionChange();
}

export function clearStudentSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STUDENT_AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(STUDENT_AUTH_USER_STORAGE_KEY);
  emitStudentSessionChange();
}

export function subscribeToStudentSession(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(STUDENT_SESSION_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(STUDENT_SESSION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function getStudentSessionServerSnapshot(): StudentSessionUser | null {
  return null;
}

export function getStudentRequestHeaders(): HeadersInit {
  const user = getStudentSessionUser();
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(STUDENT_AUTH_TOKEN_STORAGE_KEY);
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (user?.role === "student") {
    headers["x-demo-user-id"] = String(user.id);
  }
  return headers;
}

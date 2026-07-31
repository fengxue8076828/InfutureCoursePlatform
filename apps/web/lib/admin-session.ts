export const ADMIN_AUTH_TOKEN_STORAGE_KEY = "admin-demo-token";
export const ADMIN_USER_ID_STORAGE_KEY = "infuture-admin-user-id";
export const ADMIN_AUTH_USER_STORAGE_KEY = "infuture-admin-auth-user";
export const ADMIN_PROFILE_STORAGE_KEY = "infuture-admin-profile";
export const ADMIN_SESSION_LAST_ACTIVITY_STORAGE_KEY = "infuture-admin-session-last-activity-at";
export const ADMIN_SESSION_EXPIRES_AT_STORAGE_KEY = "infuture-admin-session-expires-at";

export const ADMIN_SESSION_TIMEOUT_MS = 60 * 60 * 1000;

export type AdminSessionUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  institution_id: number | null;
};

export type AdminAuthResponse = {
  access_token: string;
  token_type?: string;
  user: AdminSessionUser;
};

function parseUserIdFromToken(token: string | null) {
  const match = token?.match(/^demo-token-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function readStoredNumber(key: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getAdminSessionExpiresAt() {
  return readStoredNumber(ADMIN_SESSION_EXPIRES_AT_STORAGE_KEY);
}

export function isAdminSessionExpired(now = Date.now()) {
  const expiresAt = getAdminSessionExpiresAt();
  return Boolean(expiresAt && expiresAt <= now);
}

export function hasAdminSessionCredentials() {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    window.localStorage.getItem(ADMIN_AUTH_TOKEN_STORAGE_KEY) &&
      window.localStorage.getItem(ADMIN_AUTH_USER_STORAGE_KEY)
  );
}

export function isAdminSessionValid(now = Date.now()) {
  return hasAdminSessionCredentials() && !isAdminSessionExpired(now);
}

export function refreshAdminSessionActivity(now = Date.now()) {
  if (typeof window === "undefined" || !hasAdminSessionCredentials()) {
    return;
  }
  window.localStorage.setItem(ADMIN_SESSION_LAST_ACTIVITY_STORAGE_KEY, String(now));
  window.localStorage.setItem(ADMIN_SESSION_EXPIRES_AT_STORAGE_KEY, String(now + ADMIN_SESSION_TIMEOUT_MS));
  window.dispatchEvent(new Event("infuture-admin-session-change"));
}

export function clearExpiredAdminSession(now = Date.now()) {
  if (typeof window === "undefined" || !isAdminSessionExpired(now)) {
    return false;
  }
  clearAdminSession();
  return true;
}

export function getAdminSessionUserId() {
  if (typeof window === "undefined") {
    return 2;
  }
  if (clearExpiredAdminSession()) {
    return 0;
  }
  const sessionUser = getAdminSessionUser();
  if (sessionUser?.id && Number.isFinite(sessionUser.id) && sessionUser.id > 0) {
    return sessionUser.id;
  }
  const storedId = Number(window.localStorage.getItem(ADMIN_USER_ID_STORAGE_KEY));
  if (Number.isFinite(storedId) && storedId > 0) {
    return storedId;
  }
  return parseUserIdFromToken(window.localStorage.getItem(ADMIN_AUTH_TOKEN_STORAGE_KEY)) ?? 2;
}

export function getAdminSessionUser(): AdminSessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (clearExpiredAdminSession()) {
    return null;
  }
  const stored = window.localStorage.getItem(ADMIN_AUTH_USER_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as AdminSessionUser;
  } catch {
    return null;
  }
}

export function getAdminRequestHeaders(base: Record<string, string> = {}) {
  clearExpiredAdminSession();
  return {
    ...base,
    "x-demo-user-id": String(getAdminSessionUserId())
  };
}

export function persistAdminSession(auth: AdminAuthResponse) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADMIN_AUTH_TOKEN_STORAGE_KEY, auth.access_token);
  window.localStorage.setItem(ADMIN_USER_ID_STORAGE_KEY, String(auth.user.id));
  window.localStorage.setItem(ADMIN_AUTH_USER_STORAGE_KEY, JSON.stringify(auth.user));
  window.localStorage.setItem(
    ADMIN_PROFILE_STORAGE_KEY,
    JSON.stringify({
      name: auth.user.full_name,
      email: auth.user.email,
      role: auth.user.role,
      roleValue: auth.user.role,
      avatar: auth.user.avatar_url ?? ""
    })
  );
  refreshAdminSessionActivity();
  window.dispatchEvent(new Event("infuture-admin-profile-change"));
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_USER_ID_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_AUTH_USER_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_PROFILE_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_SESSION_LAST_ACTIVITY_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_STORAGE_KEY);
  window.dispatchEvent(new Event("infuture-admin-session-change"));
  window.dispatchEvent(new Event("infuture-admin-profile-change"));
}

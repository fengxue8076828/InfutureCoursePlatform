export const ADMIN_AUTH_TOKEN_STORAGE_KEY = "admin-demo-token";
export const ADMIN_USER_ID_STORAGE_KEY = "infuture-admin-user-id";
export const ADMIN_AUTH_USER_STORAGE_KEY = "infuture-admin-auth-user";
export const ADMIN_PROFILE_STORAGE_KEY = "infuture-admin-profile";

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

export function getAdminSessionUserId() {
  if (typeof window === "undefined") {
    return 2;
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
  window.dispatchEvent(new Event("infuture-admin-profile-change"));
}

const localApiBaseUrl = "http://localhost:8000/api/v1";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isLocalApiUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(value.trim());
}

function inferBrowserApiBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const { protocol, hostname } = window.location;
  if (isLocalHostname(hostname)) {
    return localApiBaseUrl;
  }

  const rootDomain = hostname.replace(/^www\./i, "");
  return `${protocol}//api.${rootDomain}/api/v1`;
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const browserFallback = inferBrowserApiBaseUrl();

  if (configured && !(browserFallback && isLocalApiUrl(configured) && !browserFallback.includes("localhost"))) {
    return trimTrailingSlash(configured);
  }

  return trimTrailingSlash(browserFallback ?? configured ?? localApiBaseUrl);
}

export const API_BASE_URL = getApiBaseUrl();

export function getApiOrigin() {
  return API_BASE_URL.replace(/\/api\/v\d+\/?$/i, "");
}

export function apiConnectionErrorMessage(action = "无法连接 API 服务") {
  return `${action}，请确认 ${getApiOrigin()} 可以访问。`;
}

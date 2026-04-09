import type { StoryRequest, StoryResponse } from "@/lib/types";

function isLocalDevHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    return true;
  // Typical LAN dev servers — keep http:// if user explicitly set it
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

function getBaseUrl(): string {
  const fallback = "http://localhost:8000";
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? fallback).trim();
  if (!raw) return fallback;
  const noTrailing = raw.replace(/\/+$/, "");
  // Without "https://" the browser treats the string as a *relative* path on the
  // current origin (e.g. localhost:3000), producing wrong URLs like
  // http://localhost:3000/api.example.com/...
  let urlStr = noTrailing;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }
  try {
    const u = new URL(urlStr);
    // Railway / most hosts redirect http → https. Browsers do not follow redirects
    // on CORS preflight (OPTIONS), so remote http:// APIs must use https:// directly.
    if (u.protocol === "http:" && !isLocalDevHost(u.hostname)) {
      u.protocol = "https:";
    }
    return u.href.replace(/\/$/, "");
  } catch {
    return urlStr;
  }
}

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (e && typeof e === "object" && "msg" in e)
          return String((e as { msg: string }).msg);
        return JSON.stringify(e);
      })
      .join("; ");
  }
  return "Request failed";
}

export async function generateStory(
  body: StoryRequest
): Promise<StoryResponse> {
  const res = await fetch(`${getBaseUrl()}/api/generate-story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { detail?: unknown };
      if (errJson.detail !== undefined) {
        message = formatErrorDetail(errJson.detail);
      }
    } catch {
      /* use statusText */
    }
    throw new Error(message);
  }

  return res.json() as Promise<StoryResponse>;
}

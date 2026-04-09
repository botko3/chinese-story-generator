import type { StoryRequest, StoryResponse } from "@/lib/types";

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  );
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
  const res = await fetch(`${getBaseUrl()}/generate-story`, {
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

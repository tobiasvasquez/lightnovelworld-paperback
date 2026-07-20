import { BasicRateLimiter } from "@paperback/types";

import { DOMAIN } from "./models";

const FALLBACK_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export const mainRateLimiter = new BasicRateLimiter("main", {
  numberOfRequests: 4,
  bufferInterval: 1,
  ignoreImages: true,
});

async function getUserAgent(): Promise<string> {
  try {
    return (await Application.getDefaultUserAgent()) || FALLBACK_USER_AGENT;
  } catch {
    return FALLBACK_USER_AGENT;
  }
}

async function getHeaders(referer?: string): Promise<Record<string, string>> {
  return {
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    Origin: DOMAIN,
    Referer: referer ?? `${DOMAIN}/`,
    "User-Agent": await getUserAgent(),
  };
}

async function request(url: string, referer?: string): Promise<string> {
  const [response, data] = await Application.scheduleRequest({
    url,
    method: "GET",
    headers: await getHeaders(referer),
  });

  if (response.status >= 400) {
    throw new Error(`Request failed with status ${response.status}: ${url}`);
  }

  return Application.arrayBufferToUTF8String(data);
}

export async function fetchJSON<T>(url: string, referer = DOMAIN): Promise<T> {
  const payload = await request(url, referer);
  return JSON.parse(payload) as T;
}

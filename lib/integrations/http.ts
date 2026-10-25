export type ProviderFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;
export interface ProviderOptions {
  fetch?: ProviderFetch;
  now?: () => number;
  timeoutMs?: number;
}

/** The deadline covers response-body reads as well as the initial connection. */
export async function providerJson(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider request failed");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

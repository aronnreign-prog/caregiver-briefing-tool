interface FetchWithRetryOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
  retryOnStatus?: number[];
}

interface FetchWithRetryResult {
  response: Response;
  attempts: number;
}

const DEFAULT_RETRY_STATUS = [502, 503, 504];
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 2;
const RENDER_COLD_START_MAX_RETRIES = 4;
const RENDER_COLD_START_TIMEOUT_MS = 90000;

function isRetryableStatus(status: number, retryStatuses: number[]): boolean {
  return retryStatuses.includes(status);
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<FetchWithRetryResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryOnStatus = DEFAULT_RETRY_STATUS,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const signal = controller.signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchOptions,
        signal,
      });

      clearTimeout(timeoutId);

      if (isRetryableStatus(response.status, retryOnStatus) && attempt < maxRetries) {
        const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 16000);
        console.warn(
          `[RETRY] ${url} returned ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}). ` +
          `Retrying in ${backoffMs}ms...`,
        );
        await delay(backoffMs);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      return { response, attempts: attempt + 1 };
    } catch (error) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      if (isTimeout(error)) {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
        if (attempt < maxRetries) {
          const backoffMs = Math.min(Math.pow(2, attempt) * 2000, 16000);
          console.warn(
            `[RETRY] ${url} timed out (attempt ${attempt + 1}/${maxRetries + 1}). ` +
            `Retrying in ${backoffMs}ms...`,
          );
          await delay(backoffMs);
          continue;
        }
        throw lastError;
      }

      if (isNetworkError(error)) {
        lastError = new Error(
          `Network error connecting to ${url}: ${(error as Error).message}`,
        );
        if (attempt < maxRetries) {
          const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 16000);
          console.warn(
            `[RETRY] ${url} network error (attempt ${attempt + 1}/${maxRetries + 1}). ` +
            `Retrying in ${backoffMs}ms...`,
          );
          await delay(backoffMs);
          continue;
        }
        throw lastError;
      }

      throw error;
    }
  }

  throw lastError || new Error(`fetchWithRetry exhausted all ${maxRetries + 1} attempts`);
}

export function fetchRender(
  path: string,
  options: FetchWithRetryOptions = {},
): Promise<FetchWithRetryResult> {
  const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL") ||
    "http://host.docker.internal:8000";

  const url = `${GRAPHITI_WRAPPER_URL}${path}`;

  return fetchWithRetry(url, {
    ...options,
    timeoutMs: options.timeoutMs ?? RENDER_COLD_START_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? RENDER_COLD_START_MAX_RETRIES,
    retryOnStatus: options.retryOnStatus ?? DEFAULT_RETRY_STATUS,
    headers: {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  } as FetchWithRetryOptions);
}
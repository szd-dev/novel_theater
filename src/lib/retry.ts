export interface RetryOptions {
  maxRetries?: number; // default: 3
  baseDelayMs?: number; // default: 1000
  maxDelayMs?: number; // default: 10000
  shouldRetry?: (error: unknown) => boolean; // default: retry on rate limit + network errors
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const maxDelay = options?.maxDelayMs ?? 10000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      if (options?.shouldRetry && !options.shouldRetry(error)) break;
      // Default: only retry on rate limit or network errors
      if (!options?.shouldRetry && !isRateLimitError(error) && !isNetworkError(error)) break;
      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("429") || error.message.includes("rate limit")
    );
  }
  return false;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("fetch failed")
    );
  }
  return false;
}

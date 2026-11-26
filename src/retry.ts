import type { RetryOptions } from './types';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT']);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorStatus(record: Record<string, unknown>): number | undefined {
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.code === 'number') {
    return record.code;
  }
  const response = record.response as Record<string, unknown> | undefined;
  if (typeof response?.status === 'number') {
    return response.status;
  }
  return undefined;
}

export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const record = err as Record<string, unknown>;
  const status = getErrorStatus(record);
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }
  const code = typeof record.code === 'string' ? record.code : undefined;
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 4, baseDelayMs = 500, maxDelayMs = 16_000, jitter = true, sleep = defaultSleep } = options;

  const attemptRetry = async (attempt: number): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryableError(err)) {
        throw err;
      }
      const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = jitter ? Math.round(expDelay * (0.5 + Math.random() * 0.5)) : expDelay;
      await sleep(delay);
      return attemptRetry(attempt + 1);
    }
  };

  return attemptRetry(0);
}

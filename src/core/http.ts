import { ReferralPandaError } from './errors.js';
import { uuid } from './ids.js';

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

export interface HttpOptions {
  apiUrl: string;
  apiKey: string;
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  userAgent: string;
  /** Called with the method, path, status and request id. Never with keys or bodies. */
  debug?: (line: string) => void;
}

export interface HttpResult<T> {
  data: T;
  /** Seconds the server allows the answer to be reused for, from Cache-Control. */
  maxAge: number | null;
}

const ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];
/** The longest the SDK will wait because the server asked it to. Past this the call fails. */
const MAX_RETRY_AFTER_MS = 5000;

const retryable = (status: number) => status === 429 || status >= 500;

function maxAge(header: string | null): number | null {
  const match = /max-age=(\d+)/.exec(header ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * One request to the API, with a timeout and a few retries on network failures, 5xx and
 * 429. Every POST carries an Idempotency-Key that is the same on each retry, so a request
 * that reached the server but whose answer was lost is not applied twice.
 */
export async function request<T>(
  options: HttpOptions,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    Accept: 'application/json',
    'X-ReferralPanda-SDK': options.userAgent,
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = uuid();
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);

  let failure = new ReferralPandaError('network_error', 'The request could not be sent.');
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await options.sleep(BACKOFF_MS[attempt - 1] ?? 1200);

    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), options.timeoutMs);
    let response: FetchResponse;
    try {
      response = await options.fetch(`${options.apiUrl}${path}`, {
        method,
        headers,
        ...(payload !== undefined && { body: payload }),
        ...(controller && { signal: controller.signal }),
      });
    } catch (error) {
      const aborted = (error as { name?: string } | null)?.name === 'AbortError';
      failure = new ReferralPandaError(
        aborted ? 'timeout' : 'network_error',
        aborted ? 'The request timed out.' : 'The request could not be sent.',
      );
      options.debug?.(`${method} ${path} ${failure.code}`);
      continue;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text().catch(() => '');
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const requestId =
      response.headers.get('x-request-id') ??
      (json as { error?: { request_id?: string } } | null)?.error?.request_id ??
      undefined;
    options.debug?.(`${method} ${path} ${response.status}${requestId ? ` ${requestId}` : ''}`);

    if (response.status >= 200 && response.status < 300) {
      return { data: json as T, maxAge: maxAge(response.headers.get('cache-control')) };
    }

    const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
    failure = new ReferralPandaError(
      error?.code ?? (response.status >= 500 ? 'internal_error' : 'invalid_request'),
      error?.message ?? `The API answered ${response.status}.`,
      response.status,
      requestId,
    );
    if (!retryable(response.status)) throw failure;
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? '0') * 1000;
      if (wait > MAX_RETRY_AFTER_MS) throw failure;
      if (wait > 0 && attempt < ATTEMPTS - 1) await options.sleep(wait);
    }
  }
  throw failure;
}

import { SDK_VERSION } from './client.js';
import { ReferralPandaError } from './errors.js';
import { type FetchLike, request } from './http.js';
import { type Placement, type WireScreenPreview, toPlacement } from './types.js';

/** A screen as the dashboard has it right now, published or not, filled with sample data. */
export interface ScreenPreview extends Placement {
  /** True when this version has not been published yet. */
  draft: boolean;
  /** When the preview token stops working. */
  expiresAt: string;
}

export interface ScreenPreviewOptions {
  apiUrl?: string;
  /** The locale to resolve strings for, for example "pt-BR". */
  locale?: string;
  timeoutMs?: number;
  /** For tests. */
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

const TOKEN = /^rpv_[A-Za-z0-9_-]{43}$/;

/**
 * The preview token inside a link from the dashboard's "Preview on device" QR code, or null
 * when the link is not a preview link.
 */
export function previewTokenFromUrl(url: string | null | undefined): string | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/preview\/?\?(?:[^#]*&)?token=([^&#]+)/i.exec(url ?? '');
  if (!match?.[1]) return null;
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return TOKEN.test(token) ? token : null;
}

/**
 * Fetches the newest version of a screen with a preview token from the dashboard. Needs no
 * API key and no configured client: the token alone says which screen. Nothing is cached,
 * so calling it again shows the latest edit.
 */
export async function getScreenPreview(
  token: string,
  options: ScreenPreviewOptions = {},
): Promise<ScreenPreview> {
  if (!TOKEN.test(token)) {
    throw new ReferralPandaError('invalid_argument', 'That is not a preview token.');
  }
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  const fetchImpl = options.fetch ?? globalFetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new ReferralPandaError('invalid_argument', 'No fetch is available. Pass one in options.');
  }
  const query = options.locale ? `?locale=${encodeURIComponent(options.locale)}` : '';
  const { data } = await request<WireScreenPreview>(
    {
      apiUrl: (options.apiUrl ?? 'https://api.referralpanda.com').replace(/\/+$/, ''),
      // Sent as the bearer token. A preview token is the whole credential for this call.
      apiKey: token,
      fetch: fetchImpl,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      timeoutMs: options.timeoutMs ?? 10_000,
      userAgent: `react-native/${SDK_VERSION} preview`,
    },
    'GET',
    `/v1/sdk/preview${query}`,
  );
  return { ...toPlacement(data, Date.now()), draft: data.draft, expiresAt: data.expires_at };
}

/**
 * Share links look like https://go.referralpanda.com/{handle}/{code}, with /t/ before the
 * code in sandbox. The server decides whether a link belongs to this project; the SDK only
 * needs to tell "one of ours" from any other URL the app is opened with.
 */
const CODE = /^[A-Za-z0-9]{3,20}$/;
const HANDLE = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;
const CHANNEL = /^[a-z0-9_]{1,50}$/;

export const DEFAULT_LINK_HOSTS = ['go.referralpanda.com'];

function parse(url: string): { host: string; segments: string[] } | null {
  // No URL class on every runtime, and this shape is simple enough to read by hand.
  const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
  if (!match) return null;
  const host = (match[1] ?? '').toLowerCase().replace(/:\d+$/, '');
  const segments = (match[2] ?? '').split('/').filter(Boolean);
  return { host, segments };
}

/** The code in a share link, or null when the URL is not a share link on one of the hosts. */
export function shareLinkCode(url: string, hosts: readonly string[]): string | null {
  const parsed = parse(url);
  if (!parsed || !hosts.includes(parsed.host)) return null;
  const [handle, second, third] = parsed.segments;
  if (!handle || !HANDLE.test(handle.toLowerCase())) return null;
  const code = parsed.segments.length === 3 && second === 't' ? third : second;
  if (parsed.segments.length > 3 || (parsed.segments.length === 3 && second !== 't')) return null;
  return code && CODE.test(code) ? code.toUpperCase() : null;
}

/** Adds the share channel to a link, so clicks can be counted per channel. */
export function withChannel(link: string, channel: string | undefined): string {
  const name = channel?.trim().toLowerCase() ?? '';
  if (!CHANNEL.test(name)) return link;
  const [base = link, hash] = link.split('#', 2);
  const joined = `${base}${base.includes('?') ? '&' : '?'}ch=${name}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}

export function isChannel(value: string): boolean {
  return CHANNEL.test(value);
}

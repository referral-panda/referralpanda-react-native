import { AppState, Linking } from 'react-native';
import {
  type ClientOptions,
  ReferralPandaClient,
  ReferralPandaError,
  type ReferralPandaEvents,
} from './core/index.js';
import { nativePlatform } from './native.js';
import { defaultStorage, reactNativePlatform } from './platform.js';

export interface ConfigureOptions extends Omit<
  ClientOptions,
  'platform' | 'fetch' | 'now' | 'sleep'
> {
  /**
   * Listen for links the app is opened with and pass them to handleURL. On by default.
   * Turn it off when the app routes links itself and calls handleURL where it wants to.
   */
  handleLinks?: boolean;
  platform?: Partial<ClientOptions['platform']>;
}

let client: ReferralPandaClient | null = null;
let cleanup: (() => void)[] = [];
const waiting = new Set<() => void>();

/** The configured client. Throws when configure() has not been called. */
export function current(): ReferralPandaClient {
  if (!client) {
    throw new ReferralPandaError('not_configured', 'Call ReferralPanda.configure() first.');
  }
  return client;
}
export const isConfigured = () => client !== null;
/** For hooks: runs when configure() is called, now or later. Returns an unsubscribe. */
export function onConfigured(listener: () => void): () => void {
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

/** Call once at app start, before anything else. Calling it again replaces the configuration. */
export function configure(options: ConfigureOptions): ReferralPandaClient {
  for (const remove of cleanup) remove();
  cleanup = [];

  const { handleLinks = true, platform, ...rest } = options;
  const next = new ReferralPandaClient({
    ...rest,
    storage: rest.storage ?? defaultStorage(),
    platform: (() => {
      const base = reactNativePlatform();
      return { ...base, ...nativePlatform(base.os), ...platform };
    })(),
  });
  client = next;

  if (handleLinks) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      next.handleURL(url);
    });
    cleanup.push(() => subscription.remove());
    void Linking.getInitialURL()
      .then((url) => next.handleURL(url))
      .catch(() => undefined);
  }
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') next.resume();
    else void next.flush().catch(() => undefined);
  });
  cleanup.push(() => appState.remove());

  for (const listener of waiting) listener();
  return next;
}

type Client = ReferralPandaClient;
type Args<K extends keyof Client> = Client[K] extends (...args: infer A) => unknown ? A : never;
type Result<K extends keyof Client> = Client[K] extends (...args: never[]) => infer R ? R : never;
const call =
  <K extends keyof Client>(method: K) =>
  (...args: Args<K>): Result<K> =>
    (current()[method] as (...values: Args<K>) => Result<K>)(...args);

/**
 * The SDK. Every method is also what the screen components use, so an app can build its
 * own referral UI on exactly the same calls.
 */
export const ReferralPanda = {
  configure,
  get isConfigured() {
    return isConfigured();
  },
  get appUserId() {
    return client?.appUserId ?? null;
  },
  logIn: call('logIn'),
  logOut: call('logOut'),
  setAttributes: call('setAttributes'),
  /** Returns false, without throwing, when the SDK is not configured yet. */
  handleURL: (url: string | null | undefined) => client?.handleURL(url) ?? false,
  getReferral: call('getReferral'),
  getRewards: call('getRewards'),
  getOfferCode: call('getOfferCode'),
  getPlacement: call('getPlacement'),
  getShareContent: call('getShareContent'),
  share: call('share'),
  trackShare: call('trackShare'),
  redeemCode: call('redeemCode'),
  presentOfferCodeRedemption: call('presentOfferCodeRedemption'),
  track: call('track'),
  flush: call('flush'),
  addListener: <K extends keyof ReferralPandaEvents>(
    event: K,
    listener: (payload: ReferralPandaEvents[K]) => void,
  ) => current().addListener(event, listener),
};

import { ReferralPandaError } from './errors.js';
import { type FetchLike, type HttpOptions, request } from './http.js';
import { shortHash, uuid } from './ids.js';
import { DEFAULT_LINK_HOSTS, isChannel, shareLinkCode, withChannel } from './link.js';
import { type Storage, Store, memoryStorage } from './storage.js';
import {
  type AttributeValue,
  type Attributes,
  type Placement,
  type RedeemResult,
  type Referral,
  type ReferralPandaEvents,
  type Reward,
  type ShareContent,
  type WireAttribution,
  type WireIdentify,
  type WirePlacement,
  type WireReferral,
  toPlacement,
  toReferral,
} from './types.js';

export const SDK_VERSION = '0.1.0-beta.0';

/** What the SDK needs from the device. React Native supplies these in the main entry point. */
export interface Platform {
  os: 'ios' | 'android' | 'web';
  appVersion?: string;
  /** The device locale, for example "pt-BR". */
  locale?: () => string;
  /** Opens the system share sheet. Resolves false when the user dismissed it. */
  share?: (content: { message: string; url: string }) => Promise<boolean>;
  /** Android: the raw Play Install Referrer string, or null. */
  installReferrer?: () => Promise<string | null>;
  /** iOS: Apple's own offer code redemption sheet. */
  presentOfferCodeRedemption?: () => Promise<void>;
}

export interface ClientOptions {
  /** A public key (rp_pub_…). Never a secret key: those must not ship in an app. */
  apiKey: string;
  /** Your id for the signed-in user. Leave out until the user signs in, then call logIn. */
  appUserId?: string;
  /** The RevenueCat app user id, when it differs from appUserId. */
  revenueCatAppUserId?: string;
  apiUrl?: string;
  /** Hosts whose links are share links. Add your custom link domain here. */
  linkHosts?: string[];
  storage?: Storage;
  platform?: Platform;
  fetch?: FetchLike;
  /** Logs one line per request: method, path, status and request id. Nothing else. */
  debug?: boolean | ((line: string) => void);
  /** How long events wait to be sent together. 0 sends only when flush() is called. */
  flushIntervalMs?: number;
  timeoutMs?: number;
  /** For tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface PendingAttribution {
  linkUrl?: string;
  installReferrer?: string;
}
interface QueuedEvent {
  type: string;
  event_id: string;
  occurred_at: string;
  properties?: Record<string, AttributeValue>;
  /** The user at the time, so an event recorded before logOut is not credited to the next user. */
  user?: string;
}
type Listener<K extends keyof ReferralPandaEvents> = (payload: ReferralPandaEvents[K]) => void;

const EVENT_TYPE = /^[a-z][a-z0-9_]{0,62}$/;
const PLACEMENT_KEY = /^[a-z][a-z0-9_]{0,62}$/;
const REFERRAL_TTL_MS = 30_000;
const DEFAULT_PLACEMENT_MAX_AGE_S = 60;
const MAX_QUEUE = 500;
const BATCH = 100;
const FLUSH_AT = 20;

const offline = (error: unknown) =>
  error instanceof ReferralPandaError &&
  (error.code === 'network_error' || error.code === 'timeout' || (error.status ?? 0) >= 500);

/**
 * The whole SDK without anything that needs a device. Everything the screen components do
 * goes through the public methods here, so an app can build its own UI on the same calls.
 */
export class ReferralPandaClient {
  readonly environment: 'sandbox' | 'production';
  private readonly http: HttpOptions;
  private readonly store: Store;
  private readonly platform: Platform;
  private readonly linkHosts: string[];
  private readonly now: () => number;
  private readonly flushIntervalMs: number;
  private readonly listeners = new Map<keyof ReferralPandaEvents, Set<Listener<never>>>();

  private user: string | null = null;
  private rcUser: string | undefined;
  private pending: PendingAttribution | null = null;
  private queue: QueuedEvent[] = [];
  private referral: Referral | null = null;
  /** The request in flight, and whose it is. Never handed to another user. */
  private referralRequest: { user: string; promise: Promise<Referral> } | null = null;
  /** Sign-ins and sign-outs run one at a time, in the order they were asked for. */
  private identity: Promise<unknown> = Promise.resolve();
  private readonly placements = new Map<string, { placement: Placement; maxAgeMs: number }>();
  private flushing: Promise<void> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Resolves when stored state is loaded and any user given to the constructor is signed in. */
  readonly ready: Promise<void>;

  constructor(options: ClientOptions) {
    const apiKey = options.apiKey?.trim() ?? '';
    if (apiKey.startsWith('rp_sk_')) {
      throw new ReferralPandaError(
        'invalid_argument',
        'This is a secret key. Apps must use a public key (rp_pub_…). Roll this key in the dashboard, because a key in an app can be read by anyone.',
      );
    }
    if (!apiKey.startsWith('rp_pub_')) {
      throw new ReferralPandaError('invalid_argument', 'apiKey must be a public key (rp_pub_…).');
    }
    this.environment = apiKey.startsWith('rp_pub_test_') ? 'sandbox' : 'production';
    this.platform = options.platform ?? { os: 'web' };
    this.linkHosts = [...DEFAULT_LINK_HOSTS, ...(options.linkHosts ?? [])].map((host) =>
      host.toLowerCase(),
    );
    this.now = options.now ?? Date.now;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.rcUser = options.revenueCatAppUserId;
    this.store = new Store(options.storage ?? memoryStorage(), `rp:${shortHash(apiKey)}:`);

    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const fetchImpl = options.fetch ?? globalFetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new ReferralPandaError(
        'invalid_argument',
        'No fetch is available. Pass one in options.',
      );
    }
    const debug =
      typeof options.debug === 'function'
        ? options.debug
        : options.debug
          ? (line: string) => console.log(`[ReferralPanda] ${line}`)
          : undefined;
    this.http = {
      apiUrl: (options.apiUrl ?? 'https://api.referralpanda.com').replace(/\/+$/, ''),
      apiKey,
      fetch: fetchImpl,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      timeoutMs: options.timeoutMs ?? 10_000,
      userAgent: `react-native/${SDK_VERSION} ${this.platform.os}`,
      ...(debug && { debug }),
    };

    this.ready = this.start(options.appUserId);
    // A failed start must not become an unhandled rejection. Callers that await `ready` see it.
    this.ready.catch(() => undefined);
  }

  // --- identity ----------------------------------------------------------------------------

  private async start(appUserId: string | undefined): Promise<void> {
    const [pending, queue] = await Promise.all([
      this.store.get<PendingAttribution>('pending'),
      this.store.get<QueuedEvent[]>('events'),
    ]);
    // Anything recorded while this was loading (a link, an event at app start) is kept.
    if (pending || this.pending) this.pending = { ...pending, ...this.pending };
    this.queue = [...(Array.isArray(queue) ? queue : []), ...this.queue];
    if (appUserId) await this.signIn(appUserId, undefined);
    else if (this.queue.length > 0) this.scheduleFlush();
  }

  /** The signed-in user's id, or null. */
  get appUserId(): string | null {
    return this.user;
  }

  /**
   * Tells ReferralPanda who the user is. Call it when the user signs in, and again at each
   * app start. Creates their referral code on first sight, and sends any link the app was
   * opened with before they signed in.
   */
  async logIn(
    appUserId: string,
    options: { attributes?: Attributes; revenueCatAppUserId?: string } = {},
  ): Promise<{ created: boolean }> {
    await this.ready.catch(() => undefined);
    return this.inTurn(() => {
      if (options.revenueCatAppUserId) this.rcUser = options.revenueCatAppUserId;
      return this.signIn(appUserId, options.attributes);
    });
  }

  /**
   * Runs one identity change after the previous one has finished. Two sign-ins at once
   * (a double tap, or a sign-in racing a sign-out) would otherwise interleave, and the
   * device could end up showing one user while holding another's data.
   */
  private inTurn<T>(change: () => Promise<T>): Promise<T> {
    const result = this.identity.then(change, change);
    this.identity = result.catch(() => undefined);
    return result;
  }

  private async signIn(
    appUserId: string,
    attributes: Attributes | undefined,
  ): Promise<{ created: boolean }> {
    const id = appUserId?.trim() ?? '';
    if (id.length < 1 || id.length > 255) {
      throw new ReferralPandaError('invalid_argument', 'appUserId must be 1 to 255 characters.');
    }
    if (this.user !== id) this.forgetUser();
    const { data } = await request<WireIdentify>(this.http, 'POST', '/v1/sdk/customers/identify', {
      app_user_id: id,
      ...(this.rcUser && { rc_app_user_id: this.rcUser }),
      ...(attributes && { attributes }),
      platform: this.platform.os,
      ...(this.platform.appVersion && { app_version: this.platform.appVersion }),
    });
    const changed = this.user !== id;
    this.user = id;
    if (changed) this.emit('userChanged', { appUserId: id });
    await this.readInstallReferrer();
    // Not awaited: signing in should not wait on attribution or queued events.
    void this.sendAttribution();
    this.scheduleFlush();
    return { created: data.created };
  }

  /** Forgets the user on this device. Their data on the server is untouched. */
  async logOut(): Promise<void> {
    await this.ready.catch(() => undefined);
    await this.inTurn(async () => {
      await this.flush().catch(() => undefined);
      this.forgetUser();
      const changed = this.user !== null;
      this.user = null;
      if (changed) this.emit('userChanged', { appUserId: null });
    });
  }

  private forgetUser(): void {
    this.referral = null;
    this.referralRequest = null;
    this.placements.clear();
  }

  /** Updates attributes on the signed-in user, for example { first_name: 'Sam' }. */
  async setAttributes(attributes: Attributes): Promise<void> {
    const user = await this.requireUser();
    await request<WireIdentify>(this.http, 'POST', '/v1/sdk/customers/identify', {
      app_user_id: user,
      attributes,
    });
  }

  private async requireUser(): Promise<string> {
    await this.ready.catch(() => undefined);
    if (!this.user) {
      throw new ReferralPandaError('not_logged_in', 'Call logIn(appUserId) before this.');
    }
    return this.user;
  }

  // --- attribution ---------------------------------------------------------------------------

  /**
   * Give every URL the app is opened with to this. Returns true when it was a share link,
   * so the app can skip its own handling. The link is kept until a user is signed in.
   */
  handleURL(url: string | null | undefined): boolean {
    if (!url || shareLinkCode(url, this.linkHosts) === null) return false;
    this.pending = { ...this.pending, linkUrl: url.trim().slice(0, 2000) };
    void this.store.set('pending', this.pending);
    void this.ready.then(() => this.sendAttribution()).catch(() => undefined);
    return true;
  }

  /** Android: reads the Play Install Referrer once per install. */
  private async readInstallReferrer(): Promise<void> {
    if (!this.platform.installReferrer) return;
    if (await this.store.get<boolean>('referrer_read')) return;
    try {
      const referrer = await this.platform.installReferrer();
      if (referrer) {
        this.pending = { ...this.pending, installReferrer: referrer.slice(0, 2000) };
        await this.store.set('pending', this.pending);
      }
      await this.store.set('referrer_read', true);
    } catch {
      // Not available right now (no Play Store, or the service is busy). Try at the next sign-in.
    }
  }

  private attributing: Promise<void> | null = null;
  private sendAttribution(): Promise<void> {
    this.attributing ??= this.attributeOnce().finally(() => {
      this.attributing = null;
    });
    return this.attributing;
  }

  private async attributeOnce(): Promise<void> {
    const pending = this.pending;
    const user = this.user;
    if (!pending || !user || (!pending.linkUrl && !pending.installReferrer)) return;
    try {
      const { data } = await request<WireAttribution>(this.http, 'POST', '/v1/sdk/attribution', {
        app_user_id: user,
        ...(pending.linkUrl && { link_url: pending.linkUrl }),
        ...(pending.installReferrer && { install_referrer: pending.installReferrer }),
      });
      await this.clearPending(pending);
      if (data.matched) await this.refreshReferral().catch(() => undefined);
    } catch (error) {
      // Offline or the API is down: keep it for the next attempt. Anything else will never
      // succeed, so it is dropped rather than retried forever.
      if (!offline(error) && !(error instanceof ReferralPandaError && error.status === 429)) {
        await this.clearPending(pending);
      }
    }
  }

  private async clearPending(sent: PendingAttribution): Promise<void> {
    // A link that arrived while the request was in flight stays.
    if (
      this.pending?.linkUrl === sent.linkUrl &&
      this.pending?.installReferrer === sent.installReferrer
    ) {
      this.pending = null;
      await this.store.remove('pending');
    }
  }

  /** For a code the user types in. A user can only ever be referred once. */
  async redeemCode(code: string): Promise<RedeemResult> {
    const user = await this.requireUser();
    const cleaned = code?.trim().toUpperCase() ?? '';
    if (!/^[A-Z0-9]{3,20}$/.test(cleaned)) return { status: 'invalid_code' };
    try {
      const { data } = await request<WireAttribution>(this.http, 'POST', '/v1/sdk/codes/redeem', {
        app_user_id: user,
        code: cleaned,
      });
      void this.refreshReferral().catch(() => undefined);
      return {
        status: 'redeemed',
        firstTime: data.referral?.created ?? false,
        referralStatus: data.referral?.status ?? 'attributed',
      };
    } catch (error) {
      if (error instanceof ReferralPandaError) {
        if (error.code === 'code_not_found') return { status: 'invalid_code' };
        if (error.code === 'self_referral') return { status: 'own_code' };
      }
      throw error;
    }
  }

  // --- the referral summary ------------------------------------------------------------------

  /**
   * The user's code, link, counts, rewards and who invited them. Answers from memory for a
   * short while. When the device is offline it answers with the last saved copy, marked stale.
   */
  async getReferral(options: { refresh?: boolean } = {}): Promise<Referral> {
    await this.requireUser();
    if (
      !options.refresh &&
      this.referral &&
      this.now() - this.referral.fetchedAt < REFERRAL_TTL_MS
    ) {
      return this.referral;
    }
    return this.refreshReferral();
  }

  private async refreshReferral(): Promise<Referral> {
    const user = await this.requireUser();
    // Share a request in flight only with the same user.
    if (this.referralRequest?.user === user) return this.referralRequest.promise;
    const promise = this.fetchReferral(user).finally(() => {
      if (this.referralRequest?.promise === promise) this.referralRequest = null;
    });
    this.referralRequest = { user, promise };
    return promise;
  }

  private async fetchReferral(user: string): Promise<Referral> {
    const slot = `referral:${shortHash(user)}`;
    const previous = this.referral ?? (await this.store.get<Referral>(slot));
    try {
      const { data } = await request<WireReferral>(
        this.http,
        'GET',
        `/v1/sdk/customers/${encodeURIComponent(user)}/referral`,
      );
      const referral = toReferral(data, this.now());
      if (this.user !== user) {
        // Someone else signed in, or the user signed out, while this was on its way. The
        // answer belongs to the earlier user and is never shown to the current one.
        if (this.user) return this.refreshReferral();
        throw new ReferralPandaError('not_logged_in', 'Call logIn(appUserId) before this.');
      }
      this.referral = referral;
      await this.store.set(slot, referral);
      this.announce(previous, referral);
      return referral;
    } catch (error) {
      if (offline(error) && previous && this.user === user) return { ...previous, stale: true };
      throw error;
    }
  }

  private announce(previous: Referral | null, next: Referral): void {
    // Nothing is announced the first time a device sees a user: after a reinstall every old
    // reward would otherwise look newly earned.
    if (!previous) return;
    const known = new Map(previous.rewards.map((reward) => [reward.id, reward.state]));
    for (const reward of next.rewards) {
      const state = known.get(reward.id);
      if (state === undefined) this.emit('rewardEarned', reward);
      else if (state !== reward.state) this.emit('rewardUpdated', reward);
    }
    const before = previous.referredBy?.status ?? null;
    if (next.referredBy && next.referredBy.status !== before) {
      this.emit('referralStatusChanged', { status: next.referredBy.status, previous: before });
    }
    const comparable = (referral: Referral) =>
      JSON.stringify({ ...referral, fetchedAt: 0, stale: false });
    if (comparable(previous) !== comparable(next)) this.emit('referralChanged', next);
  }

  /** The user's rewards. The same list as getReferral().rewards. */
  async getRewards(options: { refresh?: boolean } = {}): Promise<Reward[]> {
    return (await this.getReferral(options)).rewards;
  }

  /** The newest offer code the user can redeem in the store, or null. */
  async getOfferCode(): Promise<string | null> {
    const rewards = await this.getRewards();
    return (
      rewards.find((reward) => reward.state === 'issued' && reward.offerCode)?.offerCode ?? null
    );
  }

  // --- placements ----------------------------------------------------------------------------

  /**
   * The published screen for a placement, with its strings and values. Use it to render the
   * screen yourself, or pass the key to <ReferralView>. Works before a user signs in, with
   * program-wide values only.
   *
   * A cached copy is returned at once. When it is older than the server allows, a fresh one
   * is fetched in the background and announced with a placementUpdated event.
   */
  async getPlacement(
    key: string,
    options: { locale?: string; refresh?: boolean } = {},
  ): Promise<Placement> {
    await this.ready.catch(() => undefined);
    if (!PLACEMENT_KEY.test(key)) {
      throw new ReferralPandaError(
        'invalid_argument',
        'A placement key looks like settings_referral.',
      );
    }
    const locale = options.locale ?? this.platform.locale?.() ?? '';
    const slot = `placement:${key}:${locale}:${this.user ? shortHash(this.user) : ''}`;
    let cached = this.placements.get(slot);
    if (!cached && !options.refresh) {
      const stored = await this.store.get<{ placement: Placement; maxAgeMs: number }>(slot);
      if (stored?.placement) {
        cached = stored;
        this.placements.set(slot, stored);
      }
    }
    if (cached && !options.refresh) {
      if (this.now() - cached.placement.fetchedAt >= cached.maxAgeMs) {
        const before = cached.placement;
        void this.fetchPlacement(key, locale, slot)
          .then((fresh) => {
            if (
              fresh.screen.version !== before.screen.version ||
              fresh.screen.id !== before.screen.id
            ) {
              this.emit('placementUpdated', fresh);
            }
          })
          .catch(() => undefined);
      }
      return cached.placement;
    }
    try {
      return await this.fetchPlacement(key, locale, slot);
    } catch (error) {
      if (offline(error) && cached) return { ...cached.placement, stale: true };
      throw error;
    }
  }

  private async fetchPlacement(key: string, locale: string, slot: string): Promise<Placement> {
    const query = [
      this.user ? `app_user_id=${encodeURIComponent(this.user)}` : '',
      locale ? `locale=${encodeURIComponent(locale)}` : '',
    ]
      .filter(Boolean)
      .join('&');
    try {
      const { data, maxAge } = await request<WirePlacement>(
        this.http,
        'GET',
        `/v1/sdk/placements/${key}${query ? `?${query}` : ''}`,
      );
      const entry = {
        placement: toPlacement(data, this.now()),
        maxAgeMs: (maxAge ?? DEFAULT_PLACEMENT_MAX_AGE_S) * 1000,
      };
      this.placements.set(slot, entry);
      await this.store.set(slot, entry);
      return entry.placement;
    } catch (error) {
      // Unpublished or unassigned since: stop showing the old one.
      if (error instanceof ReferralPandaError && error.status === 404) {
        this.placements.delete(slot);
        await this.store.remove(slot);
      }
      throw error;
    }
  }

  // --- sharing -------------------------------------------------------------------------------

  /**
   * The link and a message to share, without opening anything. For apps with their own
   * share flow. `message` may use {{referral.link}} and {{referral.code}}; when it leaves the
   * link out, the link is added at the end.
   */
  async getShareContent(
    options: { channel?: string; message?: string } = {},
  ): Promise<ShareContent> {
    const referral = await this.getReferral();
    const link = withChannel(referral.link, options.channel);
    const template = options.message?.trim() || '{{referral.link}}';
    let message = template
      .replaceAll(/\{\{\s*referral\.link\s*\}\}/g, link)
      .replaceAll(/\{\{\s*referral\.code\s*\}\}/g, referral.code);
    if (!message.includes(link)) message = `${message} ${link}`;
    return { code: referral.code, link, message };
  }

  /** Opens the system share sheet with the user's link, and records the share. */
  async share(options: { channel?: string; message?: string } = {}): Promise<{ shared: boolean }> {
    if (!this.platform.share) {
      throw new ReferralPandaError('unavailable', 'Sharing is not available on this platform.');
    }
    const channel = options.channel ?? 'system';
    const content = await this.getShareContent({ ...options, channel });
    this.trackShare(channel);
    return { shared: await this.platform.share({ message: content.message, url: content.link }) };
  }

  /** Records a share the app handled itself, for example its own WhatsApp button. */
  trackShare(channel: string): void {
    this.track('share_tapped', isChannel(channel) ? { channel } : {});
  }

  /** iOS: opens Apple's own sheet for redeeming an offer code. */
  async presentOfferCodeRedemption(): Promise<void> {
    if (!this.platform.presentOfferCodeRedemption) {
      throw new ReferralPandaError(
        'unavailable',
        'Offer code redemption is only available on iOS.',
      );
    }
    await this.platform.presentOfferCodeRedemption();
  }

  // --- events --------------------------------------------------------------------------------

  /**
   * Records an event, for example track('screen_viewed', { placement: 'settings' }).
   * 'signed_up' also moves the user's referral forward. Events are sent together a moment
   * later and survive being offline or the app closing.
   */
  track(type: string, properties: Record<string, AttributeValue> = {}): void {
    if (!EVENT_TYPE.test(type)) {
      throw new ReferralPandaError(
        'invalid_argument',
        'An event name is lowercase letters, digits and underscores, starting with a letter.',
      );
    }
    this.queue.push({
      type,
      event_id: uuid(),
      occurred_at: new Date(this.now()).toISOString(),
      ...(Object.keys(properties).length > 0 && { properties }),
      ...(this.user && { user: this.user }),
    });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    void this.store.set('events', this.queue);
    if (this.queue.length >= FLUSH_AT || type === 'signed_up')
      void this.flush().catch(() => undefined);
    else this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushIntervalMs <= 0 || this.flushTimer || this.queue.length === 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch(() => undefined);
    }, this.flushIntervalMs);
    // In Node (tests, server rendering) a waiting timer must not keep the process alive.
    (this.flushTimer as { unref?: () => void }).unref?.();
  }

  /** Sends queued events now. Call it when the app goes to the background. */
  flush(): Promise<void> {
    this.flushing ??= this.flushAll().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushAll(): Promise<void> {
    await this.ready.catch(() => undefined);
    while (this.queue.length > 0) {
      // One request per user, so no event is credited to someone else.
      const user = this.queue[0]?.user;
      const batch = this.queue.filter((event) => event.user === user).slice(0, BATCH);
      const sent = new Set(batch.map((event) => event.event_id));
      try {
        await request(this.http, 'POST', '/v1/sdk/events', {
          ...(user && { app_user_id: user }),
          events: batch.map((event) => ({
            type: event.type,
            event_id: event.event_id,
            occurred_at: event.occurred_at,
            ...(event.properties && { properties: event.properties }),
          })),
        });
      } catch (error) {
        const retryLater =
          offline(error) || (error instanceof ReferralPandaError && error.status === 429);
        if (retryLater) return;
        // Refused for good (for example a property the API does not accept): drop the batch.
      }
      this.queue = this.queue.filter((event) => !sent.has(event.event_id));
      await this.store.set('events', this.queue);
    }
  }

  /** Call when the app returns to the foreground: retries anything that could not be sent. */
  resume(): void {
    void this.ready
      .then(() => Promise.all([this.sendAttribution(), this.flush()]))
      .catch(() => undefined);
  }

  // --- listeners -----------------------------------------------------------------------------

  /** Returns a function that removes the listener. */
  addListener<K extends keyof ReferralPandaEvents>(event: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as Listener<never>);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  private emit<K extends keyof ReferralPandaEvents>(
    event: K,
    payload: ReferralPandaEvents[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        (listener as Listener<K>)(payload);
      } catch {
        // A listener that throws must not stop the others or the SDK.
      }
    }
  }
}

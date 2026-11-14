import type { components } from '../generated/api.js';

type Schemas = components['schemas'];
export type WireReferral = Schemas['ReferralSummary'];
export type WirePlacement = Schemas['Placement'];
export type WireScreenPreview = Schemas['ScreenPreview'];
export type WireIdentify = Schemas['IdentifyResponse'];
export type WireAttribution = Schemas['AttributionResponse'];

export type ReferralStatus = NonNullable<WireReferral['referred_by']>['status'];
export type RewardState = WireReferral['rewards'][number]['state'];
export type RewardKind = NonNullable<WireReferral['rewards'][number]['kind']>;

/** Values an app may attach to a user or an event. */
export type AttributeValue = string | number | boolean | null;
export type Attributes = Record<string, AttributeValue>;

export interface Reward {
  id: string;
  state: RewardState;
  kind: RewardKind | null;
  /** What to call it in the app, for example "One free month". */
  label: string | null;
  /** Money rewards only. Integer minor units (cents), never a decimal. */
  amountMinor: number | null;
  /** ISO 4217, for example "USD". */
  currency: string | null;
  /** When a held reward is released. */
  availableAt: string | null;
  /** For an issued offer code reward: the code to redeem in the store. */
  offerCode: string | null;
  /** For an issued gift card or cash reward: where the user collects it. */
  redeemUrl: string | null;
}

export interface RewardOffer {
  kind: RewardKind;
  label: string | null;
}

export interface Referral {
  /** This user's own code. */
  code: string;
  /** This user's share link. */
  link: string;
  stats: { total: number; byStatus: Partial<Record<ReferralStatus, number>> };
  rewards: Reward[];
  program: {
    id: string;
    name: string;
    holdDays: number;
    referrerReward: RewardOffer | null;
    refereeReward: RewardOffer | null;
  } | null;
  /** Set when this user was invited by someone. */
  referredBy: { code: string; status: ReferralStatus } | null;
  /** Milliseconds since the epoch. */
  fetchedAt: number;
  /** True when the device was offline and this is the last copy that was saved. */
  stale: boolean;
}

export interface Placement {
  key: string;
  screen: {
    id: string;
    version: number;
    schemaVersion: number;
    /** The screen document, as described at referralpanda.com/docs/screens. */
    config: Record<string, unknown>;
    publishedAt: string | null;
  };
  locale: string;
  /** Strings for the locale, with {{tokens}} still in place. */
  strings: Record<string, string>;
  /** Values for the tokens. */
  values: Record<string, string>;
  stats: { total: number; pending: number; qualified: number; rewarded: number };
  rewards: { id: string; label: string; state: 'pending' | 'issued' }[];
  /** Asset id to URL. */
  assets: Record<string, string>;
  offerCode: string | null;
  fetchedAt: number;
  stale: boolean;
}

export interface ShareContent {
  code: string;
  /** The share link, tagged with the channel when one was given. */
  link: string;
  /** Ready to send. Contains the link. */
  message: string;
}

export type RedeemResult =
  /** The code was accepted, now or earlier. A user can only be referred once. */
  | { status: 'redeemed'; firstTime: boolean; referralStatus: ReferralStatus }
  | { status: 'invalid_code' }
  | { status: 'own_code' };

export interface ReferralPandaEvents {
  /** The referral summary changed in any way. */
  referralChanged: Referral;
  /** A reward this device had not seen before. */
  rewardEarned: Reward;
  /** A known reward moved to another state, for example from held to issued. */
  rewardUpdated: Reward;
  /** The referral that brought this user moved on, for example to qualified. */
  referralStatusChanged: { status: ReferralStatus; previous: ReferralStatus | null };
  /** A user signed in or out on this device. */
  userChanged: { appUserId: string | null };
  /** A newer published screen arrived for a placement that was served from cache. */
  placementUpdated: Placement;
}

export function toReward(wire: WireReferral['rewards'][number]): Reward {
  return {
    id: wire.reward_id,
    state: wire.state,
    kind: wire.kind,
    label: wire.label,
    amountMinor: wire.amount_minor,
    currency: wire.currency,
    availableAt: wire.available_at,
    offerCode: wire.offer_code,
    redeemUrl: wire.redeem_url,
  };
}

export function toReferral(wire: WireReferral, fetchedAt: number): Referral {
  return {
    code: wire.code,
    link: wire.link,
    stats: { total: wire.stats.total, byStatus: { ...wire.stats.by_status } },
    rewards: wire.rewards.map(toReward),
    program: wire.program && {
      id: wire.program.id,
      name: wire.program.name,
      holdDays: wire.program.hold_days,
      referrerReward: wire.program.referrer_reward,
      refereeReward: wire.program.referee_reward,
    },
    referredBy: wire.referred_by,
    fetchedAt,
    stale: false,
  };
}

export function toPlacement(wire: WirePlacement, fetchedAt: number): Placement {
  return {
    key: wire.key,
    screen: {
      id: wire.screen.id,
      version: wire.screen.version,
      schemaVersion: wire.screen.schema_version,
      config: wire.screen.config,
      publishedAt: wire.screen.published_at,
    },
    locale: wire.locale,
    strings: wire.strings,
    values: wire.values,
    stats: wire.stats,
    rewards: wire.rewards,
    assets: wire.assets,
    offerCode: wire.offer_code,
    fetchedAt,
    stale: false,
  };
}

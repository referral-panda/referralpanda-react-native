/**
 * The screen document as the placement route sends it: validated, with every default filled
 * in. Plain types, so the published SDK does not carry the validation library. A type test
 * (schema.test.ts) fails the build when packages/screen-schema changes and these do not.
 */
export type DevicePlatform = 'ios' | 'android' | 'web';
export type ColorName =
  'background' | 'surface' | 'text' | 'muted' | 'primary' | 'on_primary' | 'border' | 'success';
export type IconName =
  | 'gift'
  | 'heart'
  | 'star'
  | 'sparkles'
  | 'trophy'
  | 'users'
  | 'user_plus'
  | 'share'
  | 'link'
  | 'copy'
  | 'check'
  | 'clock'
  | 'lock'
  | 'cash'
  | 'ticket'
  | 'rocket';
export type ShareChannel = 'messages' | 'whatsapp' | 'copy_link' | 'more';
export type Stat = 'total' | 'pending' | 'qualified' | 'rewarded';
type Aspect = '1:1' | '16:9' | '4:3' | '3:4';

interface Base {
  id?: string | undefined;
  platforms?: DevicePlatform[] | undefined;
}

export type LeafNode =
  | (Base & {
      type: 'text';
      text: string;
      style: 'title' | 'heading' | 'body' | 'caption';
      align: 'start' | 'center' | 'end';
      color: ColorName;
    })
  | (Base & {
      type: 'image';
      asset: string;
      alt?: string | undefined;
      aspect: Aspect;
      fit: 'cover' | 'contain';
      rounded: boolean;
    })
  | (Base & { type: 'lottie'; asset: string; loop: boolean; aspect: Aspect })
  | (Base & { type: 'icon'; name: IconName; size: number; color: ColorName })
  | (Base & { type: 'spacer'; size: number })
  | (Base & { type: 'code_box'; label?: string | undefined; copied_label?: string | undefined })
  | (Base & {
      type: 'share_button';
      label: string;
      channel: 'system' | 'messages' | 'whatsapp' | 'copy_link';
      message?: string | undefined;
      style: 'primary' | 'secondary';
    })
  | (Base & { type: 'channel_row'; channels: ShareChannel[]; message?: string | undefined })
  | (Base & {
      type: 'progress';
      metric: 'qualified' | 'total';
      milestones: { count: number; label: string }[];
      caption?: string | undefined;
    })
  | (Base & {
      type: 'reward_list';
      title?: string | undefined;
      empty_label: string;
      show: 'all' | 'issued' | 'pending';
    })
  | (Base & { type: 'stats_row'; stats: { stat: Stat; label: string }[] })
  | (Base & {
      type: 'redeem_code_input';
      placeholder?: string | undefined;
      button_label: string;
      success_label?: string | undefined;
      error_label?: string | undefined;
    })
  | (Base & { type: 'offer_code_redeem_button'; label: string });

export type ContainerNode =
  | (Base & {
      type: 'stack';
      direction: 'vertical' | 'horizontal';
      spacing: number;
      padding: number;
      align: 'start' | 'center' | 'end' | 'stretch';
      children: ScreenNode[];
    })
  | (Base & { type: 'scroll'; spacing: number; padding: number; children: ScreenNode[] })
  | (Base & {
      type: 'card';
      spacing: number;
      padding: number;
      background: ColorName;
      border: boolean;
      children: ScreenNode[];
    });

export type ScreenNode = LeafNode | ContainerNode;

export interface ScreenTheme {
  colors: Record<ColorName, { light: string; dark: string }>;
  radius: number;
  font: { family: 'system' } | { family: 'custom'; regular: string; bold?: string | undefined };
}

export interface ScreenConfig {
  schemaVersion: number;
  defaultLocale: string;
  strings: Record<string, Record<string, string>>;
  theme: ScreenTheme;
  root: ScreenNode;
}

/** What a screen is filled in with: the person's values, numbers, rewards and files. */
export interface ScreenData {
  values: Record<string, string | undefined>;
  stats: Record<Stat, number>;
  rewards: { id: string; label: string; state: 'pending' | 'issued' }[];
  /** Asset id to URL. */
  assets: Record<string, string>;
  offerCode?: string | null | undefined;
}

const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Replaces {{tokens}} with their values. A token with no value becomes an empty string, so
 * a missing name gives "Hi !" at worst and never shows braces. The result is plain text.
 */
export function interpolate(text: string, values: ScreenData['values']): string {
  return text
    .replace(TOKEN, (_match, name: string) => values[name] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Whether a node is shown on a platform. Offer code redemption exists on iOS only. */
export function visibleFor(node: ScreenNode, platform: DevicePlatform): boolean {
  if (node.type === 'offer_code_redeem_button' && platform !== 'ios') return false;
  return !node.platforms || node.platforms.includes(platform);
}

/** The URL for an "asset:<id>" reference, if the server resolved one. */
export function assetUrl(
  ref: string | undefined,
  assets: ScreenData['assets'],
): string | undefined {
  return ref ? assets[ref.slice('asset:'.length)] : undefined;
}

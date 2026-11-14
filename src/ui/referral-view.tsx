import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, useColorScheme, type ViewStyle } from 'react-native';
// Only the public API: what this component does, an app can do with the same calls.
import { type Placement, ReferralPanda, type RedeemResult, usePlacement } from '../index.js';
import { optionalModules } from './optional.js';
import type { ScreenConfig, ShareChannel } from './schema.js';
import { type ScreenActions, ScreenRenderer } from './screen.js';

export interface ReferralViewProps {
  /** The placement key from the dashboard, for example "settings_referral". */
  placement: string;
  /** Follows the device unless set. */
  colorScheme?: 'light' | 'dark';
  /** Follows the device unless set. */
  locale?: string;
  /** Shown until the screen has loaded for the first time. */
  loading?: ReactNode;
  /** Shown when the placement has no published screen, or it could not be loaded. */
  fallback?: ReactNode;
  onShare?: (channel: 'system' | ShareChannel) => void;
  onCodeRedeemed?: (result: RedeemResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
}

const open = async (urls: string[]): Promise<boolean> => {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Not installed or not allowed: try the next way.
    }
  }
  return false;
};

function actionsFor(
  placement: Placement,
  /** The newest props at the time of a tap, so a changed callback is never missed. */
  latest: () => ReferralViewProps,
  refresh: () => void,
): ScreenActions {
  const fail = (error: unknown) => latest().onError?.(error as Error);
  const copy = async (text: string) => {
    const { copy: toClipboard } = optionalModules();
    if (toClipboard) await toClipboard(text);
    // No clipboard library in the app: the share sheet has "Copy" in it.
    else await ReferralPanda.share({ channel: 'copy_link', message: text });
  };

  return {
    copy: async (code) => {
      try {
        await copy(code);
        ReferralPanda.track('code_copied', { placement: placement.key });
      } catch (error) {
        fail(error);
      }
    },
    share: async ({ channel, message, link }) => {
      try {
        // The screen's message already has the plain link in it. Hand it back as a token so
        // the link that goes out carries the channel.
        const template = link ? message.replaceAll(link, '{{referral.link}}') : message;
        if (channel === 'system' || channel === 'more') {
          await ReferralPanda.share({ channel, ...(template && { message: template }) });
        } else {
          const content = await ReferralPanda.getShareContent({
            channel,
            ...(template && { message: template }),
          });
          const text = encodeURIComponent(content.message);
          if (channel === 'copy_link') {
            await copy(content.link);
          } else {
            const opened = await open(
              channel === 'whatsapp'
                ? [`whatsapp://send?text=${text}`, `https://wa.me/?text=${text}`]
                : [`sms:${Platform.OS === 'ios' ? '&' : '?'}body=${text}`],
            );
            if (!opened) {
              await ReferralPanda.share({ channel, ...(template && { message: template }) });
              latest().onShare?.(channel);
              return; // share() recorded it
            }
          }
          ReferralPanda.trackShare(channel);
        }
        latest().onShare?.(channel);
      } catch (error) {
        fail(error);
      }
    },
    redeem: async (code) => {
      try {
        const result = await ReferralPanda.redeemCode(code);
        latest().onCodeRedeemed?.(result);
        if (result.status === 'redeemed') refresh();
        return result.status === 'redeemed';
      } catch (error) {
        fail(error);
        return false;
      }
    },
    redeemOfferCode: async (code) => {
      try {
        // Apple's own sheet. The code never unlocks anything by itself.
        await ReferralPanda.presentOfferCodeRedemption();
      } catch {
        await copy(code).catch(fail);
      }
    },
  };
}

/**
 * The referral screen you designed in the dashboard, anywhere in your app. It fills the
 * space it is given. Publishing a new version in the dashboard changes it within a minute.
 */
export function ReferralView(props: ReferralViewProps) {
  const device = useColorScheme();
  const { placement, loading, error, refresh } = usePlacement(props.placement, {
    ...(props.locale && { locale: props.locale }),
  });

  // Counted once per screen version shown.
  const seen = useRef('');
  useEffect(() => {
    if (!placement) return;
    const shown = `${placement.key}:${placement.screen.id}:${placement.screen.version}`;
    if (seen.current === shown) return;
    seen.current = shown;
    ReferralPanda.track('screen_viewed', {
      placement: placement.key,
      screen_id: placement.screen.id,
      version: placement.screen.version,
    });
  }, [placement]);

  const { onError } = props;
  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const actions = useMemo(
    () =>
      placement
        ? actionsFor(
            placement,
            () => latest.current,
            () => void refresh(),
          )
        : {},
    [placement, refresh],
  );

  if (!placement) return <>{loading ? (props.loading ?? null) : (props.fallback ?? null)}</>;
  return (
    <ScreenRenderer
      config={placement.screen.config as unknown as ScreenConfig}
      strings={placement.strings}
      locale={placement.locale}
      data={{
        values: placement.values,
        stats: placement.stats,
        rewards: placement.rewards,
        assets: placement.assets,
        offerCode: placement.offerCode,
      }}
      colorScheme={props.colorScheme ?? (device === 'dark' ? 'dark' : 'light')}
      actions={actions}
      {...(props.style && { style: props.style })}
    />
  );
}

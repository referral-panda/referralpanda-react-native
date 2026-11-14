import { type ReactNode, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { ChannelIcon, Icon } from './icons.js';
import { optionalModules } from './optional.js';
import {
  type ColorName,
  type DevicePlatform,
  type ScreenConfig,
  type ScreenData,
  type ScreenNode,
  type ShareChannel,
  assetUrl,
  interpolate,
  visibleFor,
} from './schema.js';

/**
 * Renders a ReferralPanda screen with React Native components. It draws what it is given
 * and reports what the person does through `actions`. It makes no requests itself, so it
 * can be used with data from anywhere, and is checked against the shared conformance
 * fixtures (sdks/conformance) like every other renderer.
 */

export interface ScreenActions {
  copy?: (text: string) => void | Promise<void>;
  share?: (input: {
    channel: 'system' | ShareChannel;
    message: string;
    link: string;
  }) => void | Promise<void>;
  /** Resolves true if the code was accepted. */
  redeem?: (code: string) => Promise<boolean>;
  redeemOfferCode?: (code: string) => void | Promise<void>;
}

export interface ScreenRendererProps {
  /** `placement.screen.config`. */
  config: ScreenConfig;
  /** `placement.strings`: already resolved for the locale, tokens still in place. */
  strings: Record<string, string>;
  data: ScreenData;
  /** `placement.locale`. Decides right-to-left layout. */
  locale?: string;
  colorScheme?: 'light' | 'dark';
  platform?: DevicePlatform;
  actions?: ScreenActions;
  /** Called for a node type this SDK does not know (a screen newer than the SDK). */
  onUnknownNode?: (type: string) => void;
  style?: ViewStyle;
}

const RTL = /^(ar|he|fa|ur)(-|$)/;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
/** Large text stays inside its box when the person has set a very large system font. */
const MAX_SCALE = 1.6;

const TEXT_STYLES = {
  title: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.56 },
  heading: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0 },
} as const satisfies Record<string, TextStyle>;

const ASPECT = { '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3, '3:4': 3 / 4 } as const;
const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;
const CHANNEL_LABEL: Record<ShareChannel, string> = {
  messages: 'Messages',
  whatsapp: 'WhatsApp',
  copy_link: 'Copy link',
  more: 'More',
};

interface Context {
  color: (name: ColorName) => string;
  radius: number;
  t: (key: string | undefined) => string;
  data: ScreenData;
  platform: DevicePlatform;
  actions: ScreenActions;
  rtl: boolean;
  /** Family names when the screen uses an uploaded font that has loaded. */
  font: { regular?: string; bold?: string };
  reduceMotion: boolean;
  onUnknownNode?: ((type: string) => void) | undefined;
}

/** Text in the screen's font, in the reading direction. Every piece of text goes through here. */
function Words({
  ctx,
  style,
  bold,
  children,
  ...rest
}: {
  ctx: Context;
  style?: TextStyle | TextStyle[];
  bold?: boolean;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Text>, 'style'>) {
  const family = bold ? (ctx.font.bold ?? ctx.font.regular) : ctx.font.regular;
  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE}
      {...rest}
      style={[
        { writingDirection: ctx.rtl ? 'rtl' : 'ltr', textAlign: ctx.rtl ? 'right' : 'left' },
        family ? { fontFamily: family } : null,
        style,
        // An uploaded bold file already is bold: do not thicken it again.
        bold && ctx.font.bold ? { fontWeight: '400' } : null,
      ]}
    >
      {children}
    </Text>
  );
}

function Button({
  ctx,
  primary,
  label,
  action,
  onPress,
  compact,
  disabled,
}: {
  ctx: Context;
  primary: boolean;
  label: string;
  action: string;
  onPress: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={`rp-action:${action}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: compact ? 48 : 52,
        paddingVertical: compact ? 0 : 14,
        paddingHorizontal: 18,
        borderRadius: ctx.radius,
        borderWidth: primary ? 0 : 1,
        borderColor: ctx.color('border'),
        backgroundColor: primary ? ctx.color('primary') : 'transparent',
        opacity: pressed || disabled ? 0.7 : 1,
      })}
    >
      <Words
        ctx={ctx}
        bold
        style={{
          fontSize: 17,
          fontWeight: '600',
          textAlign: 'center',
          color: primary ? ctx.color('on_primary') : ctx.color('text'),
        }}
      >
        {label}
      </Words>
    </Pressable>
  );
}

function CodeBox({ node, ctx }: { node: Extract<ScreenNode, { type: 'code_box' }>; ctx: Context }) {
  const [copied, setCopied] = useState(false);
  const code = ctx.data.values['referral.code'] ?? '';
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const label = ctx.t(node.label);
  const copiedLabel = copied ? ctx.t(node.copied_label) : '';
  return (
    <Pressable
      testID="rp-action:copy"
      accessibilityRole="button"
      accessibilityLabel={[label, code.split('').join(' ')].filter(Boolean).join(', ')}
      onPress={async () => {
        if (!ctx.actions.copy) return;
        await ctx.actions.copy(code);
        setCopied(true);
        if (node.copied_label) AccessibilityInfo.announceForAccessibility(ctx.t(node.copied_label));
      }}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 6,
        paddingTop: 18,
        paddingBottom: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: ctx.color('border'),
        borderRadius: ctx.radius,
        backgroundColor: ctx.color('surface'),
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {label ? (
        <Words ctx={ctx} style={[TEXT_STYLES.caption, { color: ctx.color('muted') }]}>
          {label}
        </Words>
      ) : null}
      {code ? (
        <Text
          maxFontSizeMultiplier={1.2}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={{
            fontFamily: MONO,
            fontSize: 32,
            fontWeight: '700',
            letterSpacing: 4.5,
            color: ctx.color('text'),
          }}
        >
          {code}
        </Text>
      ) : null}
      <View style={{ minHeight: 18 }}>
        {copiedLabel ? (
          <Words ctx={ctx} style={[TEXT_STYLES.caption, { color: ctx.color('success') }]}>
            {copiedLabel}
          </Words>
        ) : null}
      </View>
    </Pressable>
  );
}

function RedeemCodeInput({
  node,
  ctx,
}: {
  node: Extract<ScreenNode, { type: 'redeem_code_input' }>;
  ctx: Context;
}) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const message =
    state === 'ok' ? ctx.t(node.success_label) : state === 'error' ? ctx.t(node.error_label) : '';
  const submit = async () => {
    const entered = code.trim();
    if (!ctx.actions.redeem || !entered || state === 'busy') return;
    setState('busy');
    const accepted = await ctx.actions.redeem(entered).catch(() => false);
    setState(accepted ? 'ok' : 'error');
    const said = ctx.t(accepted ? node.success_label : node.error_label);
    if (said) AccessibilityInfo.announceForAccessibility(said);
  };
  const buttonLabel = ctx.t(node.button_label);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          onSubmitEditing={submit}
          placeholder={ctx.t(node.placeholder)}
          placeholderTextColor={ctx.color('muted')}
          accessibilityLabel={ctx.t(node.placeholder) || buttonLabel}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          maxLength={20}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: ctx.color('border'),
            borderRadius: ctx.radius,
            backgroundColor: ctx.color('background'),
            color: ctx.color('text'),
            fontFamily: MONO,
            fontSize: 17,
            letterSpacing: 1.4,
          }}
        />
        <Button
          ctx={ctx}
          primary
          compact
          label={buttonLabel}
          action="redeem"
          disabled={state === 'busy'}
          onPress={submit}
        />
      </View>
      {message ? (
        <Words
          ctx={ctx}
          style={[TEXT_STYLES.caption, { color: ctx.color(state === 'ok' ? 'success' : 'muted') }]}
        >
          {message}
        </Words>
      ) : null}
    </View>
  );
}

function renderNode(node: ScreenNode, ctx: Context, key: number | string): ReactNode {
  if (!visibleFor(node, ctx.platform)) return null;
  const children = (items: ScreenNode[]) =>
    items.map((child, index) => renderNode(child, ctx, index));
  const link = ctx.data.values['referral.link'] ?? '';

  switch (node.type) {
    case 'stack':
      return (
        <View
          key={key}
          style={{
            flexDirection: node.direction === 'horizontal' ? 'row' : 'column',
            gap: node.spacing,
            padding: node.padding,
            alignItems: ALIGN[node.align],
            minWidth: 0,
          }}
        >
          {children(node.children)}
        </View>
      );
    case 'scroll':
      return (
        <ScrollView
          key={key}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: node.spacing, padding: node.padding }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children(node.children)}
        </ScrollView>
      );
    case 'card':
      return (
        <View
          key={key}
          style={{
            gap: node.spacing,
            padding: node.padding,
            borderRadius: ctx.radius,
            backgroundColor: ctx.color(node.background),
            borderWidth: node.border ? 1 : 0,
            borderColor: ctx.color('border'),
          }}
        >
          {children(node.children)}
        </View>
      );
    case 'spacer':
      return <View key={key} style={{ height: node.size, width: node.size, flexShrink: 0 }} />;
    case 'text': {
      const text = ctx.t(node.text);
      if (!text) return null;
      const heading = node.style === 'title' || node.style === 'heading';
      const align =
        node.align === 'center'
          ? 'center'
          : (node.align === 'start') !== ctx.rtl
            ? 'left'
            : 'right';
      return (
        <Words
          key={key}
          ctx={ctx}
          bold={heading}
          {...(heading && { accessibilityRole: 'header' as const })}
          style={[TEXT_STYLES[node.style], { color: ctx.color(node.color), textAlign: align }]}
        >
          {text}
        </Words>
      );
    }
    case 'image': {
      const url = assetUrl(node.asset, ctx.data.assets);
      const alt = ctx.t(node.alt);
      return (
        <View
          key={key}
          style={{
            width: '100%',
            aspectRatio: ASPECT[node.aspect],
            borderRadius: node.rounded ? ctx.radius : 0,
            backgroundColor: ctx.color('surface'),
            overflow: 'hidden',
          }}
        >
          {url ? (
            <Image
              source={{ uri: url }}
              resizeMode={node.fit}
              accessible={!!alt}
              {...(alt && { accessibilityLabel: alt })}
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
        </View>
      );
    }
    case 'lottie': {
      const url = assetUrl(node.asset, ctx.data.assets);
      const { LottieView } = optionalModules();
      return (
        <View
          key={key}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: '100%', aspectRatio: ASPECT[node.aspect] }}
        >
          {url && LottieView ? (
            <LottieView
              source={{ uri: url }}
              autoPlay={!ctx.reduceMotion}
              loop={node.loop}
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
        </View>
      );
    }
    case 'icon':
      return <Icon key={key} name={node.name} size={node.size} color={ctx.color(node.color)} />;
    case 'code_box':
      return <CodeBox key={key} node={node} ctx={ctx} />;
    case 'share_button':
      return (
        <Button
          key={key}
          ctx={ctx}
          primary={node.style === 'primary'}
          label={ctx.t(node.label)}
          action={`share:${node.channel}`}
          onPress={() =>
            void ctx.actions.share?.({ channel: node.channel, message: ctx.t(node.message), link })
          }
        />
      );
    case 'channel_row':
      return (
        <View key={key} style={{ flexDirection: 'row', gap: 8 }}>
          {node.channels.map((channel) => (
            <Pressable
              key={channel}
              testID={`rp-action:share:${channel}`}
              accessibilityRole="button"
              accessibilityLabel={CHANNEL_LABEL[channel]}
              onPress={() =>
                void ctx.actions.share?.({ channel, message: ctx.t(node.message), link })
              }
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                alignItems: 'center',
                gap: 6,
                paddingVertical: 12,
                paddingHorizontal: 4,
                borderWidth: 1,
                borderColor: ctx.color('border'),
                borderRadius: ctx.radius,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ChannelIcon channel={channel} size={24} color={ctx.color('primary')} />
              <Words
                ctx={ctx}
                numberOfLines={1}
                style={{ fontSize: 12, textAlign: 'center', color: ctx.color('text') }}
              >
                {CHANNEL_LABEL[channel]}
              </Words>
            </Pressable>
          ))}
        </View>
      );
    case 'progress': {
      const current = ctx.data.stats[node.metric] ?? 0;
      const top = node.milestones.at(-1)?.count ?? 1;
      const percent = Math.max(0, Math.min(100, (current / top) * 100));
      return (
        <View key={key} style={{ gap: 12 }}>
          {node.caption ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Words
                ctx={ctx}
                style={[TEXT_STYLES.caption, { color: ctx.color('muted'), flexShrink: 1 }]}
              >
                {ctx.t(node.caption)}
              </Words>
              <Words
                ctx={ctx}
                bold
                style={[
                  TEXT_STYLES.caption,
                  { color: ctx.color('text'), fontWeight: '600', fontVariant: ['tabular-nums'] },
                ]}
              >
                {`${current} / ${top}`}
              </Words>
            </View>
          ) : null}
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: top, now: Math.min(current, top) }}
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: ctx.color('border'),
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${percent}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: ctx.color('primary'),
              }}
            />
          </View>
          <View style={{ gap: 8 }}>
            {node.milestones.map((milestone) => {
              const reached = current >= milestone.count;
              return (
                <View
                  key={milestone.count}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Icon
                    name={reached ? 'check' : 'lock'}
                    size={16}
                    color={ctx.color(reached ? 'success' : 'muted')}
                  />
                  <Words
                    ctx={ctx}
                    style={[
                      TEXT_STYLES.body,
                      { color: ctx.color(reached ? 'text' : 'muted'), flex: 1, minWidth: 0 },
                    ]}
                  >
                    {ctx.t(milestone.label)}
                  </Words>
                  <Words
                    ctx={ctx}
                    style={{
                      color: ctx.color('muted'),
                      fontSize: 13,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {String(milestone.count)}
                  </Words>
                </View>
              );
            })}
          </View>
        </View>
      );
    }
    case 'reward_list': {
      const rewards = ctx.data.rewards.filter(
        (reward) => node.show === 'all' || reward.state === node.show,
      );
      const title = ctx.t(node.title);
      return (
        <View key={key} style={{ gap: 10 }}>
          {title ? (
            <Words
              ctx={ctx}
              bold
              accessibilityRole="header"
              style={[TEXT_STYLES.heading, { color: ctx.color('text') }]}
            >
              {title}
            </Words>
          ) : null}
          {rewards.length === 0 ? (
            <Words ctx={ctx} style={[TEXT_STYLES.body, { color: ctx.color('muted') }]}>
              {ctx.t(node.empty_label)}
            </Words>
          ) : (
            <View style={{ gap: 8 }}>
              {rewards.map((reward) => (
                <View
                  key={reward.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: ctx.radius,
                    backgroundColor: ctx.color('surface'),
                  }}
                >
                  <Icon
                    name={reward.state === 'issued' ? 'check' : 'clock'}
                    size={16}
                    color={ctx.color(reward.state === 'issued' ? 'success' : 'muted')}
                  />
                  <Words
                    ctx={ctx}
                    style={[TEXT_STYLES.body, { color: ctx.color('text'), flex: 1, minWidth: 0 }]}
                  >
                    {reward.label}
                  </Words>
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }
    case 'stats_row':
      return (
        <View key={key} style={{ flexDirection: 'row', gap: 8 }}>
          {node.stats.map(({ stat, label }) => (
            <View
              key={stat}
              accessible
              accessibilityLabel={`${ctx.t(label)}: ${ctx.data.stats[stat] ?? 0}`}
              style={{
                flex: 1,
                minWidth: 0,
                // Read as "label, value", shown as the value above its label.
                flexDirection: 'column-reverse',
                gap: 2,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: ctx.radius,
                backgroundColor: ctx.color('surface'),
              }}
            >
              <Words ctx={ctx} style={[TEXT_STYLES.caption, { color: ctx.color('muted') }]}>
                {ctx.t(label)}
              </Words>
              <Words
                ctx={ctx}
                bold
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: ctx.color('text'),
                  fontVariant: ['tabular-nums'],
                }}
              >
                {String(ctx.data.stats[stat] ?? 0)}
              </Words>
            </View>
          ))}
        </View>
      );
    case 'redeem_code_input':
      return <RedeemCodeInput key={key} node={node} ctx={ctx} />;
    case 'offer_code_redeem_button': {
      // Only when the person has a code to redeem.
      const offerCode = ctx.data.offerCode;
      if (!offerCode) return null;
      return (
        <Button
          key={key}
          ctx={ctx}
          primary={false}
          label={ctx.t(node.label)}
          action="redeem_offer_code"
          onPress={() => void ctx.actions.redeemOfferCode?.(offerCode)}
        />
      );
    }
    default: {
      // A screen made for a newer SDK. Skip what we do not know and keep going.
      ctx.onUnknownNode?.((node as { type: string }).type);
      return null;
    }
  }
}

/** Loads an uploaded font once and gives back the family name to use, when it is ready. */
function useFont(url: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<string | undefined>(undefined);
  useEffect(() => {
    const { loadFont } = optionalModules();
    if (!url || !loadFont) return;
    // The name is the file, so two screens with the same font load it once.
    const name = `rp-${url.replace(/[^a-zA-Z0-9]/g, '').slice(-40)}`;
    let cancelled = false;
    loadFont(name, url)
      .then(() => {
        if (!cancelled) setLoaded(name);
      })
      .catch(() => undefined); // The system font stays.
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url ? loaded : undefined;
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduce(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
  return reduce;
}

export function ScreenRenderer({
  config,
  strings,
  data,
  locale,
  colorScheme = 'light',
  platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  actions = {},
  onUnknownNode,
  style,
}: ScreenRendererProps) {
  const font = config.theme.font;
  const regular = useFont(
    font.family === 'custom' ? assetUrl(font.regular, data.assets) : undefined,
  );
  const bold = useFont(font.family === 'custom' ? assetUrl(font.bold, data.assets) : undefined);
  const reduceMotion = useReduceMotion();
  const rtl = RTL.test(locale ?? config.defaultLocale);

  const ctx: Context = {
    color: (name) => config.theme.colors[name]?.[colorScheme] ?? '#808080',
    radius: config.theme.radius,
    t: (key) => (key ? interpolate(strings[key] ?? '', data.values) : ''),
    data,
    platform,
    actions,
    rtl,
    font: { ...(regular && { regular }), ...(bold && { bold }) },
    reduceMotion,
    onUnknownNode,
  };

  return (
    <View
      style={[
        { flex: 1, backgroundColor: ctx.color('background'), direction: rtl ? 'rtl' : 'ltr' },
        style,
      ]}
    >
      {renderNode(config.root, ctx, 'root')}
    </View>
  );
}

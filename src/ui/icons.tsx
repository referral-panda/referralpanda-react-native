import type { ReactNode } from 'react';
import { Circle, Path, Rect, Svg } from 'react-native-svg';
import type { IconName, ShareChannel } from './schema.js';

/** 24 by 24. The same drawings as the web renderer, one per icon in the schema. */
const PATHS: Record<IconName, ReactNode> = {
  gift: (
    <>
      <Rect x="3" y="9" width="18" height="12" rx="2" />
      <Path d="M3 13h18M12 9v12M12 9c-2 0-4.5-.6-4.5-3A2.2 2.2 0 0 1 12 6c0-1.6 1-3 2.6-3A2.3 2.3 0 0 1 16.5 6c0 2.4-2.5 3-4.5 3Z" />
    </>
  ),
  heart: (
    <Path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />
  ),
  star: <Path d="m12 3 2.7 5.8 6.3.8-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.8L12 3Z" />,
  sparkles: (
    <Path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3ZM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z" />
  ),
  trophy: (
    <Path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5c0 3 1.2 4.5 3 4.5M16 6h3c0 3-1.2 4.5-3 4.5M12 13v4M8.5 20h7M10 17h4" />
  ),
  users: (
    <Path d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5a3 3 0 0 1 0 6M17.5 14.7c2.1.6 3.5 2.5 3.5 5.3" />
  ),
  user_plus: (
    <Path d="M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM4 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M19 8v6M16 11h6" />
  ),
  share: <Path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  link: (
    <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  copy: (
    <>
      <Rect x="9" y="9" width="11" height="11" rx="2" />
      <Path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="11" width="14" height="9" rx="2" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  cash: (
    <>
      <Rect x="3" y="6" width="18" height="12" rx="2" />
      <Circle cx="12" cy="12" r="2.5" />
      <Path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  ticket: (
    <Path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM14 6v12" />
  ),
  rocket: (
    <Path d="M12 15c-1.5-1-3-2.5-3-3 0-4 2.5-8 7-9 1 4.5-1 8-5 9.5-.3.8-.8 1.8-1.5 2.5M9 12l-3 .5L4.5 15l3 .5M12 15l-.5 3 2.5 1.5.5-3M15.5 8.5v.01" />
  ),
};

const CHANNEL_ICON: Record<ShareChannel, ReactNode> = {
  messages: (
    <Path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 3.5V17H6a2 2 0 0 1-2-2V6Z" />
  ),
  whatsapp: (
    <Path d="M12 3.5A8.5 8.5 0 0 0 4.6 16.2L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5ZM9 8.5c.2 2.5 2 4.8 4.5 5.5l1.5-1.5" />
  ),
  copy_link: PATHS.link,
  more: <Path d="M6 12v.01M12 12v.01M18 12v.01" />,
};

function Frame({ size, color, children }: { size: number; color: string; children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decoration: screen readers skip it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Svg>
  );
}

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  const drawing = PATHS[name];
  // An icon added to the schema after this SDK was built: leave its space empty.
  return drawing ? (
    <Frame size={size} color={color}>
      {drawing}
    </Frame>
  ) : null;
}

export function ChannelIcon(props: { channel: ShareChannel; size: number; color: string }) {
  return (
    <Frame size={props.size} color={props.color}>
      {CHANNEL_ICON[props.channel]}
    </Frame>
  );
}

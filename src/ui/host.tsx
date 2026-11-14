import { type ReactNode, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StatusBar, Text, View, useColorScheme } from 'react-native';
import { ReferralView, type ReferralViewProps } from './referral-view.js';

type Request = Omit<ReferralViewProps, 'style'> | null;

let request: Request = null;
const hosts = new Set<(next: Request) => void>();
const publish = (next: Request) => {
  request = next;
  for (const host of hosts) host(next);
};

/**
 * Shows the referral screen over the app. Needs <ReferralScreenHost> mounted once, near the
 * root. Returns false when no host is mounted, so the app can fall back to its own screen.
 */
export function presentReferralScreen(
  placement: string,
  options: Omit<ReferralViewProps, 'placement' | 'style'> = {},
): boolean {
  if (hosts.size === 0) return false;
  publish({ placement, ...options });
  return true;
}

export function dismissReferralScreen(): void {
  publish(null);
}

/** Mount once near the root of the app. Renders nothing until presentReferralScreen is called. */
export function ReferralScreenHost({
  children,
  closeLabel = 'Close',
}: {
  children?: ReactNode;
  /** Read by screen readers and shown on the close button. Pass your own translation. */
  closeLabel?: string;
}) {
  const [current, setCurrent] = useState<Request>(request);
  const dark = useColorScheme() === 'dark';
  useEffect(() => {
    hosts.add(setCurrent);
    return () => {
      hosts.delete(setCurrent);
    };
  }, []);

  return (
    <>
      {children}
      <Modal
        visible={current !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={dismissReferralScreen}
      >
        <View style={{ flex: 1, backgroundColor: dark ? '#0A0A0A' : '#FFFFFF' }}>
          <View
            style={{
              alignItems: 'flex-end',
              paddingHorizontal: 12,
              // Android draws the sheet under the status bar: keep Close below it.
              paddingTop: 12 + (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0),
            }}
          >
            <Pressable
              testID="rp-close"
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={12}
              onPress={dismissReferralScreen}
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: '600', color: dark ? '#FAFAFA' : '#0A0A0A' }}
              >
                {closeLabel}
              </Text>
            </Pressable>
          </View>
          {current ? <ReferralView {...current} /> : null}
        </View>
      </Modal>
    </>
  );
}

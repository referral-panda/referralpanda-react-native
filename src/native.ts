import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Platform } from './core/index.js';

interface NativeModule {
  getAppVersion?: () => string | null;
  /** Android. */
  getInstallReferrer?: () => Promise<string | null>;
  /** iOS. */
  presentOfferCodeRedemption?: () => Promise<void>;
}

/**
 * The SDK's own native module. Present in any development or store build that includes the
 * SDK. Absent in Expo Go, where the SDK works without the install referrer and the offer
 * code sheet.
 */
function nativeModule(): NativeModule | null {
  try {
    return requireOptionalNativeModule<NativeModule>('ReferralPanda');
  } catch {
    return null;
  }
}

/** What the native module adds to the platform, for the operating system it is running on. */
export function nativePlatform(os: Platform['os']): Partial<Platform> {
  const native = nativeModule();
  if (!native) return {};
  const extra: Partial<Platform> = {};
  try {
    const version = native.getAppVersion?.();
    if (version) extra.appVersion = version;
  } catch {
    // Not worth failing configure() over.
  }
  if (os === 'android' && native.getInstallReferrer) {
    extra.installReferrer = () => native.getInstallReferrer!();
  }
  if (os === 'ios' && native.presentOfferCodeRedemption) {
    extra.presentOfferCodeRedemption = () => native.presentOfferCodeRedemption!();
  }
  return extra;
}

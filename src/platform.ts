import AsyncStorageModule from '@react-native-async-storage/async-storage';
import { Platform as NativePlatform, Share } from 'react-native';
import type { Platform, Storage } from './core/index.js';

/** What React Native itself can supply. The native module adds the rest (install referrer, offer codes). */
export function reactNativePlatform(): Platform {
  const os =
    NativePlatform.OS === 'ios' || NativePlatform.OS === 'android' ? NativePlatform.OS : 'web';
  return {
    os,
    locale: () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale;
      } catch {
        return '';
      }
    },
    share: async ({ message, url }) => {
      // iOS takes the link separately and shows a preview. Android only has the message.
      const result = await Share.share(
        os === 'ios' ? { message: message.replace(url, '').trim(), url } : { message },
      );
      return result.action !== Share.dismissedAction;
    },
  };
}

/** Where the SDK keeps its state between launches, unless the app passes its own storage. */
export function defaultStorage(): Storage {
  // Bundlers differ in whether a default import is the module or its default export.
  const module = AsyncStorageModule as unknown as Storage & { default?: Storage };
  return module.default ?? module;
}

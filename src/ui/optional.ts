import { loadAsync } from 'expo-font';
import type { ComponentType } from 'react';

/**
 * Libraries the renderer uses when the app has registered them and does without when it
 * has not: a screen with an animation still renders without the animation library, minus
 * that piece. Nothing here is detected by trying to load it, because bundlers differ in
 * whether a missing library may be skipped.
 */
export interface OptionalModules {
  LottieView?: ComponentType<{
    source: { uri: string };
    autoPlay?: boolean;
    loop?: boolean;
    style?: unknown;
  }>;
  loadFont?: (name: string, uri: string) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}

let registered: OptionalModules = {
  // expo-font comes with Expo itself, so uploaded fonts work with nothing to set up.
  loadFont: (name, uri) => loadAsync({ [name]: uri }),
};

export const optionalModules = (): OptionalModules => registered;

/**
 * Adds a library the renderer may use. The integration entry points call this:
 *
 *   import '@referralpanda/react-native/lottie';          // animations
 *   import '@referralpanda/react-native/expo-clipboard';  // copy to clipboard
 *
 * An app can also pass its own, for example a different clipboard library.
 */
export function registerOptionalModules(modules: OptionalModules): void {
  registered = { ...registered, ...modules };
}

/** Replaces everything that was registered. For tests. */
export function setOptionalModules(modules: OptionalModules): void {
  registered = modules;
}

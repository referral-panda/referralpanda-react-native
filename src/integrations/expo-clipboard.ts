// import '@referralpanda/react-native/expo-clipboard';
// Lets "tap to copy" on referral screens copy straight to the clipboard. Without it, copy
// opens the share sheet. Import it once, at app start, in an app that has expo-clipboard.
import { setStringAsync } from 'expo-clipboard';
import { registerOptionalModules } from '../ui/optional.js';

registerOptionalModules({ copy: async (text) => void (await setStringAsync(text)) });

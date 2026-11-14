// import '@referralpanda/react-native/lottie';
// Lets referral screens play the animations uploaded in the dashboard. Import it once, at
// app start, in an app that has lottie-react-native installed.
import LottieView from 'lottie-react-native';
import { type OptionalModules, registerOptionalModules } from '../ui/optional.js';

registerOptionalModules({
  LottieView: LottieView as unknown as NonNullable<OptionalModules['LottieView']>,
});

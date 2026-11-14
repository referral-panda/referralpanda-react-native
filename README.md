# @referralpanda/react-native

ReferralPanda for React Native and Expo: referral codes, share links, attribution and rewards.

Beta. The public API may still change before 1.0.

## Install

```bash
npx expo install @referralpanda/react-native @react-native-async-storage/async-storage
```

The SDK is an Expo module with a small native part (Android Install Referrer, Apple's offer code sheet). It needs an Expo development build or a store build. It does not run in Expo Go, and apps without Expo are not supported yet.

Add the config plugin so share links open your app. `linkHandle` is your project's link handle from the dashboard, under Apps:

```json
{
  "expo": {
    "plugins": [["@referralpanda/react-native", { "linkHandle": "your-link-handle" }]]
  }
}
```

## Set up

```ts
import { ReferralPanda } from '@referralpanda/react-native';

// Once, at app start. Use a public key (rp_pub_…). Never a secret key.
ReferralPanda.configure({ apiKey: 'rp_pub_live_…' });

// When the user signs in, and at each app start while they are signed in.
await ReferralPanda.logIn(user.id);
```

If you use RevenueCat and its app user id differs from yours, pass it so purchases match the right user:

```ts
await ReferralPanda.logIn(user.id, { revenueCatAppUserId: customerInfo.originalAppUserId });
```

## Build your own referral UI

Everything is a plain call that returns data. No ReferralPanda screen is needed.

```tsx
import { ReferralPanda, useReferral } from '@referralpanda/react-native';

function InviteScreen() {
  const { referral, loading } = useReferral();
  if (loading || !referral) return null;
  return (
    <>
      <Text>Your code: {referral.code}</Text>
      <Text>{referral.stats.total} friends invited</Text>
      <Button title="Invite a friend" onPress={() => ReferralPanda.share({ message: 'Join me' })} />
      {referral.rewards.map((reward) => (
        <Text key={reward.id}>
          {reward.label}: {reward.state}
        </Text>
      ))}
    </>
  );
}
```

| Call                                      | What it does                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getReferral()` / `useReferral()`         | The user's code, link, counts, rewards, program and who invited them                            |
| `getShareContent({ channel, message })`   | The link and a message, for your own share flow                                                 |
| `share({ channel, message })`             | Opens the system share sheet and records the share                                              |
| `trackShare(channel)`                     | Records a share your app handled itself                                                         |
| `redeemCode(code)`                        | For a code the user types in                                                                    |
| `getRewards()` / `getOfferCode()`         | Rewards, and the offer code to redeem in the store                                              |
| `getPlacement(key)` / `usePlacement(key)` | The screen you designed in the dashboard, as data                                               |
| `getScreenPreview(token)`                 | A draft from the dashboard, from a Preview on device code. Needs no API key                     |
| `track(event, properties)`                | Records an event. `signed_up` moves a referral forward                                          |
| `addListener(event, fn)`                  | `rewardEarned`, `rewardUpdated`, `referralStatusChanged`, `referralChanged`, `placementUpdated` |
| `handleURL(url)`                          | Tells the SDK about a link the app was opened with. Automatic by default                        |

## Or use the screen you designed

Design the screen in the dashboard, then show it. Publishing a new version changes it in the app within a minute, with no release.

```bash
npx expo install react-native-svg
```

```tsx
import { ReferralView, ReferralScreenHost, presentReferralScreen } from '@referralpanda/react-native/ui';

// Inline, anywhere:
<ReferralView placement="settings_referral" />

// Or over the app. Mount the host once near the root:
<ReferralScreenHost>
  <App />
</ReferralScreenHost>;
presentReferralScreen('settings_referral');
```

Two parts are opt-in, one import line each, in an app that has the library installed:

```ts
import '@referralpanda/react-native/lottie'; // animations, needs lottie-react-native
import '@referralpanda/react-native/expo-clipboard'; // tap to copy, needs expo-clipboard
```

Without them the screen still works: an animation leaves its space empty, and copy opens the share sheet. Uploaded fonts need nothing: `expo-font` comes with Expo. To use a different clipboard or animation library, call `registerOptionalModules` from `@referralpanda/react-native/ui`.

Apps that never import `/ui` do not bundle the renderer.

The screen components use only the public calls in the table above. Anything they do, your own UI can do.

## Links

The SDK listens for links the app is opened with. A share link opened before the user signs up is kept and sent when they do, so the friend is matched without typing a code. If your app routes links itself, pass `handleLinks: false` to `configure` and call `ReferralPanda.handleURL(url)` where you handle them. It returns `true` for a share link.

## Offline

Screens and the referral summary are saved on the device and returned, marked `stale`, when the device is offline. Events are queued and sent later. Every write carries an idempotency key, so a retry is never counted twice.

## Errors

Calls reject with a `ReferralPandaError`. `error.code` says why (`not_logged_in`, `network_error`, `rate_limited`, …) and `error.requestId` identifies the request when you contact support.

## Privacy

The SDK sends the user id you give it, the attributes you set, the events you track, the platform and the link the app was opened with. It does not read the clipboard, collect advertising ids or fingerprint the device. Turn on `debug` to log one line per request: method, path, status and request id, never keys or contents.

## License

MIT. See [LICENSE](./LICENSE).

## About this repository

This is the source of the SDK as published to npm. It is developed in ReferralPanda's main
repository, where its tests run against the same fixtures as our other SDKs, and copied here
on every release. Issues are welcome here. For a change, open an issue first: a pull request
made here cannot be merged directly, because the next release would overwrite it.

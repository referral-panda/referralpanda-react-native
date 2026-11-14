/**
 * Expo config plugin for @referralpanda/react-native.
 *
 *   ["@referralpanda/react-native", { "linkHandle": "toffee" }]
 *
 * Makes share links open the app: adds the associated domain on iOS and a verified
 * intent filter on Android. `linkHandle` is your project's link handle from the dashboard
 * (the first part of the path in go.referralpanda.com/<handle>/<code>). `linkDomain` is
 * only for a custom link domain.
 *
 * It changes the app config only. Nothing here runs in the app.
 */
const DEFAULT_DOMAIN = 'go.referralpanda.com';
const HANDLE = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function withReferralPanda(config, options = {}) {
  const domain = String(options.linkDomain ?? DEFAULT_DOMAIN).toLowerCase();
  const handle = options.linkHandle === undefined ? undefined : String(options.linkHandle);
  if (!DOMAIN.test(domain)) {
    throw new Error(`@referralpanda/react-native: linkDomain "${domain}" is not a domain name.`);
  }
  if (handle !== undefined && !HANDLE.test(handle)) {
    throw new Error(
      `@referralpanda/react-native: linkHandle "${handle}" is not a link handle. Copy it from the dashboard, under Apps.`,
    );
  }
  if (domain === DEFAULT_DOMAIN && handle === undefined) {
    throw new Error(
      "@referralpanda/react-native: set linkHandle to your project's link handle (dashboard, under Apps), so only your links open your app.",
    );
  }

  // iOS: universal links. Which paths open the app is decided by the association file
  // the link domain serves for this app, so the domain is all that is needed here.
  const applinks = `applinks:${domain}`;
  const associated = config.ios?.associatedDomains ?? [];
  config.ios = {
    ...config.ios,
    associatedDomains: associated.includes(applinks) ? associated : [...associated, applinks],
  };

  // Android: a verified app link, limited to this project's paths on a shared domain.
  const data = { scheme: 'https', host: domain, ...(handle && { pathPrefix: `/${handle}/` }) };
  const filters = config.android?.intentFilters ?? [];
  const exists = filters.some((filter) =>
    [filter.data]
      .flat()
      .some(
        (entry) =>
          entry?.scheme === 'https' &&
          entry.host === domain &&
          entry.pathPrefix === data.pathPrefix,
      ),
  );
  config.android = {
    ...config.android,
    intentFilters: exists
      ? filters
      : [
          ...filters,
          { action: 'VIEW', autoVerify: true, data: [data], category: ['BROWSABLE', 'DEFAULT'] },
        ],
  };
  return config;
}

// An ES module, like the rest of the package. Expo loads it with require(), which every
// Node version Expo supports can do for ES modules.
export default withReferralPanda;

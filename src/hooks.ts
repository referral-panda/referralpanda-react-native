import { useCallback, useEffect, useState } from 'react';
import type { Placement, Referral, ReferralPandaError } from './core/index.js';
import { current, isConfigured, onConfigured } from './singleton.js';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: ReferralPandaError | Error | null;
}

function useConfigured(): boolean {
  const [configured, setConfigured] = useState(isConfigured);
  useEffect(() => {
    if (isConfigured()) setConfigured(true);
    return onConfigured(() => setConfigured(true));
  }, []);
  return configured;
}

/**
 * The signed-in user's referral: code, link, counts and rewards. Updates when it changes.
 * `error.code` is 'not_logged_in' until logIn has been called.
 */
export function useReferral(): {
  referral: Referral | null;
  loading: boolean;
  error: ReferralPandaError | Error | null;
  refresh: () => Promise<void>;
} {
  const configured = useConfigured();
  const [state, setState] = useState<State<Referral>>({ data: null, loading: true, error: null });

  const load = useCallback(
    async (refresh: boolean) => {
      if (!configured) return;
      try {
        const data = await current().getReferral({ refresh });
        setState({ data, loading: false, error: null });
      } catch (error) {
        setState((previous) => ({ data: previous.data, loading: false, error: error as Error }));
      }
    },
    [configured],
  );

  useEffect(() => {
    if (!configured) return;
    void load(false);
    const stop = [
      current().addListener('referralChanged', (data) =>
        setState({ data, loading: false, error: null }),
      ),
      current().addListener('userChanged', ({ appUserId }) => {
        setState({ data: null, loading: appUserId !== null, error: null });
        void load(false);
      }),
    ];
    return () => stop.forEach((remove) => remove());
  }, [configured, load]);

  return {
    referral: state.data,
    loading: state.loading,
    error: state.error,
    refresh: useCallback(() => load(true), [load]),
  };
}

/** The published screen for a placement. Updates when a newer version is published. */
export function usePlacement(
  key: string,
  options: { locale?: string } = {},
): {
  placement: Placement | null;
  loading: boolean;
  error: ReferralPandaError | Error | null;
  refresh: () => Promise<void>;
} {
  const configured = useConfigured();
  const { locale } = options;
  const [state, setState] = useState<State<Placement>>({ data: null, loading: true, error: null });

  const load = useCallback(
    async (refresh: boolean) => {
      if (!configured) return;
      try {
        const data = await current().getPlacement(key, { ...(locale && { locale }), refresh });
        setState({ data, loading: false, error: null });
      } catch (error) {
        setState((previous) => ({ data: previous.data, loading: false, error: error as Error }));
      }
    },
    [configured, key, locale],
  );

  useEffect(() => {
    if (!configured) return;
    void load(false);
    const stop = [
      current().addListener('placementUpdated', (data) => {
        if (data.key === key) setState({ data, loading: false, error: null });
      }),
      // The same screen, now with this person's code and numbers (or without them).
      current().addListener('userChanged', () => void load(false)),
    ];
    return () => stop.forEach((remove) => remove());
  }, [configured, key, load]);

  return {
    placement: state.data,
    loading: state.loading,
    error: state.error,
    refresh: useCallback(() => load(true), [load]),
  };
}

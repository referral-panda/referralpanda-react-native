/** Why a call failed. API codes are passed through; the rest are raised by the SDK itself. */
export type ReferralPandaErrorCode =
  | 'not_configured'
  | 'not_logged_in'
  | 'network_error'
  | 'timeout'
  | 'invalid_argument'
  | 'unavailable'
  // From the API.
  | 'invalid_api_key'
  | 'api_key_revoked'
  | 'invalid_request'
  | 'not_found'
  | 'customer_not_found'
  | 'code_not_found'
  | 'self_referral'
  | 'rate_limited'
  | 'internal_error'
  | (string & {});

export class ReferralPandaError extends Error {
  override readonly name = 'ReferralPandaError';
  constructor(
    readonly code: ReferralPandaErrorCode,
    message: string,
    /** HTTP status, when the API answered. */
    readonly status?: number,
    /** Quote this to support. It identifies the request in our logs. */
    readonly requestId?: string,
  ) {
    super(message);
  }
}

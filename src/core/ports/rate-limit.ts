import type {
  OtpSecretGenerator,
  OtpSecretGeneratorInput,
  RateLimitAction as RateLimitActionContract,
  RateLimitAttempt,
  RateLimitDecision,
  RateLimitedErrorDetails,
  RateLimiter,
} from '../../contracts/index.js'

export const RateLimitAction = {
  ProviderSignIn: 'provider:sign-in',
  OtpStart: 'otp:start',
  OtpFinish: 'otp:finish',
  OtpResend: 'otp:resend',
  MagicLinkStart: 'magic-link:start',
  MagicLinkFinish: 'magic-link:finish',
  MagicLinkResend: 'magic-link:resend',
  PasswordSignIn: 'password:sign-in',
  PasswordRecoveryStart: 'password-recovery:start',
  PasswordRecoveryFinish: 'password-recovery:finish',
  PasswordRecoveryResend: 'password-recovery:resend',
} as const

export type RateLimitAction = RateLimitActionContract
const RateLimitActions = new Set<string>(Object.values(RateLimitAction))
export type {
  OtpSecretGenerator,
  OtpSecretGeneratorInput,
  RateLimitAttempt,
  RateLimitDecision,
  RateLimitedErrorDetails,
  RateLimiter,
}

export function rateLimitKey(...parts: readonly string[]): string {
  if (parts.some((part) => typeof part !== 'string')) {
    throw new Error('Rate-limit key parts must be strings.')
  }

  return JSON.stringify(parts)
}

export function isRateLimitedErrorDetails(input: unknown): input is RateLimitedErrorDetails {
  if (!(input && typeof input === 'object')) {
    return false
  }

  const { action, retryAfterSeconds, resetAt } = input as Partial<RateLimitedErrorDetails>

  if (typeof action !== 'string' || !RateLimitActions.has(action)) {
    return false
  }

  if (
    retryAfterSeconds !== undefined &&
    (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0)
  ) {
    return false
  }

  if (resetAt !== undefined && typeof resetAt !== 'string') {
    return false
  }

  if (typeof resetAt === 'string' && Number.isNaN(new Date(resetAt).getTime())) {
    return false
  }

  return true
}

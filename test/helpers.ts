import {
  AuthIdentityStatus,
  asIdentityId,
  asUserId,
  createAuthNormalizer,
  invalidInput,
  normalizeEmail,
  rateLimitKey,
  type AuthNormalizer,
  type AuthResult,
  type AuthIdentity,
  type CurrentAccountRecentAuthMarker,
  type DefaultAuthService,
  type ProviderIdentityAssertion,
  type User,
} from '@alyldas/uniauth-core'
import type { AuthServiceRuntime } from '../src/core/application/runtime.js'
import { issueCurrentAccountRecentAuthMarker } from '../src/core/application/support.js'

export const now = new Date('2026-01-01T00:00:00.000Z')

const strictEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const strictE164Pattern = /^\+[1-9]\d{7,14}$/u

export function assertion(
  input: Partial<ProviderIdentityAssertion> = {},
): ProviderIdentityAssertion {
  return {
    provider: input.provider ?? 'email',
    providerUserId: input.providerUserId ?? 'alice',
    ...(input.email ? { email: input.email } : {}),
    ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.phoneVerified !== undefined ? { phoneVerified: input.phoneVerified } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.trust ? { trust: input.trust } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

export { rateLimitKey }

export function createStrictNormalizer(): AuthNormalizer {
  return createAuthNormalizer({
    normalizeEmail(email) {
      const normalized = normalizeEmail(email)

      if (!normalized || !strictEmailPattern.test(normalized)) {
        throw invalidInput('Email is invalid.')
      }

      return normalized
    },
    normalizePhone(phone) {
      const trimmed = phone.trim()
      const digits = trimmed.replace(/\D+/g, '')
      const normalized = trimmed.startsWith('+')
        ? `+${digits}`
        : digits.length === 10
          ? `+1${digits}`
          : digits.length === 11 && digits.startsWith('1')
            ? `+${digits}`
            : ''

      if (!strictE164Pattern.test(normalized)) {
        throw invalidInput('Phone is invalid.')
      }

      return normalized
    },
  })
}

export function user(id = 'user-1'): User {
  return {
    id: asUserId(id),
    createdAt: now,
    updatedAt: now,
  }
}

export async function issueRecentAuthMarker(
  service: DefaultAuthService,
  signedIn: Pick<AuthResult, 'session' | 'user'>,
  reAuthenticatedAt: Date,
): Promise<CurrentAccountRecentAuthMarker> {
  const runtime = (service as unknown as { readonly runtime: AuthServiceRuntime }).runtime

  return issueCurrentAccountRecentAuthMarker(runtime, {
    currentSessionId: signedIn.session.id,
    userId: signedIn.user.id,
    reAuthenticatedAt,
  })
}

export function identity(input: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: input.id ?? asIdentityId('identity-1'),
    userId: input.userId ?? asUserId('user-1'),
    provider: input.provider ?? 'email',
    providerUserId: input.providerUserId ?? 'alice',
    status: input.status ?? AuthIdentityStatus.Active,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    ...(input.email ? { email: input.email } : {}),
    ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.phoneVerified !== undefined ? { phoneVerified: input.phoneVerified } : {}),
    ...(input.trust ? { trust: input.trust } : {}),
    ...(input.disabledAt ? { disabledAt: input.disabledAt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

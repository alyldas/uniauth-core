import { describe, expect, it } from 'vitest'
import {
  AuditEventType,
  OtpChannel,
  RateLimitAction,
  UniAuthErrorCode,
  VerificationPurpose,
  VerificationStatus,
  isRateLimitedErrorDetails,
  DefaultAuthService,
} from '@alyldas/uniauth-core'
import { createAuthServiceRuntime } from '../../src/core/application/runtime-defaults.js'
import {
  InMemoryAuthStore,
  InMemoryRateLimiter,
  createInMemoryAuthKit,
} from '@alyldas/uniauth-core/testing'
import { assertion, now, rateLimitKey } from './helpers.js'

describe('rate-limit integration', () => {
  it('requires a rate limiter in production defaults and keeps explicit opt-out available', async () => {
    const store = new InMemoryAuthStore()
    const originalNodeEnv = process.env.NODE_ENV

    try {
      delete process.env.NODE_ENV

      expect(createAuthServiceRuntime({ repos: store }).requireRateLimiter).toBe(false)

      process.env.NODE_ENV = 'production'

      expect(() => createAuthServiceRuntime({ repos: store })).toThrow(
        'Rate limiter is required by auth service options.',
      )
      expect(
        createAuthServiceRuntime({ repos: store, requireRateLimiter: false }).rateLimiter,
      ).toBe(undefined)
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }

    const optOutService = new DefaultAuthService({ repos: store, requireRateLimiter: false })
    const signedIn = await optOutService.signIn({ assertion: assertion(), now })

    expect(signedIn.user.id).toBeTruthy()
  })

  it('uses a non-zero verification resend cooldown default with explicit zero opt-out', () => {
    const store = new InMemoryAuthStore()
    const rateLimiter = new InMemoryRateLimiter()
    const originalNodeEnv = process.env.NODE_ENV

    try {
      process.env.NODE_ENV = 'production'

      expect(
        createAuthServiceRuntime({ repos: store, rateLimiter }).verificationResendCooldownSeconds,
      ).toBe(60)
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }

    expect(
      createAuthServiceRuntime({
        repos: store,
        rateLimiter,
        verificationResendCooldownSeconds: 0,
      }).verificationResendCooldownSeconds,
    ).toBe(0)
    expect(() =>
      createAuthServiceRuntime({
        repos: store,
        rateLimiter,
        verificationResendCooldownSeconds: 1.5,
      }),
    ).toThrow('Verification resend cooldown must be a non-negative integer.')
  })

  it('builds unambiguous keys for arbitrary rate-limit parts', () => {
    expect(rateLimitKey('a', 'b\u0000c')).not.toBe(rateLimitKey('a\u0000b', 'c'))
    expect(() => rateLimitKey('a', 1 as unknown as string)).toThrow(
      'Rate-limit key parts must be strings.',
    )
  })

  it('recognizes only supported rate-limit error detail actions', () => {
    expect(isRateLimitedErrorDetails({ action: RateLimitAction.OtpStart })).toBe(true)
    expect(
      isRateLimitedErrorDetails({
        action: RateLimitAction.PasswordSignIn,
        retryAfterSeconds: 10,
        resetAt: now.toISOString(),
      }),
    ).toBe(true)
    expect(isRateLimitedErrorDetails({ action: 'custom:action' })).toBe(false)
    expect(isRateLimitedErrorDetails({ action: ` ${RateLimitAction.OtpStart} ` })).toBe(false)
  })

  it('denies provider sign-in before creating a user, identity, or session', async () => {
    const rateLimiter = new InMemoryRateLimiter()
    rateLimiter.setDecision(
      {
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      },
      { allowed: false, retryAfterSeconds: 30 },
    )
    const { service, store } = createInMemoryAuthKit({ rateLimiter })

    const error = await service
      .signIn({ assertion: assertion({ email: 'Alice@Example.com', emailVerified: true }), now })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: UniAuthErrorCode.RateLimited,
      message: 'Too many auth attempts.',
      details: {
        action: RateLimitAction.ProviderSignIn,
        retryAfterSeconds: 30,
      },
    })
    expect(store.listUsers()).toHaveLength(0)
    expect(store.listIdentities()).toHaveLength(0)
    expect(store.listSessions()).toHaveLength(0)
    expect(store.listAuditEvents()).toEqual([
      expect.objectContaining({
        type: AuditEventType.RateLimited,
        metadata: {
          action: RateLimitAction.ProviderSignIn,
          retryAfterSeconds: 30,
        },
      }),
    ])
    expect(rateLimiter.listAttempts()).toEqual([
      expect.objectContaining({
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      }),
    ])
  })

  it('denies OTP start before creating a verification or sending a message', async () => {
    const rateLimiter = new InMemoryRateLimiter()
    rateLimiter.setDecision(
      {
        action: RateLimitAction.OtpStart,
        key: rateLimitKey(OtpChannel.Email, 'alice@example.com'),
      },
      { allowed: false, resetAt: now },
    )
    const { service, store, emailSender } = createInMemoryAuthKit({ rateLimiter })

    const error = await service
      .startOtpChallenge({
        purpose: VerificationPurpose.SignIn,
        channel: OtpChannel.Email,
        target: ' Alice@Example.com ',
        secret: '123456',
        now,
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: UniAuthErrorCode.RateLimited,
      message: 'Too many auth attempts.',
      details: {
        action: RateLimitAction.OtpStart,
        resetAt: now.toISOString(),
      },
    })
    expect(store.listVerifications()).toHaveLength(0)
    expect(emailSender.listMessages()).toHaveLength(0)
    expect(store.listAuditEvents()).toEqual([
      expect.objectContaining({
        type: AuditEventType.RateLimited,
        metadata: {
          action: RateLimitAction.OtpStart,
          resetAt: now.toISOString(),
        },
      }),
    ])
  })

  it('denies OTP finish before consuming a verification or creating a session', async () => {
    const rateLimiter = new InMemoryRateLimiter()
    const { service, store } = createInMemoryAuthKit({ rateLimiter })
    const started = await service.startOtpChallenge({
      purpose: VerificationPurpose.SignIn,
      channel: OtpChannel.Email,
      target: 'alice@example.com',
      secret: '123456',
      now,
    })
    rateLimiter.setDecision(
      {
        action: RateLimitAction.OtpFinish,
        key: rateLimitKey(OtpChannel.Email, started.verificationId),
      },
      { allowed: false, retryAfterSeconds: 15 },
    )

    const error = await service
      .finishOtpSignIn({
        verificationId: started.verificationId,
        secret: '123456',
        channel: OtpChannel.Email,
        now,
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: UniAuthErrorCode.RateLimited,
      details: {
        action: RateLimitAction.OtpFinish,
        retryAfterSeconds: 15,
      },
    })
    expect(store.listVerifications()).toEqual([
      expect.objectContaining({
        id: started.verificationId,
        status: VerificationStatus.Pending,
      }),
    ])
    expect(store.listSessions()).toHaveLength(0)
    expect(rateLimiter.listAttempts()).toEqual([
      expect.objectContaining({
        action: RateLimitAction.OtpStart,
        key: rateLimitKey(OtpChannel.Email, 'alice@example.com'),
      }),
      expect.objectContaining({
        action: RateLimitAction.OtpFinish,
        key: rateLimitKey(OtpChannel.Email, started.verificationId),
      }),
    ])
  })

  it('rejects malformed rate-limit decisions before writing audit metadata', async () => {
    const invalidRetryAfterLimiter = new InMemoryRateLimiter()
    invalidRetryAfterLimiter.setDecision(
      {
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      },
      { allowed: false, retryAfterSeconds: -1 },
    )
    const invalidRetryAfterKit = createInMemoryAuthKit({
      rateLimiter: invalidRetryAfterLimiter,
    })

    await expect(
      invalidRetryAfterKit.service.signIn({
        assertion: assertion({ email: 'invalid-retry@example.com', emailVerified: true }),
        now,
      }),
    ).rejects.toMatchObject({
      code: UniAuthErrorCode.InvalidInput,
      message: 'Rate-limit retryAfterSeconds must be a non-negative number.',
    })
    expect(invalidRetryAfterKit.store.listAuditEvents()).toHaveLength(0)

    const invalidResetAtLimiter = new InMemoryRateLimiter()
    invalidResetAtLimiter.setDecision(
      {
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      },
      { allowed: false, resetAt: new Date('invalid') },
    )
    const invalidResetAtKit = createInMemoryAuthKit({ rateLimiter: invalidResetAtLimiter })

    await expect(
      invalidResetAtKit.service.signIn({
        assertion: assertion({ email: 'invalid-reset-at@example.com', emailVerified: true }),
        now,
      }),
    ).rejects.toMatchObject({
      code: UniAuthErrorCode.InvalidInput,
      message: 'Rate-limit resetAt must be a valid date.',
    })
    expect(invalidResetAtKit.store.listAuditEvents()).toHaveLength(0)

    const nonDateResetAtLimiter = new InMemoryRateLimiter()
    nonDateResetAtLimiter.setDecision(
      {
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      },
      { allowed: false, resetAt: 'not-a-date' as unknown as Date },
    )
    const nonDateResetAtKit = createInMemoryAuthKit({ rateLimiter: nonDateResetAtLimiter })

    await expect(
      nonDateResetAtKit.service.signIn({
        assertion: assertion({ email: 'non-date-reset-at@example.com', emailVerified: true }),
        now,
      }),
    ).rejects.toMatchObject({
      code: UniAuthErrorCode.InvalidInput,
      message: 'Rate-limit resetAt must be a valid date.',
    })
    expect(nonDateResetAtKit.store.listAuditEvents()).toHaveLength(0)

    const invalidAuditTimeLimiter = new InMemoryRateLimiter()
    invalidAuditTimeLimiter.setDecision(
      {
        action: RateLimitAction.ProviderSignIn,
        key: rateLimitKey('email', 'alice'),
      },
      { allowed: false, retryAfterSeconds: 1 },
    )
    const invalidAuditTimeKit = createInMemoryAuthKit({ rateLimiter: invalidAuditTimeLimiter })

    await expect(
      invalidAuditTimeKit.service.signIn({
        assertion: assertion({ email: 'invalid-audit-time@example.com', emailVerified: true }),
        now: 'not-a-date',
      } as unknown as Parameters<typeof invalidAuditTimeKit.service.signIn>[0]),
    ).rejects.toMatchObject({
      code: UniAuthErrorCode.InvalidInput,
      message: 'Audit event time is invalid.',
    })
    expect(invalidAuditTimeKit.store.listAuditEvents()).toHaveLength(0)
  })
})

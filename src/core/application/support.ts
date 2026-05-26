import type { AuthPolicyAction } from './policy.js'
import { optionalProp } from './optional.js'
import type { AuthServiceRuntime } from './runtime.js'
import type {
  AuditEvent,
  AuthIdentity,
  CurrentAccountRecentAuthMarker,
  IdentityId,
  Session,
  SessionId,
  User,
  UserId,
} from '../domain/types.js'
import { AuditEventType, isActiveIdentity, isActiveUser } from '../domain/types.js'
import { UniAuthError, UniAuthErrorCode, invalidInput, rateLimited } from '../errors/index.js'
import type { RateLimitAttempt, RateLimitDecision } from '../../contracts/index.js'
import { assertValidDate } from '../utils/time.js'
import { generateSecret, hashOpaqueSecret, verifyOpaqueSecret } from '../utils/secrets.js'

const PolicyDenialReason = {
  ReAuthRequired: 're-auth-required',
} as const
const CURRENT_ACCOUNT_RECENT_AUTH_METADATA_KEY = 'currentAccountRecentAuth'
const CURRENT_ACCOUNT_RECENT_AUTH_MARKER_VERSION = 1
const MAX_CURRENT_ACCOUNT_RECENT_AUTH_MARKERS = 10

interface StoredCurrentAccountRecentAuthMarker {
  readonly version: typeof CURRENT_ACCOUNT_RECENT_AUTH_MARKER_VERSION
  readonly markerHash: string
  readonly userId: string
  readonly reAuthenticatedAt: Date
}

export async function getActiveUser(runtime: AuthServiceRuntime, userId: UserId): Promise<User> {
  const user = await runtime.repos.userRepo.findById(userId)

  if (!user || !isActiveUser(user)) {
    throw new UniAuthError(UniAuthErrorCode.UserNotFound, 'User was not found.')
  }

  return user
}

export async function getActiveIdentity(
  runtime: AuthServiceRuntime,
  identityId: IdentityId,
): Promise<AuthIdentity> {
  const identity = await runtime.repos.identityRepo.findById(identityId)

  if (!identity || !isActiveIdentity(identity)) {
    throw new UniAuthError(UniAuthErrorCode.IdentityNotFound, 'Identity was not found.')
  }

  return identity
}

export async function ensureReAuth(
  runtime: AuthServiceRuntime,
  action: AuthPolicyAction,
  userId: UserId,
  reAuthenticatedAt: Date | CurrentAccountRecentAuthMarker | undefined,
  now: Date,
  options: {
    readonly currentSessionId?: SessionId
  } = {},
): Promise<Date | undefined> {
  assertValidDate(now, 'Request time is invalid.')

  const reAuthenticatedAtDate =
    reAuthenticatedAt === undefined
      ? undefined
      : await resolveReAuthenticatedAt(runtime, reAuthenticatedAt, now, {
          userId,
          ...options,
        })

  const required = await runtime.policy.requiresReAuth({
    action,
    userId,
    reAuthenticatedAt: reAuthenticatedAtDate,
    now,
  })

  if (required) {
    await audit(runtime, AuditEventType.PolicyDenied, now, {
      userId,
      metadata: { reason: PolicyDenialReason.ReAuthRequired, action },
    })
    throw new UniAuthError(UniAuthErrorCode.ReAuthRequired, 'Recent authentication is required.')
  }

  return reAuthenticatedAtDate
}

export async function issueCurrentAccountRecentAuthMarker(
  runtime: AuthServiceRuntime,
  input: {
    readonly currentSessionId: SessionId
    readonly userId: UserId
    readonly reAuthenticatedAt: Date
  },
): Promise<CurrentAccountRecentAuthMarker> {
  validateReAuthenticatedAtDate(input.reAuthenticatedAt, input.reAuthenticatedAt)

  const session = await runtime.repos.sessionRepo.findById(input.currentSessionId)

  if (!session || session.userId !== input.userId) {
    throw invalidInput('Current-account re-authentication marker is invalid.')
  }

  const markerId = generateSecret()
  const existingMarkers = readCurrentAccountRecentAuthMetadataEntries(session).map((marker) => ({
    version: marker.version,
    markerHash: marker.markerHash,
    userId: marker.userId,
    reAuthenticatedAt: marker.reAuthenticatedAt.toISOString(),
  }))
  const metadata = {
    ...(session.metadata ?? {}),
    [CURRENT_ACCOUNT_RECENT_AUTH_METADATA_KEY]: {
      markers: [
        {
          version: CURRENT_ACCOUNT_RECENT_AUTH_MARKER_VERSION,
          markerHash: await hashOpaqueSecret(markerId),
          userId: input.userId,
          reAuthenticatedAt: input.reAuthenticatedAt.toISOString(),
        },
        ...existingMarkers,
      ].slice(0, MAX_CURRENT_ACCOUNT_RECENT_AUTH_MARKERS),
    },
  }

  await runtime.repos.sessionRepo.update(session.id, { metadata })

  return {
    currentSessionId: input.currentSessionId,
    userId: input.userId,
    reAuthenticatedAt: input.reAuthenticatedAt,
    markerId,
  }
}

export async function resolveReAuthenticatedAt(
  runtime: AuthServiceRuntime,
  reAuthenticatedAt: Date | CurrentAccountRecentAuthMarker | undefined,
  now: Date,
  options: {
    readonly userId?: UserId
    readonly currentSessionId?: SessionId
  } = {},
): Promise<Date | undefined> {
  if (reAuthenticatedAt === undefined) {
    return undefined
  }

  if (reAuthenticatedAt instanceof Date) {
    if (options.currentSessionId !== undefined) {
      throw invalidInput('Current-account re-authentication marker is required.')
    }

    validateReAuthenticatedAtDate(reAuthenticatedAt, now)
    return reAuthenticatedAt
  }

  if (!isCurrentAccountRecentAuthMarker(reAuthenticatedAt)) {
    throw invalidInput('Re-authentication time is invalid.')
  }

  validateReAuthenticatedAtDate(reAuthenticatedAt.reAuthenticatedAt, now)

  if (options.userId !== undefined && reAuthenticatedAt.userId !== options.userId) {
    throw invalidInput('Re-authentication marker does not belong to the current user.')
  }

  if (
    options.currentSessionId !== undefined &&
    reAuthenticatedAt.currentSessionId !== options.currentSessionId
  ) {
    throw invalidInput('Re-authentication marker does not belong to the current session.')
  }

  if (options.currentSessionId !== undefined) {
    return resolveStoredCurrentAccountRecentAuthMarker(runtime, reAuthenticatedAt, now)
  }

  return reAuthenticatedAt.reAuthenticatedAt
}

async function resolveStoredCurrentAccountRecentAuthMarker(
  runtime: AuthServiceRuntime,
  marker: CurrentAccountRecentAuthMarker,
  now: Date,
): Promise<Date> {
  const session = await runtime.repos.sessionRepo.findById(marker.currentSessionId)
  let stored: StoredCurrentAccountRecentAuthMarker | undefined

  for (const candidate of readCurrentAccountRecentAuthMetadataEntries(session)) {
    if (
      candidate.userId === marker.userId &&
      candidate.reAuthenticatedAt.getTime() === marker.reAuthenticatedAt.getTime() &&
      (await verifyOpaqueSecret(marker.markerId, candidate.markerHash))
    ) {
      stored = candidate
      break
    }
  }

  if (!stored) {
    throw invalidInput('Current-account re-authentication marker is invalid.')
  }

  validateReAuthenticatedAtDate(stored.reAuthenticatedAt, now)
  return stored.reAuthenticatedAt
}

function readCurrentAccountRecentAuthMetadataEntries(
  session: Session | undefined,
): readonly StoredCurrentAccountRecentAuthMarker[] {
  const raw = session?.metadata?.[CURRENT_ACCOUNT_RECENT_AUTH_METADATA_KEY]

  if (!isRecord(raw)) {
    return []
  }

  if (Array.isArray(raw.markers)) {
    return raw.markers
      .map(readCurrentAccountRecentAuthMetadataEntry)
      .filter((marker): marker is StoredCurrentAccountRecentAuthMarker => marker !== undefined)
  }

  return []
}

function readCurrentAccountRecentAuthMetadataEntry(
  raw: unknown,
): StoredCurrentAccountRecentAuthMarker | undefined {
  if (!isRecord(raw)) {
    return undefined
  }

  if (raw.version !== CURRENT_ACCOUNT_RECENT_AUTH_MARKER_VERSION) {
    return undefined
  }

  const markerHash = readNonEmptyString(raw.markerHash)
  const userId = readNonEmptyString(raw.userId)
  const reAuthenticatedAtRaw = readNonEmptyString(raw.reAuthenticatedAt)

  if (!markerHash || !userId || !reAuthenticatedAtRaw) {
    return undefined
  }

  const reAuthenticatedAt = new Date(reAuthenticatedAtRaw)

  if (Number.isNaN(reAuthenticatedAt.getTime())) {
    return undefined
  }

  return {
    version: CURRENT_ACCOUNT_RECENT_AUTH_MARKER_VERSION,
    markerHash,
    userId,
    reAuthenticatedAt,
  }
}

function validateReAuthenticatedAtDate(reAuthenticatedAt: Date, now: Date): void {
  assertValidDate(reAuthenticatedAt, 'Re-authentication time is invalid.')

  if (reAuthenticatedAt.getTime() > now.getTime()) {
    throw invalidInput('Re-authentication time cannot be in the future.')
  }
}

function isCurrentAccountRecentAuthMarker(value: unknown): value is CurrentAccountRecentAuthMarker {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.currentSessionId === 'string' &&
    value.currentSessionId.length > 0 &&
    typeof value.userId === 'string' &&
    value.userId.length > 0 &&
    value.reAuthenticatedAt instanceof Date &&
    typeof value.markerId === 'string' &&
    value.markerId.length > 0
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function enforceRateLimit(
  runtime: AuthServiceRuntime,
  input: RateLimitAttempt,
): Promise<void> {
  if (!runtime.rateLimiter) {
    if (runtime.requireRateLimiter) {
      throw invalidInput('Rate limiter is required by auth service options.')
    }

    return
  }

  const decision = await runtime.rateLimiter.consume(input)

  if (decision.allowed) {
    return
  }

  const details = normalizeRateLimitDecisionDetails(input.action, decision)

  await audit(runtime, AuditEventType.RateLimited, input.now, {
    metadata: details,
  })

  throw rateLimited(details)
}

function normalizeRateLimitDecisionDetails(
  action: RateLimitAttempt['action'],
  decision: RateLimitDecision,
): {
  readonly action: RateLimitAttempt['action']
  readonly retryAfterSeconds?: number
  readonly resetAt?: string
} {
  if (
    decision.retryAfterSeconds !== undefined &&
    (!Number.isFinite(decision.retryAfterSeconds) || decision.retryAfterSeconds < 0)
  ) {
    throw invalidInput('Rate-limit retryAfterSeconds must be a non-negative number.')
  }

  if (
    decision.resetAt !== undefined &&
    (!(decision.resetAt instanceof Date) || Number.isNaN(decision.resetAt.getTime()))
  ) {
    throw invalidInput('Rate-limit resetAt must be a valid date.')
  }

  return {
    action,
    ...optionalProp('retryAfterSeconds', decision.retryAfterSeconds),
    ...optionalProp('resetAt', decision.resetAt?.toISOString()),
  }
}

export async function audit(
  runtime: AuthServiceRuntime,
  type: AuditEventType,
  occurredAt: Date,
  input: {
    readonly userId?: UserId
    readonly identityId?: IdentityId
    readonly sessionId?: SessionId
    readonly metadata?: Record<string, unknown>
  } = {},
): Promise<void> {
  assertValidDate(occurredAt, 'Audit event time is invalid.')

  const event: AuditEvent = {
    id: runtime.idGenerator.auditEventId(),
    type,
    occurredAt,
    ...optionalProp('userId', input.userId),
    ...optionalProp('identityId', input.identityId),
    ...optionalProp('sessionId', input.sessionId),
    ...optionalProp('metadata', input.metadata),
  }

  await runtime.repos.auditLogRepo.append(event)
}

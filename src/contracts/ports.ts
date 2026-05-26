import type {
  AuditEvent,
  AuditEventQuery,
  AuthIdentity,
  AuthIdentityProvider,
  Credential,
  CredentialId,
  FinishInput,
  IdentityId,
  OtpChannel,
  ProviderIdentityAssertion,
  Session,
  SessionId,
  User,
  UserId,
  Verification,
  VerificationId,
  VerificationPurpose,
} from '../core/domain/types.js'
import type { AuthNormalizer, SecretHasher } from './runtime.js'

export interface EmailSender {
  sendEmail(input: {
    readonly to: string
    readonly subject: string
    readonly text: string
    readonly metadata?: Record<string, unknown>
  }): Promise<void>
}

export interface SmsSender {
  sendSms(input: {
    readonly to: string
    readonly text: string
    readonly metadata?: Record<string, unknown>
  }): Promise<void>
}

export interface AuthProvider {
  readonly id: AuthIdentityProvider
  finish(input: FinishInput): Promise<ProviderIdentityAssertion>
}

export interface ProviderRegistry {
  get(provider: AuthIdentityProvider): Promise<AuthProvider | undefined>
}

export interface RateLimitAttempt {
  readonly action: RateLimitAction
  readonly key: string
  readonly now: Date
  readonly metadata?: Record<string, unknown>
}

export interface RateLimitDecision {
  readonly allowed: boolean
  readonly retryAfterSeconds?: number
  readonly resetAt?: Date
}

export interface RateLimitedErrorDetails {
  readonly action: RateLimitAction
  readonly retryAfterSeconds?: number
  readonly resetAt?: string
}

export interface RateLimiter {
  consume(input: RateLimitAttempt): Promise<RateLimitDecision>
}

export interface OtpSecretGeneratorInput {
  readonly purpose: VerificationPurpose
  readonly channel: OtpChannel
  readonly target: string
  readonly now: Date
}

export type OtpSecretGenerator = (input: OtpSecretGeneratorInput) => string | Promise<string>

export type RateLimitAction =
  | 'provider:sign-in'
  | 'otp:start'
  | 'otp:finish'
  | 'otp:resend'
  | 'magic-link:start'
  | 'magic-link:finish'
  | 'magic-link:resend'
  | 'password:sign-in'
  | 'password-recovery:start'
  | 'password-recovery:finish'
  | 'password-recovery:resend'

export type PasswordPolicyPurpose = 'set_password' | 'change_password' | 'password_recovery'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, passwordHash: string): Promise<boolean>
}

export interface PasswordPolicyInput {
  readonly password: string
  readonly purpose: PasswordPolicyPurpose
  readonly userId?: UserId
  readonly email?: string
  readonly now: Date
}

export interface PasswordPolicyDecision {
  readonly allowed: boolean
  readonly reason?: string
}

export interface PasswordPolicy {
  validate(
    input: PasswordPolicyInput,
  ): PasswordPolicyDecision | void | Promise<PasswordPolicyDecision | void>
}

export interface UserUpdatePatch {
  readonly displayName?: User['displayName'] | undefined
  readonly email?: User['email'] | undefined
  readonly phone?: User['phone'] | undefined
  readonly updatedAt?: User['updatedAt']
  readonly disabledAt?: User['disabledAt'] | undefined
  readonly metadata?: User['metadata'] | undefined
}

export interface IdentityUpdatePatch {
  readonly userId?: AuthIdentity['userId']
  readonly provider?: AuthIdentity['provider']
  readonly providerUserId?: AuthIdentity['providerUserId']
  readonly status?: AuthIdentity['status']
  readonly email?: AuthIdentity['email'] | undefined
  readonly emailVerified?: AuthIdentity['emailVerified'] | undefined
  readonly phone?: AuthIdentity['phone'] | undefined
  readonly phoneVerified?: AuthIdentity['phoneVerified'] | undefined
  readonly trust?: AuthIdentity['trust'] | undefined
  readonly updatedAt?: AuthIdentity['updatedAt']
  readonly disabledAt?: AuthIdentity['disabledAt'] | undefined
  readonly metadata?: AuthIdentity['metadata'] | undefined
}

export interface CredentialUpdatePatch {
  readonly userId?: Credential['userId']
  readonly subject?: Credential['subject']
  readonly passwordHash?: Credential['passwordHash']
  readonly updatedAt?: Credential['updatedAt']
  readonly metadata?: Credential['metadata'] | undefined
}

export interface VerificationUpdatePatch {
  readonly purpose?: Verification['purpose']
  readonly target?: Verification['target']
  readonly provider?: Verification['provider'] | undefined
  readonly channel?: Verification['channel'] | undefined
  readonly secretHash?: Verification['secretHash']
  readonly status?: Verification['status']
  readonly expiresAt?: Verification['expiresAt']
  readonly consumedAt?: Verification['consumedAt'] | undefined
  readonly metadata?: Verification['metadata'] | undefined
}

export interface SessionUpdatePatch {
  readonly userId?: Session['userId']
  readonly tokenHash?: Session['tokenHash']
  readonly status?: Session['status']
  readonly expiresAt?: Session['expiresAt']
  readonly revokedAt?: Session['revokedAt'] | undefined
  readonly lastSeenAt?: Session['lastSeenAt'] | undefined
  readonly metadata?: Session['metadata'] | undefined
}

export interface UserRepo {
  findById(id: UserId): Promise<User | undefined>
  create(user: User): Promise<User>
  update(id: UserId, patch: UserUpdatePatch): Promise<User>
}

export interface IdentityRepo {
  findById(id: IdentityId): Promise<AuthIdentity | undefined>
  findByProviderUserId(
    provider: AuthIdentityProvider,
    providerUserId: string,
  ): Promise<AuthIdentity | undefined>
  findByVerifiedEmail(email: string): Promise<readonly AuthIdentity[]>
  findByVerifiedPhone(phone: string): Promise<readonly AuthIdentity[]>
  listByUserId(userId: UserId): Promise<readonly AuthIdentity[]>
  create(identity: AuthIdentity): Promise<AuthIdentity>
  update(id: IdentityId, patch: IdentityUpdatePatch): Promise<AuthIdentity>
  disableForUserIfAnotherActive(
    id: IdentityId,
    userId: UserId,
    patch: IdentityUpdatePatch,
  ): Promise<AuthIdentity>
}

export interface CredentialRepo {
  findPasswordByEmail(email: string): Promise<Credential | undefined>
  findPasswordByUserId(userId: UserId): Promise<Credential | undefined>
  listByUserId(userId: UserId): Promise<readonly Credential[]>
  create(credential: Credential): Promise<Credential>
  update(id: CredentialId, patch: CredentialUpdatePatch): Promise<Credential>
}

export interface VerificationRepo {
  findById(id: VerificationId): Promise<Verification | undefined>
  findByIdForUpdate(id: VerificationId): Promise<Verification | undefined>
  create(verification: Verification): Promise<Verification>
  update(id: VerificationId, patch: VerificationUpdatePatch): Promise<Verification>
}

export interface SessionRepo {
  findById(id: SessionId): Promise<Session | undefined>
  findByTokenHash(tokenHash: string): Promise<Session | undefined>
  listByUserId(userId: UserId): Promise<readonly Session[]>
  create(session: Session): Promise<Session>
  update(id: SessionId, patch: SessionUpdatePatch): Promise<Session>
}

export interface AuditLogRepo {
  append(event: AuditEvent): Promise<void>
  list(input?: AuditEventQuery): Promise<readonly AuditEvent[]>
}

export interface AuthServiceRepositories {
  readonly userRepo: UserRepo
  readonly identityRepo: IdentityRepo
  readonly credentialRepo: CredentialRepo
  readonly verificationRepo: VerificationRepo
  readonly sessionRepo: SessionRepo
  readonly auditLogRepo: AuditLogRepo
}

export interface AuthServiceInfrastructure {
  readonly emailSender?: EmailSender
  readonly smsSender?: SmsSender
  readonly normalizer?: AuthNormalizer
  readonly secretHasher?: SecretHasher
  readonly rateLimiter?: RateLimiter
  readonly verificationResendCooldownSeconds?: number
  readonly otpSecretLength?: number
  readonly otpSecretGenerator?: OtpSecretGenerator
  readonly emailOtpSubject?: string
  readonly passwordHasher?: PasswordHasher
  readonly passwordPolicy?: PasswordPolicy
}

export interface UnitOfWork {
  run<T>(operation: () => Promise<T>): Promise<T>
}

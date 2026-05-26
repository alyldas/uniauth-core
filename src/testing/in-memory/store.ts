import { AsyncLocalStorage } from 'node:async_hooks'
import {
  AuthIdentityStatus,
  CredentialType,
  type AuditEvent,
  type AuthIdentity,
  type AuthIdentityProvider,
  type Credential,
  type Session,
  type User,
  type Verification,
} from '../../core/domain/types.js'
import type {
  AuditLogRepo,
  AuthNormalizer,
  AuthServiceRepositories,
  CredentialRepo,
  IdentityRepo,
  SessionRepo,
  UnitOfWork,
  UserRepo,
  VerificationRepo,
} from '../../contracts/index.js'
import { UniAuthError, UniAuthErrorCode } from '../../core/errors/index.js'
import { compatibilityAuthNormalizer } from '../../core/utils/normalization.js'
import {
  applyPatch,
  compareAuditEventsDescending,
  compositeKey,
  isNewerThanAuditCursor,
  isOlderThanAuditCursor,
} from './store/helpers.js'
import { createInMemoryStoreState, restoreStoreState, snapshotStoreState } from './store/state.js'

export interface InMemoryAuthStoreOptions {
  readonly normalizer?: AuthNormalizer
}

export class InMemoryAuthStore implements AuthServiceRepositories, UnitOfWork {
  private readonly state = createInMemoryStoreState()
  private readonly transactionScope = new AsyncLocalStorage<boolean>()
  private transactionQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: InMemoryAuthStoreOptions = {}) {}

  readonly userRepo: UserRepo = {
    findById: async (id) => this.state.users.get(id),
    create: async (user) => {
      this.state.users.set(user.id, user)
      return user
    },
    update: async (id, patch) => {
      const existing = this.state.users.get(id)

      if (!existing) {
        throw new UniAuthError(UniAuthErrorCode.UserNotFound, 'User was not found.')
      }

      const updated = applyPatch(existing, patch)
      this.state.users.set(updated.id, updated)
      return updated
    },
  }

  readonly identityRepo: IdentityRepo = {
    findById: async (id) => this.state.identities.get(id),
    findByProviderUserId: async (provider, providerUserId) => {
      const id = this.state.identityKeys.get(this.identityKey(provider, providerUserId))
      return id ? this.state.identities.get(id) : undefined
    },
    findByVerifiedEmail: async (email) => {
      const normalizedEmail = this.normalizer.normalizeEmail(email)
      return [...this.state.identities.values()].filter(
        (identity) =>
          identity.status === AuthIdentityStatus.Active &&
          identity.emailVerified === true &&
          identity.email === normalizedEmail,
      )
    },
    findByVerifiedPhone: async (phone) => {
      const normalizedPhone = this.normalizer.normalizePhone(phone)
      return [...this.state.identities.values()].filter(
        (identity) =>
          identity.status === AuthIdentityStatus.Active &&
          identity.phoneVerified === true &&
          identity.phone === normalizedPhone,
      )
    },
    listByUserId: async (userId) =>
      [...this.state.identities.values()].filter((identity) => identity.userId === userId),
    create: async (identity) => {
      this.assertUserExists(identity.userId)
      const key = this.identityKey(identity.provider, identity.providerUserId)

      if (this.state.identityKeys.has(key)) {
        throw new UniAuthError(UniAuthErrorCode.IdentityAlreadyLinked, 'Identity cannot be linked.')
      }

      this.state.identities.set(identity.id, identity)
      this.state.identityKeys.set(key, identity.id)
      return identity
    },
    update: async (id, patch) => {
      const existing = this.state.identities.get(id)

      if (!existing) {
        throw new UniAuthError(UniAuthErrorCode.IdentityNotFound, 'Identity was not found.')
      }

      const updated = applyPatch(existing, patch)
      this.assertUserExists(updated.userId)
      const oldKey = this.identityKey(existing.provider, existing.providerUserId)
      const newKey = this.identityKey(updated.provider, updated.providerUserId)
      const existingIdentityId = this.state.identityKeys.get(newKey)

      if (newKey !== oldKey && existingIdentityId) {
        throw new UniAuthError(UniAuthErrorCode.IdentityAlreadyLinked, 'Identity cannot be linked.')
      }

      this.state.identityKeys.delete(oldKey)
      this.state.identityKeys.set(newKey, updated.id)
      this.state.identities.set(updated.id, updated)
      return updated
    },
    disableForUserIfAnotherActive: async (id, userId, patch) => {
      const existing = this.state.identities.get(id)

      if (
        !existing ||
        existing.userId !== userId ||
        existing.status !== AuthIdentityStatus.Active ||
        existing.disabledAt
      ) {
        throw new UniAuthError(UniAuthErrorCode.IdentityNotFound, 'Identity was not found.')
      }

      const activeIdentities = [...this.state.identities.values()].filter(
        (identity) =>
          identity.userId === userId &&
          identity.status === AuthIdentityStatus.Active &&
          !identity.disabledAt,
      )

      if (activeIdentities.length <= 1) {
        throw new UniAuthError(
          UniAuthErrorCode.LastIdentity,
          'Cannot unlink the last active identity.',
        )
      }

      return this.identityRepo.update(id, patch)
    },
  }

  readonly credentialRepo: CredentialRepo = {
    findPasswordByEmail: async (email) => {
      const id = this.state.credentialKeys.get(
        this.credentialKey(CredentialType.Password, this.normalizer.normalizeEmail(email)),
      )
      return id ? this.state.credentials.get(id) : undefined
    },
    findPasswordByUserId: async (userId) => {
      const id = this.state.credentialUserKeys.get(
        this.credentialUserKey(CredentialType.Password, userId),
      )
      return id ? this.state.credentials.get(id) : undefined
    },
    listByUserId: async (userId) =>
      [...this.state.credentials.values()].filter((credential) => credential.userId === userId),
    create: async (credential) => {
      this.assertUserExists(credential.userId)
      const key = this.credentialKey(credential.type, credential.subject)
      const userKey = this.credentialUserKey(credential.type, credential.userId)

      if (this.state.credentialKeys.has(key) || this.state.credentialUserKeys.has(userKey)) {
        throw new UniAuthError(
          UniAuthErrorCode.CredentialAlreadyExists,
          'Credential already exists.',
        )
      }

      this.state.credentials.set(credential.id, credential)
      this.state.credentialKeys.set(key, credential.id)
      this.state.credentialUserKeys.set(userKey, credential.id)
      return credential
    },
    update: async (id, patch) => {
      const existing = this.state.credentials.get(id)

      if (!existing) {
        throw new UniAuthError(UniAuthErrorCode.CredentialNotFound, 'Credential was not found.')
      }

      const updated = applyPatch(existing, patch)
      this.assertUserExists(updated.userId)
      const oldKey = this.credentialKey(existing.type, existing.subject)
      const newKey = this.credentialKey(updated.type, updated.subject)
      const oldUserKey = this.credentialUserKey(existing.type, existing.userId)
      const newUserKey = this.credentialUserKey(updated.type, updated.userId)
      const existingCredentialId = this.state.credentialKeys.get(newKey)
      const existingCredentialUserId = this.state.credentialUserKeys.get(newUserKey)

      if (
        (newKey !== oldKey && existingCredentialId) ||
        (newUserKey !== oldUserKey && existingCredentialUserId)
      ) {
        throw new UniAuthError(
          UniAuthErrorCode.CredentialAlreadyExists,
          'Credential already exists.',
        )
      }

      this.state.credentialKeys.delete(oldKey)
      this.state.credentialKeys.set(newKey, updated.id)
      this.state.credentialUserKeys.delete(oldUserKey)
      this.state.credentialUserKeys.set(newUserKey, updated.id)
      this.state.credentials.set(updated.id, updated)
      return updated
    },
  }

  readonly verificationRepo: VerificationRepo = {
    findById: async (id) => this.state.verifications.get(id),
    findByIdForUpdate: async (id) => this.state.verifications.get(id),
    create: async (verification) => {
      this.state.verifications.set(verification.id, verification)
      return verification
    },
    update: async (id, patch) => {
      const existing = this.state.verifications.get(id)

      if (!existing) {
        throw new UniAuthError(UniAuthErrorCode.VerificationNotFound, 'Verification was not found.')
      }

      const updated = applyPatch(existing, patch)
      this.state.verifications.set(updated.id, updated)
      return updated
    },
  }

  readonly sessionRepo: SessionRepo = {
    findById: async (id) => this.state.sessions.get(id),
    findByTokenHash: async (tokenHash) => {
      const id = this.state.sessionKeys.get(tokenHash)
      return id ? this.state.sessions.get(id) : undefined
    },
    listByUserId: async (userId) =>
      [...this.state.sessions.values()].filter((session) => session.userId === userId),
    create: async (session) => {
      this.assertUserExists(session.userId)

      if (this.state.sessionKeys.has(session.tokenHash)) {
        throw new UniAuthError(UniAuthErrorCode.InvalidInput, 'Session token already exists.')
      }

      this.state.sessions.set(session.id, session)
      this.state.sessionKeys.set(session.tokenHash, session.id)
      return session
    },
    update: async (id, patch) => {
      const existing = this.state.sessions.get(id)

      if (!existing) {
        throw new UniAuthError(UniAuthErrorCode.SessionNotFound, 'Session was not found.')
      }

      const updated = applyPatch(existing, patch)
      this.assertUserExists(updated.userId)
      const existingSessionId = this.state.sessionKeys.get(updated.tokenHash)

      if (updated.tokenHash !== existing.tokenHash && existingSessionId) {
        throw new UniAuthError(UniAuthErrorCode.InvalidInput, 'Session token already exists.')
      }

      this.state.sessionKeys.delete(existing.tokenHash)
      this.state.sessionKeys.set(updated.tokenHash, updated.id)
      this.state.sessions.set(updated.id, updated)
      return updated
    },
  }

  readonly auditLogRepo: AuditLogRepo = {
    append: async (event) => {
      this.state.auditEvents.push(event)
    },
    list: async (input = {}) => {
      const events = [...this.state.auditEvents]
        .filter((event) => (input.userId ? event.userId === input.userId : true))
        .filter((event) => (input.identityId ? event.identityId === input.identityId : true))
        .filter((event) => (input.sessionId ? event.sessionId === input.sessionId : true))
        .filter((event) => (input.type ? event.type === input.type : true))
        .filter((event) => (input.before ? isOlderThanAuditCursor(event, input.before) : true))
        .filter((event) => (input.after ? isNewerThanAuditCursor(event, input.after) : true))
        .sort(compareAuditEventsDescending)

      return input.limit !== undefined ? events.slice(0, input.limit) : events
    },
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionScope.getStore()) {
      return operation()
    }

    const previousTransaction = this.transactionQueue
    let releaseTransaction!: () => void
    this.transactionQueue = new Promise((resolve) => {
      releaseTransaction = resolve
    })

    await previousTransaction

    const snapshot = snapshotStoreState(this.state)

    try {
      return await this.transactionScope.run(true, operation)
    } catch (error) {
      restoreStoreState(this.state, snapshot)
      throw error
    } finally {
      releaseTransaction()
    }
  }

  listUsers(): readonly User[] {
    return [...this.state.users.values()]
  }

  listIdentities(): readonly AuthIdentity[] {
    return [...this.state.identities.values()]
  }

  listCredentials(): readonly Credential[] {
    return [...this.state.credentials.values()]
  }

  listSessions(): readonly Session[] {
    return [...this.state.sessions.values()]
  }

  listVerifications(): readonly Verification[] {
    return [...this.state.verifications.values()]
  }

  listAuditEvents(): readonly AuditEvent[] {
    return [...this.state.auditEvents]
  }

  private assertUserExists(userId: User['id']): void {
    if (!this.state.users.has(userId)) {
      throw new UniAuthError(UniAuthErrorCode.UserNotFound, 'User was not found.')
    }
  }

  private identityKey(provider: AuthIdentityProvider, providerUserId: string): string {
    return compositeKey(provider, providerUserId)
  }

  private get normalizer(): AuthNormalizer {
    return this.options.normalizer ?? compatibilityAuthNormalizer
  }

  private credentialKey(type: Credential['type'], subject: string): string {
    return compositeKey(type, subject)
  }

  private credentialUserKey(type: Credential['type'], userId: User['id']): string {
    return compositeKey(type, userId)
  }
}

import type {
  AuditEvent,
  AuthIdentity,
  Credential,
  Session,
  User,
  Verification,
} from '../../../core/domain/types.js'

export interface InMemoryStoreState {
  readonly users: Map<User['id'], User>
  readonly identities: Map<AuthIdentity['id'], AuthIdentity>
  readonly identityKeys: Map<string, AuthIdentity['id']>
  readonly credentials: Map<Credential['id'], Credential>
  readonly credentialKeys: Map<string, Credential['id']>
  readonly credentialUserKeys: Map<string, Credential['id']>
  readonly verifications: Map<Verification['id'], Verification>
  readonly sessions: Map<Session['id'], Session>
  readonly sessionKeys: Map<string, Session['id']>
  readonly auditEvents: AuditEvent[]
}

interface StoreSnapshot {
  readonly users: ReadonlyMap<User['id'], User>
  readonly identities: ReadonlyMap<AuthIdentity['id'], AuthIdentity>
  readonly identityKeys: ReadonlyMap<string, AuthIdentity['id']>
  readonly credentials: ReadonlyMap<Credential['id'], Credential>
  readonly credentialKeys: ReadonlyMap<string, Credential['id']>
  readonly credentialUserKeys: ReadonlyMap<string, Credential['id']>
  readonly verifications: ReadonlyMap<Verification['id'], Verification>
  readonly sessions: ReadonlyMap<Session['id'], Session>
  readonly sessionKeys: ReadonlyMap<string, Session['id']>
  readonly auditEvents: readonly AuditEvent[]
}

export function createInMemoryStoreState(): InMemoryStoreState {
  return {
    users: new Map<User['id'], User>(),
    identities: new Map<AuthIdentity['id'], AuthIdentity>(),
    identityKeys: new Map<string, AuthIdentity['id']>(),
    credentials: new Map<Credential['id'], Credential>(),
    credentialKeys: new Map<string, Credential['id']>(),
    credentialUserKeys: new Map<string, Credential['id']>(),
    verifications: new Map<Verification['id'], Verification>(),
    sessions: new Map<Session['id'], Session>(),
    sessionKeys: new Map<string, Session['id']>(),
    auditEvents: [],
  }
}

export function snapshotStoreState(state: InMemoryStoreState): StoreSnapshot {
  return {
    users: new Map(state.users),
    identities: new Map(state.identities),
    identityKeys: new Map(state.identityKeys),
    credentials: new Map(state.credentials),
    credentialKeys: new Map(state.credentialKeys),
    credentialUserKeys: new Map(state.credentialUserKeys),
    verifications: new Map(state.verifications),
    sessions: new Map(state.sessions),
    sessionKeys: new Map(state.sessionKeys),
    auditEvents: [...state.auditEvents],
  }
}

export function restoreStoreState(state: InMemoryStoreState, snapshot: StoreSnapshot): void {
  state.users.clear()
  state.identities.clear()
  state.identityKeys.clear()
  state.credentials.clear()
  state.credentialKeys.clear()
  state.credentialUserKeys.clear()
  state.verifications.clear()
  state.sessions.clear()
  state.sessionKeys.clear()
  state.auditEvents.length = 0

  replaceMap(state.users, snapshot.users)
  replaceMap(state.identities, snapshot.identities)
  replaceMap(state.identityKeys, snapshot.identityKeys)
  replaceMap(state.credentials, snapshot.credentials)
  replaceMap(state.credentialKeys, snapshot.credentialKeys)
  replaceMap(state.credentialUserKeys, snapshot.credentialUserKeys)
  replaceMap(state.verifications, snapshot.verifications)
  replaceMap(state.sessions, snapshot.sessions)
  replaceMap(state.sessionKeys, snapshot.sessionKeys)
  state.auditEvents.push(...snapshot.auditEvents)
}

function replaceMap<Key, Value>(target: Map<Key, Value>, source: ReadonlyMap<Key, Value>): void {
  for (const [key, value] of source) {
    target.set(key, value)
  }
}

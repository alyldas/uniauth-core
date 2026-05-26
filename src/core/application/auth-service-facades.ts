import {
  toAccountSecurityCredentialView,
  toAccountSecurityIdentityView,
  toAccountSecuritySessionView,
  toAccountSecurityUserView,
  toAuditEventView,
  toVerificationStatusView,
} from '../domain/types.js'
import type {
  AccountAuditEventPage,
  AccountClosureResult,
  AccountLinkResult,
  AuthAccountFacade,
  AuthAdminFacade,
  AuthPublicFacade,
  AuthResult,
  AuthService,
  AuditEventPage,
  CloseCurrentAccountByTokenResult,
  LinkResult,
  PublicAuthResult,
} from '../domain/types.js'

type AuthServiceFacadeSource = Omit<AuthService, 'public' | 'account' | 'admin'>

interface AuthServiceFacades {
  readonly public: AuthPublicFacade
  readonly account: AuthAccountFacade
  readonly admin: AuthAdminFacade
}

export function createAuthServiceFacades(service: AuthServiceFacadeSource): AuthServiceFacades {
  return {
    public: createAuthPublicFacade(service),
    account: createAuthAccountFacade(service),
    admin: createAuthAdminFacade(service),
  }
}

function createAuthPublicFacade(service: AuthServiceFacadeSource): AuthPublicFacade {
  return {
    provider: {
      signIn: async (input) => toPublicAuthResult(await service.signIn(input)),
    },
    otp: {
      start: service.startOtpChallenge.bind(service),
      resend: service.resendOtpChallenge.bind(service),
      signIn: async (input) => toPublicAuthResult(await service.finishOtpSignIn(input)),
    },
    magicLink: {
      start: service.startEmailMagicLinkSignIn.bind(service),
      resend: service.resendEmailMagicLinkSignIn.bind(service),
      finish: async (input) => toPublicAuthResult(await service.finishEmailMagicLinkSignIn(input)),
    },
    password: {
      signIn: async (input) => toPublicAuthResult(await service.signInWithPassword(input)),
    },
    passwordRecovery: {
      start: service.startEmailPasswordRecovery.bind(service),
      resend: service.resendEmailPasswordRecovery.bind(service),
    },
  }
}

function createAuthAccountFacade(service: AuthServiceFacadeSource): AuthAccountFacade {
  return {
    profile: {
      update: async (input) =>
        toAccountSecurityUserView(await service.updateCurrentAccountProfileByToken(input)),
    },
    contact: {
      start: service.startCurrentAccountContactChange.bind(service),
      resend: service.resendCurrentAccountContactChange.bind(service),
      cancel: async (input) =>
        toVerificationStatusView(await service.cancelCurrentAccountContactChange(input)),
      finish: async (input) =>
        toAccountSecurityUserView(await service.finishCurrentAccountContactChange(input)),
    },
    password: {
      set: async (input) =>
        toAccountSecurityCredentialView(await service.setCurrentAccountPasswordByToken(input)),
      confirm: service.confirmCurrentAccountPasswordByToken.bind(service),
      change: async (input) =>
        toAccountSecurityCredentialView(await service.changeCurrentAccountPasswordByToken(input)),
    },
    reAuth: {
      status: service.getCurrentAccountReAuthStatus.bind(service),
      assert: service.assertCurrentAccountReAuth.bind(service),
      startOtp: service.startCurrentAccountOtpReAuth.bind(service),
      resendOtp: service.resendCurrentAccountOtpReAuth.bind(service),
      cancelOtp: async (input) =>
        toVerificationStatusView(await service.cancelCurrentAccountOtpReAuth(input)),
      finishOtp: service.finishCurrentAccountOtpReAuth.bind(service),
      confirmPassword: service.confirmCurrentAccountPasswordByToken.bind(service),
    },
    sessions: {
      revokeCurrent: service.revokeCurrentSessionByToken.bind(service),
      revokeOwned: service.revokeOwnedSessionByToken.bind(service),
      revokeOther: service.revokeOtherSessionsByToken.bind(service),
    },
    identities: {
      link: async (input) => toAccountLinkResult(await service.linkCurrentIdentityByToken(input)),
      unlink: service.unlinkCurrentIdentityByToken.bind(service),
    },
    security: {
      snapshot: service.getCurrentAccountSecuritySnapshot.bind(service),
    },
    inspection: {
      snapshot: service.getCurrentAccountInspectionSnapshot.bind(service),
      closureExport: service.getCurrentAccountClosureExportSnapshot.bind(service),
      auditPage: async (input) =>
        toAccountAuditEventPage(await service.getCurrentAccountAuditEventPage(input)),
    },
    closure: {
      close: async (input) =>
        toAccountClosureResult(await service.closeCurrentAccountByToken(input)),
    },
  }
}

function createAuthAdminFacade(service: AuthServiceFacadeSource): AuthAdminFacade {
  return {
    users: {
      get: service.getUser.bind(service),
      identities: service.getUserIdentities.bind(service),
      credentials: service.getUserCredentials.bind(service),
      sessions: service.getUserSessions.bind(service),
      revokeSessions: service.revokeUserSessions.bind(service),
      securitySnapshot: service.getAccountSecuritySnapshot.bind(service),
      inspectionSnapshot: service.getAccountInspectionSnapshot.bind(service),
    },
    accounts: {
      link: service.link.bind(service),
      unlink: service.unlink.bind(service),
      merge: service.mergeAccounts.bind(service),
    },
    sessions: {
      create: service.createSession.bind(service),
      revoke: service.revokeSession.bind(service),
      touch: service.touchSession.bind(service),
      resolve: service.resolveSession.bind(service),
      context: service.resolveSessionContext.bind(service),
    },
    verifications: {
      create: service.createVerification.bind(service),
      get: service.getVerification.bind(service),
      cancel: service.cancelVerification.bind(service),
      consume: service.consumeVerification.bind(service),
      finishOtp: service.finishOtpChallenge.bind(service),
      cancelOtp: service.cancelOtpChallenge.bind(service),
      cancelMagicLink: service.cancelEmailMagicLinkSignIn.bind(service),
      cancelPasswordRecovery: service.cancelEmailPasswordRecovery.bind(service),
      resendWindow: service.getVerificationResendWindow.bind(service),
    },
    credentials: {
      setPassword: service.setPassword.bind(service),
      changePassword: service.changePassword.bind(service),
      finishPasswordRecovery: service.finishEmailPasswordRecovery.bind(service),
    },
    audit: {
      events: service.getAuditEvents.bind(service),
      page: service.getAuditEventPage.bind(service),
    },
  }
}

function toPublicAuthResult(result: AuthResult): PublicAuthResult {
  return {
    user: toAccountSecurityUserView(result.user),
    identity: toAccountSecurityIdentityView(result.identity),
    session: toAccountSecuritySessionView(result.session),
    sessionToken: result.sessionToken,
    isNewUser: result.isNewUser,
    isNewIdentity: result.isNewIdentity,
  }
}

function toAccountLinkResult(result: LinkResult): AccountLinkResult {
  return {
    user: toAccountSecurityUserView(result.user),
    identity: toAccountSecurityIdentityView(result.identity),
    linked: result.linked,
  }
}

function toAccountClosureResult(result: CloseCurrentAccountByTokenResult): AccountClosureResult {
  return {
    user: toAccountSecurityUserView(result.user),
    currentSessionId: result.currentSessionId,
    revokedSessionIds: result.revokedSessionIds,
  }
}

function toAccountAuditEventPage(page: AuditEventPage): AccountAuditEventPage {
  return {
    events: page.events.map((event) => toAuditEventView(event)),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  }
}

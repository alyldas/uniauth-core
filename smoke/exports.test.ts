import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import tsconfigBuild from '../tsconfig.build.json'
import tsupConfig from '../tsup.config'

interface PackageMetadata {
  readonly name: string
  readonly author: {
    readonly email: string
  }
  readonly exports: Record<string, { readonly types: string; readonly import: string }>
}

interface TsupEntrypointConfig {
  readonly entry: Record<string, string>
}

const packageMetadata = packageJson as PackageMetadata
const packageName = packageMetadata.name

const expectedEntrypoints = {
  '.': {
    declaration: 'src/entrypoints/root.ts',
    bundle: 'src/entrypoints/root.ts',
  },
  './contracts': {
    declaration: 'src/entrypoints/contracts.ts',
    bundle: 'src/entrypoints/contracts.ts',
  },
  './testing': {
    declaration: 'src/entrypoints/testing.ts',
    bundle: 'src/entrypoints/testing.ts',
  },
} as const

const canonicalSurfaceDocs = [
  'README.md',
  'docs/abuse-control.md',
  'docs/account-security.md',
  'docs/architecture.md',
  'docs/backend-recipes.md',
  'docs/comparison.md',
  'docs/development.md',
  'docs/licensing.md',
  'docs/local-auth.md',
  'docs/normalization.md',
  'docs/otp-delivery.md',
  'docs/roadmap.md',
  'docs/security.md',
  'docs/session-transport.md',
  'docs/support-inspection.md',
  'docs/threat-model.md',
  'examples/basic-node/index.ts',
  'examples/current-account-contact-change/index.ts',
  'examples/link-unlink/index.ts',
  'examples/shared/email.ts',
  'examples/shared/views.ts',
] as const

const flatServiceCallPattern = /\b(?:service|authService)\.(?!public\b|account\b|admin\b)\w+\s*\(/gu

const packageExportPath = (exportPath: string): string => {
  return exportPath === '.' ? packageName : `${packageName}${exportPath.slice(1)}`
}

const packageExportImportTarget = (exportPath: keyof typeof expectedEntrypoints): string => {
  const exportTarget = packageMetadata.exports[exportPath]
  if (exportTarget === undefined) {
    throw new Error(`Missing package export metadata for ${exportPath}.`)
  }

  return new URL(`../${exportTarget.import.slice(2)}`, import.meta.url).href
}

const findMatchesWithLineNumbers = (source: string, pattern: RegExp): string[] => {
  return Array.from(source.matchAll(pattern), (match) => {
    const line = source.slice(0, match.index).split('\n').length
    return `${line}: ${match[0]}`
  })
}

const writeTypeConsumerCheckFile = async (dir: string): Promise<void> => {
  await writeFile(
    join(dir, 'package-consumer-check.ts'),
    `import { createAuthService, PasswordPolicyPurpose, type AccountAuditEventPage, type AccountClosureResult, type AccountLinkResult, type AuthAccountFacade, type AuthAdminFacade, type AuthPolicyAction, type AuthPublicFacade, type AuditEventType, type PublicAuthResult, type UniAuthErrorCode, type PasswordPolicy } from ${JSON.stringify(packageName)}
import { createInMemoryAuthKit } from ${JSON.stringify(`${packageName}/testing`)}

export type SmokeTypeConsumerCheck = {
  policyAction: AuthPolicyAction
  eventType: AuditEventType
  errorCode: UniAuthErrorCode
  publicFacade: AuthPublicFacade
  accountFacade: AuthAccountFacade
  adminFacade: AuthAdminFacade
  publicAuthResult: PublicAuthResult
  accountLinkResult: AccountLinkResult
  accountClosureResult: AccountClosureResult
  accountAuditEventPage: AccountAuditEventPage
  passwordPolicy: PasswordPolicy
}

export const _authPolicyAction: AuthPolicyAction = 'changePassword'
export const _auditEventType: AuditEventType = 'auth.sign_in'
export const _errorCode: UniAuthErrorCode = 'invalid_input'
export const _passwordPolicyPurpose = PasswordPolicyPurpose.SetPassword
export const _passwordPolicy: PasswordPolicy = { validate: () => ({ allowed: true }) }
export const _createAuthService = createAuthService
export const _createInMemoryAuthKit = createInMemoryAuthKit
`,
    'utf8',
  )
}

const extractInterfaceDeclaration = (source: string, interfaceName: string): string => {
  const start = source.indexOf(`export interface ${interfaceName}`)
  if (start === -1) {
    return ''
  }

  const nextInterface = source.indexOf('\nexport interface ', start + 1)
  return source.slice(start, nextInterface === -1 ? undefined : nextInterface)
}

describe('package exports', () => {
  it('keeps package exports, tsup entries, and declaration entry files aligned', () => {
    const tsupEntries = (tsupConfig as TsupEntrypointConfig).entry
    const tsconfigFiles = new Set(tsconfigBuild.files)

    expect(Object.keys(packageMetadata.exports).sort()).toEqual(
      Object.keys(expectedEntrypoints).sort(),
    )

    for (const [exportPath, entrypoint] of Object.entries(expectedEntrypoints)) {
      const exportTarget = packageMetadata.exports[exportPath]
      if (exportTarget === undefined) {
        throw new Error(`Missing package export metadata for ${exportPath}.`)
      }

      const distEntry = exportTarget.import
        .replace('./dist/', '')
        .replace(/\/index\.js$/u, '/index')
        .replace(/\.js$/u, '')

      expect(tsupEntries[distEntry]).toBe(entrypoint.bundle)
      expect(tsconfigFiles.has(entrypoint.declaration)).toBe(true)
    }
  })

  it('loads the root entry point without mutating process environment', async () => {
    const before = { ...process.env }

    await import(packageExportImportTarget('.'))

    expect(process.env).toEqual(before)
  })

  it('loads the public ESM entry points', async () => {
    const core = await import(packageExportImportTarget('.'))
    const contracts = await import(packageExportImportTarget('./contracts'))
    const testing = await import(packageExportImportTarget('./testing'))

    expect(Object.keys(contracts)).toEqual([])
    expect(core.AuditEventType.SignIn).toBe('auth.sign_in')
    expect(core.AuditEventType.AccountProfileUpdated).toBe('auth.account_profile_updated')
    expect(core.AuditEventType.AccountContactUpdated).toBe('auth.account_contact_updated')
    expect(core.AuditEventType.VerificationCancelled).toBe('auth.verification_cancelled')
    expect(core.CredentialType.Password).toBe('password')
    expect(core.AuthPolicyAction.ChangePassword).toBe('changePassword')
    expect(core.AuthPolicyAction.UpdateProfile).toBe('updateProfile')
    expect(core.AuthPolicyAction.UpdateContact).toBe('updateContact')
    expect(core.DefaultAuthService).toBeTypeOf('function')
    expect(core.EMAIL_MAGIC_LINK_PROVIDER_ID).toBe('email-magic-link')
    expect(core.EMAIL_OTP_PROVIDER_ID).toBe('email-otp')
    expect(core.OtpChannel.Phone).toBe('phone')
    expect(core.PASSWORD_PROVIDER_ID).toBe('password')
    expect(core.PasswordPolicyPurpose.SetPassword).toBe('set_password')
    expect(core.PasswordPolicyPurpose.ChangePassword).toBe('change_password')
    expect(core.PasswordPolicyPurpose.PasswordRecovery).toBe('password_recovery')
    expect(core.PHONE_OTP_PROVIDER_ID).toBe('phone-otp')
    expect(core.VerificationPurpose.ContactChange).toBe('contact-change')
    expect(core.RateLimitAction.ProviderSignIn).toBe('provider:sign-in')
    expect(core.RateLimitAction.OtpResend).toBe('otp:resend')
    expect(core.RateLimitAction.MagicLinkResend).toBe('magic-link:resend')
    expect(core.RateLimitAction.PasswordRecoveryResend).toBe('password-recovery:resend')
    expect(core.rateLimitKey).toBeTypeOf('function')
    expect(core.UniAuthError).toBeTypeOf('function')
    expect(core.UniAuthErrorCode.InvalidCredentials).toBe('invalid_credentials')
    expect(core.UniAuthErrorCode.InvalidInput).toBe('invalid_input')
    expect(core.UniAuthErrorCode.RateLimited).toBe('rate_limited')
    expect(
      core.isUniAuthError(new core.UniAuthError(core.UniAuthErrorCode.InvalidInput, 'x')),
    ).toBe(true)
    expect(core.createDefaultAuthPolicy).toBeTypeOf('function')
    expect(core.createAuthNormalizer).toBeTypeOf('function')
    expect(core.createHmacSecretHasher).toBeTypeOf('function')
    expect(core.createScryptSecretHasher).toBeTypeOf('function')
    expect(core.isActiveIdentity).toBeTypeOf('function')
    expect(core.isActiveSession).toBeTypeOf('function')
    expect(core.isActiveUser).toBeTypeOf('function')
    expect(core.isConsumedVerification).toBeTypeOf('function')
    expect(core.isExpiredVerification).toBeTypeOf('function')
    expect(core.isUsableVerification).toBeTypeOf('function')
    expect(core.getRateLimitedErrorDetails).toBeTypeOf('function')
    expect(core.isRateLimitedErrorDetails).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getUser).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getUserCredentials).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getAccountInspectionSnapshot).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getAccountSecuritySnapshot).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getAuditEventPage).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.cancelVerification).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.cancelOtpChallenge).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.cancelEmailMagicLinkSignIn).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.cancelEmailPasswordRecovery).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getVerificationResendWindow).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.resendOtpChallenge).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.resendEmailMagicLinkSignIn).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.resendEmailPasswordRecovery).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.resolveSessionContext).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getCurrentAccountSecuritySnapshot).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.getCurrentAccountInspectionSnapshot).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.getCurrentAccountClosureExportSnapshot).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.getCurrentAccountAuditEventPage).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getCurrentAccountReAuthStatus).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.assertCurrentAccountReAuth).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.startCurrentAccountOtpReAuth).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.resendCurrentAccountOtpReAuth).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.cancelCurrentAccountOtpReAuth).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.finishCurrentAccountOtpReAuth).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.linkCurrentIdentityByToken).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.revokeCurrentSessionByToken).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.revokeOwnedSessionByToken).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.revokeOtherSessionsByToken).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.unlinkCurrentIdentityByToken).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.updateCurrentAccountProfileByToken).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.startCurrentAccountContactChange).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.resendCurrentAccountContactChange).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.cancelCurrentAccountContactChange).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.finishCurrentAccountContactChange).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.setCurrentAccountPasswordByToken).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.confirmCurrentAccountPasswordByToken).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.changeCurrentAccountPasswordByToken).toBeTypeOf(
      'function',
    )
    expect(core.DefaultAuthService.prototype.getVerification).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.revokeUserSessions).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.getUserSessions).toBeTypeOf('function')
    expect(core.DefaultAuthService.prototype.touchSession).toBeTypeOf('function')
    expect(testing.createInMemoryAuthKit().service.public.password.signIn).toBeTypeOf('function')
    expect(testing.createInMemoryAuthKit().service.account.profile.update).toBeTypeOf('function')
    expect(testing.createInMemoryAuthKit().service.admin.users.get).toBeTypeOf('function')
    expect(core.toAccountInspectionSnapshot).toBeTypeOf('function')
    expect(core.toAccountSecuritySnapshot).toBeTypeOf('function')
    expect(core.toCurrentAccountInspectionSnapshot).toBeTypeOf('function')
    expect(core.toAuditEventView).toBeTypeOf('function')
    expect(core.toAuditEventCursor).toBeTypeOf('function')
    expect(core.toAccountSecurityCredentialView).toBeTypeOf('function')
    expect(core.toVerificationResendWindow).toBeTypeOf('function')
    expect(core.toVerificationStatusView).toBeTypeOf('function')
    expect(core.compatibilityAuthNormalizer).toBeTypeOf('object')
    expect(core.UNIAUTH_ATTRIBUTION).toBeTypeOf('object')
    expect(core.getUniAuthAttributionNotice).toBeTypeOf('function')
    expect(core.UNIAUTH_ATTRIBUTION).toMatchObject({
      contactEmail: packageMetadata.author.email,
      packageName: packageMetadata.name,
    })
    expect(core.getUniAuthAttributionNotice({ productName: 'Smoke App' })).toContain(
      `Smoke App uses ${packageMetadata.name}.`,
    )
    expect(testing.createInMemoryAuthKit).toBeTypeOf('function')
    expect(testing.InMemoryEmailSender).toBeTypeOf('function')
    expect(testing.InMemoryPasswordHasher).toBeTypeOf('function')
    expect(testing.InMemoryRateLimiter).toBeTypeOf('function')
    expect(testing.InMemorySmsSender).toBeTypeOf('function')
    expect(testing.StaticAuthProvider).toBeTypeOf('function')
  })

  it('loads every public package subpath through self-reference exports', async () => {
    for (const exportPath of Object.keys(expectedEntrypoints)) {
      const importPath = packageExportPath(exportPath)
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', `await import(${JSON.stringify(importPath)})`],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      )

      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    }
  })

  it('keeps docs and examples on the canonical grouped service surface', async () => {
    const directFlatCalls: string[] = []

    for (const filePath of canonicalSurfaceDocs) {
      const source = await readFile(join(process.cwd(), filePath), 'utf8')
      for (const match of findMatchesWithLineNumbers(source, flatServiceCallPattern)) {
        directFlatCalls.push(`${filePath}:${match}`)
      }
    }

    expect(directFlatCalls).toEqual([])
  })

  it('type-checks package self-reference consumer imports', async () => {
    const temporaryDirectory = await mkdtemp(join(process.cwd(), '.uniauth-package-consumer-'))
    const consumerSourcePath = join(temporaryDirectory, 'package-consumer-check.ts')
    const tscPath = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))

    try {
      await writeTypeConsumerCheckFile(temporaryDirectory)
      const result = spawnSync(
        tscPath,
        [
          '--pretty',
          'false',
          '--ignoreConfig',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--target',
          'ES2022',
          '--strict',
          '--noEmit',
          '--skipLibCheck',
          '--types',
          'node',
          consumerSourcePath,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
    } finally {
      await unlink(consumerSourcePath).catch(() => undefined)
      await rmdir(temporaryDirectory).catch(() => undefined)
    }
  })

  it('keeps testing package declarations aligned with the stable public surface', async () => {
    const contractsDeclarations = await readFile(
      new URL('../dist/contracts/index.d.ts', import.meta.url),
      'utf8',
    )
    const contractsPortDeclarations = await readFile(
      new URL('../dist/contracts/ports.d.ts', import.meta.url),
      'utf8',
    )
    const flowDeclarations = await readFile(
      new URL('../dist/core/domain/flows.d.ts', import.meta.url),
      'utf8',
    )
    const serviceDeclarations = await readFile(
      new URL('../dist/core/domain/service.d.ts', import.meta.url),
      'utf8',
    )
    const localAuthDeclarations = await readFile(
      new URL('../dist/core/domain/local-auth.d.ts', import.meta.url),
      'utf8',
    )
    const viewDeclarations = await readFile(
      new URL('../dist/core/domain/views.d.ts', import.meta.url),
      'utf8',
    )
    const repositoryPortDeclarations = await readFile(
      new URL('../dist/core/ports/repositories.d.ts', import.meta.url),
      'utf8',
    )
    const contractsRuntimeDeclarations = await readFile(
      new URL('../dist/contracts/runtime.d.ts', import.meta.url),
      'utf8',
    )
    const testingKitDeclarations = await readFile(
      new URL('../dist/testing/in-memory/kit.d.ts', import.meta.url),
      'utf8',
    )

    expect(contractsDeclarations).toContain('AuthServiceInfrastructure')
    expect(serviceDeclarations).toContain('export interface PublicAuthResult')
    expect(serviceDeclarations).toContain('export interface AuthPublicFacade')
    expect(serviceDeclarations).toContain('export interface AuthAccountFacade')
    expect(serviceDeclarations).toContain('export interface AuthAdminFacade')
    expect(serviceDeclarations).toContain('readonly public: AuthPublicFacade')
    const publicFacadeDeclaration = extractInterfaceDeclaration(
      serviceDeclarations,
      'AuthPublicFacade',
    )
    const accountFacadeDeclaration = extractInterfaceDeclaration(
      serviceDeclarations,
      'AuthAccountFacade',
    )
    const publicAuthResultDeclaration = extractInterfaceDeclaration(
      serviceDeclarations,
      'PublicAuthResult',
    )
    const currentAccountRecentAuthMarkerDeclaration = extractInterfaceDeclaration(
      flowDeclarations,
      'CurrentAccountRecentAuthMarker',
    )
    expect(publicFacadeDeclaration).not.toMatch(/Promise<(AuthResult|Verification|Credential)>/u)
    expect(accountFacadeDeclaration).not.toMatch(
      /Promise<(User|AuthIdentity|LinkResult|Verification|Credential|AuditEventPage|CloseCurrentAccountByTokenResult)>/u,
    )
    expect(publicAuthResultDeclaration).not.toMatch(/tokenHash|passwordHash|secretHash/u)
    expect(currentAccountRecentAuthMarkerDeclaration).toContain('readonly markerId: string')
    expect(serviceDeclarations).toContain('export interface AccountLinkResult')
    expect(serviceDeclarations).toContain('export interface AccountClosureResult')
    expect(serviceDeclarations).toContain('export interface AccountAuditEventPage')
    expect(contractsDeclarations).toContain('PasswordPolicy')
    expect(viewDeclarations).toContain('export interface CurrentAccountSecuritySnapshot')
    expect(viewDeclarations).toContain('export interface CurrentAccountInspectionSnapshot')
    expect(viewDeclarations).toContain('export interface CurrentAccountClosureExportSnapshot')
    expect(flowDeclarations).toContain('export interface GetCurrentAccountSecuritySnapshotInput')
    expect(flowDeclarations).toContain('export interface GetCurrentAccountInspectionSnapshotInput')
    expect(flowDeclarations).toContain(
      'export interface GetCurrentAccountClosureExportSnapshotInput',
    )
    expect(flowDeclarations).toContain('export interface GetCurrentAccountAuditEventPageInput')
    expect(flowDeclarations).toContain('export interface GetCurrentAccountReAuthStatusInput')
    expect(flowDeclarations).toContain('export interface CurrentAccountReAuthStatus')
    expect(flowDeclarations).toContain('export interface AssertCurrentAccountReAuthInput')
    expect(flowDeclarations).toContain('export interface CurrentAccountReAuthAssertion')
    expect(flowDeclarations).toContain('export interface StartCurrentAccountOtpReAuthInput')
    expect(flowDeclarations).toContain('export interface ResendCurrentAccountOtpReAuthInput')
    expect(flowDeclarations).toContain('export interface CancelCurrentAccountOtpReAuthInput')
    expect(flowDeclarations).toContain('export interface FinishCurrentAccountOtpReAuthInput')
    expect(flowDeclarations).toContain('export type CurrentAccountOtpReAuthConfirmation')
    expect(flowDeclarations).toContain('export interface LinkCurrentIdentityByTokenInput')
    expect(flowDeclarations).toContain('export interface UnlinkCurrentIdentityByTokenInput')
    expect(flowDeclarations).toContain('export interface UpdateCurrentAccountProfileByTokenInput')
    expect(flowDeclarations).toContain('export interface StartCurrentAccountContactChangeInput')
    expect(flowDeclarations).toContain('export interface ResendCurrentAccountContactChangeInput')
    expect(flowDeclarations).toContain('export interface CancelCurrentAccountContactChangeInput')
    expect(flowDeclarations).toContain('export interface FinishCurrentAccountContactChangeInput')
    expect(flowDeclarations).toContain('export interface RevokeOwnedSessionByTokenResult')
    expect(flowDeclarations).toContain('export interface RevokeOtherSessionsByTokenResult')
    expect(serviceDeclarations).toContain(
      'linkCurrentIdentityByToken(input: LinkCurrentIdentityByTokenInput): Promise<LinkResult>',
    )
    expect(serviceDeclarations).toContain(
      'resendCurrentAccountOtpReAuth(input: ResendCurrentAccountOtpReAuthInput): Promise<StartOtpChallengeResult>',
    )
    expect(serviceDeclarations).toContain(
      'cancelCurrentAccountOtpReAuth(input: CancelCurrentAccountOtpReAuthInput): Promise<Verification>',
    )
    expect(serviceDeclarations).toContain(
      'finishCurrentAccountOtpReAuth(input: FinishCurrentAccountOtpReAuthInput): Promise<CurrentAccountOtpReAuthConfirmation>',
    )
    expect(localAuthDeclarations).toContain(
      'export interface SetCurrentAccountPasswordByTokenInput',
    )
    expect(localAuthDeclarations).toContain(
      'export interface ConfirmCurrentAccountPasswordByTokenInput',
    )
    expect(localAuthDeclarations).toContain('export type CurrentAccountPasswordReAuthConfirmation')
    expect(localAuthDeclarations).toContain(
      'export interface ChangeCurrentAccountPasswordByTokenInput',
    )
    expect(serviceDeclarations).toContain(
      'getCurrentAccountSecuritySnapshot(input: GetCurrentAccountSecuritySnapshotInput)',
    )
    expect(serviceDeclarations).toContain(
      'getCurrentAccountInspectionSnapshot(input: GetCurrentAccountInspectionSnapshotInput)',
    )
    expect(serviceDeclarations).toContain(
      'getCurrentAccountClosureExportSnapshot(input: GetCurrentAccountClosureExportSnapshotInput)',
    )
    expect(serviceDeclarations).toContain(
      'getCurrentAccountAuditEventPage(input: GetCurrentAccountAuditEventPageInput)',
    )
    expect(serviceDeclarations).toContain(
      'getCurrentAccountReAuthStatus(input: GetCurrentAccountReAuthStatusInput)',
    )
    expect(serviceDeclarations).toContain(
      'assertCurrentAccountReAuth(input: AssertCurrentAccountReAuthInput)',
    )
    expect(serviceDeclarations).toContain(
      'startCurrentAccountOtpReAuth(input: StartCurrentAccountOtpReAuthInput)',
    )
    expect(serviceDeclarations).toContain(
      'revokeOwnedSessionByToken(input: RevokeOwnedSessionByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'revokeOtherSessionsByToken(input: RevokeOtherSessionsByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'unlinkCurrentIdentityByToken(input: UnlinkCurrentIdentityByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'updateCurrentAccountProfileByToken(input: UpdateCurrentAccountProfileByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'startCurrentAccountContactChange(input: StartCurrentAccountContactChangeInput)',
    )
    expect(serviceDeclarations).toContain(
      'resendCurrentAccountContactChange(input: ResendCurrentAccountContactChangeInput)',
    )
    expect(serviceDeclarations).toContain(
      'cancelCurrentAccountContactChange(input: CancelCurrentAccountContactChangeInput)',
    )
    expect(serviceDeclarations).toContain(
      'finishCurrentAccountContactChange(input: FinishCurrentAccountContactChangeInput)',
    )
    expect(serviceDeclarations).toContain(
      'setCurrentAccountPasswordByToken(input: SetCurrentAccountPasswordByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'confirmCurrentAccountPasswordByToken(input: ConfirmCurrentAccountPasswordByTokenInput)',
    )
    expect(serviceDeclarations).toContain(
      'changeCurrentAccountPasswordByToken(input: ChangeCurrentAccountPasswordByTokenInput)',
    )
    expect(contractsDeclarations).toContain('UserUpdatePatch')
    expect(contractsPortDeclarations).toContain('export interface UserUpdatePatch')
    expect(contractsPortDeclarations).toContain('export interface IdentityUpdatePatch')
    expect(contractsPortDeclarations).toContain('export interface CredentialUpdatePatch')
    expect(contractsPortDeclarations).toContain('export interface VerificationUpdatePatch')
    expect(contractsPortDeclarations).toContain('export interface SessionUpdatePatch')
    expect(contractsPortDeclarations).toContain('update(id: UserId, patch: UserUpdatePatch)')
    expect(repositoryPortDeclarations).toContain('UserUpdatePatch')
    expect(repositoryPortDeclarations).not.toContain("Partial<Omit<User, 'id' | 'createdAt'>>")
    expect(contractsRuntimeDeclarations).toContain('export interface AuthNormalizer')
    expect(contractsRuntimeDeclarations).toContain('export interface SecretHasher')
    expect(testingKitDeclarations).not.toContain('export interface InMemoryAuthKit')
    expect(testingKitDeclarations).toContain('export interface CreateInMemoryAuthKitOptions')
  })

  it('keeps internal application helpers private', () => {
    const privateOptionalSubpath = `${packageMetadata.name}/application/optional.js`
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import(${JSON.stringify(privateOptionalSubpath)})`],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED')
  })

  it('keeps internal provider adapter modules private', () => {
    for (const privateProviderSubpath of [
      `${packageMetadata.name}/bridges`,
      `${packageMetadata.name}/contracts/runtime.js`,
      `${packageMetadata.name}/messenger.js`,
      `${packageMetadata.name}/oauth-oidc.js`,
      `${packageMetadata.name}/providers/messenger`,
      `${packageMetadata.name}/providers/oauth-oidc`,
      `${packageMetadata.name}/providers/messenger.js`,
      `${packageMetadata.name}/providers/oauth-oidc.js`,
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `await import(${JSON.stringify(privateProviderSubpath)})`,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED')
    }
  })
})

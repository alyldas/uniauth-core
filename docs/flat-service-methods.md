# Flat Service Method Compatibility

The canonical service API is grouped by security boundary:

- `auth.public.*` for anonymous or public authentication flows;
- `auth.account.*` for current-account operations that require a session token;
- `auth.admin.*` for trusted backend administration and inspection flows.

The older flat methods on `AuthService` and `DefaultAuthService` remain available as compatibility
surface before `1.0.0`. They should not be used in new docs, examples, or application code unless a
test is explicitly covering compatibility.

## Compatibility Decision

Keep the flat methods implemented for now. Do not remove or rename them without an explicit
breaking-change decision before `1.0.0`.

If removal is approved later, mark it as a breaking API change and provide migration notes from each
flat method group to `auth.public`, `auth.account`, or `auth.admin`.

## Inventory

Public authentication compatibility methods:

- `signIn`
- `signInWithPassword`
- `startOtpChallenge`
- `resendOtpChallenge`
- `finishOtpChallenge`
- `finishOtpSignIn`
- `startEmailMagicLinkSignIn`
- `resendEmailMagicLinkSignIn`
- `finishEmailMagicLinkSignIn`
- `startEmailPasswordRecovery`
- `resendEmailPasswordRecovery`
- `finishEmailPasswordRecovery`

Current-account compatibility methods:

- `resolveSessionContext`
- `getCurrentAccountReAuthStatus`
- `assertCurrentAccountReAuth`
- `startCurrentAccountOtpReAuth`
- `resendCurrentAccountOtpReAuth`
- `cancelCurrentAccountOtpReAuth`
- `finishCurrentAccountOtpReAuth`
- `linkCurrentIdentityByToken`
- `revokeCurrentSessionByToken`
- `revokeOwnedSessionByToken`
- `revokeOtherSessionsByToken`
- `unlinkCurrentIdentityByToken`
- `closeCurrentAccountByToken`
- `updateCurrentAccountProfileByToken`
- `startCurrentAccountContactChange`
- `resendCurrentAccountContactChange`
- `cancelCurrentAccountContactChange`
- `finishCurrentAccountContactChange`
- `setCurrentAccountPasswordByToken`
- `confirmCurrentAccountPasswordByToken`
- `changeCurrentAccountPasswordByToken`

Administrative and support compatibility methods:

- `link`
- `unlink`
- `mergeAccounts`
- `revokeSession`
- `revokeUserSessions`
- `resolveSession`
- `touchSession`
- `getUser`
- `getUserIdentities`
- `getUserCredentials`
- `getUserSessions`
- `getAuditEvents`
- `getAuditEventPage`
- `getAccountSecuritySnapshot`
- `getAccountInspectionSnapshot`
- `createSession`
- `createVerification`
- `cancelVerification`
- `getVerification`
- `getVerificationResendWindow`
- `consumeVerification`
- `cancelOtpChallenge`
- `cancelEmailMagicLinkSignIn`
- `cancelEmailPasswordRecovery`

Local password compatibility methods:

- `setPassword`
- `changePassword`

## Documentation Rule

Examples and guides should demonstrate the grouped facade first. Flat methods may appear only in
compatibility notes, tests, or migration material.

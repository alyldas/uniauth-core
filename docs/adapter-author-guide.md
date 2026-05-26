# Adapter Author Guide

Use this guide when building packages around `@alyldas/uniauth-core`.

UniAuth is the headless auth core. Adapters integrate storage, transport, framework, or UI-adjacent
runtime environments without copying auth behavior from the core package.

## Allowed Public Imports

Adapters must import only documented public package entry points.

Allowed imports:

```ts
import { DefaultAuthService, UniAuthError, isUniAuthError } from '@alyldas/uniauth-core'
import type { AuthServiceRepositories, SessionRepo } from '@alyldas/uniauth-core/contracts'
```

Allowed entry points for adapter packages:

- `@alyldas/uniauth-core` for public service classes, domain types, errors, policy helpers, and safe
  utility functions;
- `@alyldas/uniauth-core/contracts` for implementation-neutral ports and runtime contracts.

Other public subpath exports, such as `@alyldas/uniauth-core/testing`, may be useful for tests, but
new external adapters should not couple their runtime implementation to another adapter package.

Forbidden imports:

```ts
import type { UserRepo } from '@alyldas/uniauth-core/dist/core/ports/repositories.js'
import { createUserId } from '@alyldas/uniauth-core/src/core/utils/ids.js'
```

Do not import from:

- `src/**`;
- `dist/**` internals;
- private test fixtures;
- another adapter package's internal files.

If an adapter needs a symbol that is not publicly exported, change the public contract intentionally
in `@alyldas/uniauth-core` before depending on it.

## Adapter Types

### Storage adapters

Storage adapters implement persistence ports. They do not make authentication decisions.

A full storage adapter should implement:

- `UserRepo`;
- `IdentityRepo`;
- `CredentialRepo`;
- `VerificationRepo`;
- `SessionRepo`;
- `AuditLogRepo`;
- `UnitOfWork` when the backend supports transactional writes.

The complete repository bundle should satisfy:

```ts
import type { AuthServiceRepositories, UnitOfWork } from '@alyldas/uniauth-core/contracts'

export interface ExampleAuthStore extends AuthServiceRepositories, UnitOfWork {}
```

Storage adapters must preserve core semantics:

- return `undefined` for missing records instead of throwing not-found errors;
- keep `create(...)` and `update(...)` return values aligned with the persisted record shape;
- persist core-owned fields explicitly, including verification `provider`, `channel`, `status`,
  `expiresAt`, and `consumedAt`;
- preserve hashed secrets and token hashes without exposing raw secrets;
- support atomic account merge, link, unlink, session, and verification writes through
  `UnitOfWork` where the storage backend can do so;
- keep database-specific errors behind adapter-level mapping unless the caller intentionally opts
  into raw diagnostics.

Storage adapters must not:

- verify passwords;
- decide account-linking policy;
- issue cookies;
- parse HTTP requests;
- send email or SMS;
- implement UI or framework routes.

### Framework and HTTP adapters

Framework adapters translate HTTP requests into calls to an application-provided UniAuth service.

They may own:

- router or middleware composition;
- request body validation;
- cookie and bearer token extraction;
- CSRF integration points;
- HTTP error mapping;
- typed route contracts.

They must call the grouped service surface:

- `auth.public.*` for unauthenticated sign-in, OTP, magic-link, and password-recovery routes;
- `auth.account.*` for current-account self-service routes after trusted session-token resolution;
- `auth.admin.*` for trusted backend or operator routes.

Framework adapters must not:

- construct database adapters implicitly;
- access the database directly;
- duplicate auth business logic;
- depend on a specific ORM;
- own provider SDK callback state beyond request parsing and handoff.

Service construction stays application-owned. An Express adapter, for example, should receive the
service or grouped facades from the application and compose routes around them.

### Frontend and SSR adapters

Frontend and SSR adapters call a backend auth API. They are not auth servers.

They may own:

- client composables;
- SSR-safe current-user helpers;
- route middleware for protected pages;
- runtime config for backend API base URLs;
- login, logout, refresh, and session fetch wrappers.

They must not:

- verify passwords;
- finish OTP challenges locally;
- persist sessions in a database;
- import storage adapters;
- implement core auth policy.

## Error Handling

Adapters should use public error helpers from the root package.

Useful imports:

```ts
import {
  UniAuthError,
  UniAuthErrorCode,
  getRateLimitedErrorDetails,
  isUniAuthError,
} from '@alyldas/uniauth-core'
```

HTTP adapters should keep user-facing failures neutral. For example, invalid credentials, unknown
accounts, expired secrets, and policy-denied sign-in attempts should not reveal account existence
unless the application explicitly documents a trusted operator flow.

Storage adapters should avoid leaking database driver errors as auth-domain decisions. Preserve
diagnostic data for logs where appropriate, but map expected constraint conflicts or missing records
into the behavior required by the repository contract.

## Local Development Against Core

External adapter repositories may use a local core checkout during development:

```json
{
  "peerDependencies": {
    "@alyldas/uniauth-core": ">=0.1.0 <1"
  },
  "devDependencies": {
    "@alyldas/uniauth-core": "file:../uniauth-core"
  }
}
```

Before running adapter tests against local UniAuth, build `../uniauth-core` first:

```sh
cd ../uniauth-core
npm install
npm run build
```

Then return to the adapter repository:

```sh
npm install
npm test
```

Each adapter repository should keep this setup in its own `AGENTS.md`. Worktree setup scripts may
automate the same dependency installation and build steps for local development worktrees.

## Test Expectations

Adapter tests should prove behavior at the public contract boundary.

Storage adapter tests should cover:

- CRUD behavior for every implemented repository port;
- identity lookup by provider user id, verified email, and verified phone;
- password credential lookup by email and user id;
- verification update and `findByIdForUpdate` behavior;
- session lookup by token hash and user id;
- audit event append and filtered list behavior;
- transactional rollback when `UnitOfWork` is implemented;
- parity with core expectations for link, unlink, merge, session, and verification flows.

Framework adapter tests should cover:

- request validation failures before service calls;
- neutral error mapping;
- cookie and bearer token transport;
- CSRF integration points where applicable;
- route calls to `auth.public`, `auth.account`, and `auth.admin` without database access.

Frontend and SSR adapter tests should cover:

- backend API request shape;
- SSR current-user helpers;
- client composable state transitions;
- logout and refresh behavior;
- protected-route middleware decisions.

## Contract Change Process

If an adapter cannot be implemented through public exports:

1. Document the missing contract in this repository.
2. Add or change the public export intentionally.
3. Update the compatibility notes in [Ecosystem package split](ecosystem-packages.md).
4. Add focused tests in the core repository.
5. Update the external adapter after the core contract is available.

Do not make external adapters depend on private internals as a temporary shortcut. That creates a
hidden release contract without tests or documentation.

## Related Documentation

- [Ecosystem package split](ecosystem-packages.md)
- [Package boundary cleanup](package-boundaries.md)
- [Backend integration recipes](backend-recipes.md)
- [Session transport recipes](session-transport.md)

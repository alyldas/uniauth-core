# Ecosystem Package Split

This document defines the external package split around `@alyldas/uniauth-core`.

It is a contract and repository-boundary document. It does not require runtime code changes in this
repository.

## Repository Model

Use separate normal git repositories, not submodules.

The local workspace may group those repositories in one parent directory:

```text
uniauth-ecosystem/
  uniauth-core/
  uniauth-drizzle/
  uniauth-express/
  uniauth-nuxt/
  uniauth-example-nuxt-express/
  uniauth-messenger-provider/
  uniauth-authjs-bridge/
  uniauth-better-auth-bridge/
  uniauth-oauth-oidc-provider/
```

The parent `uniauth-ecosystem/` directory is only a workspace folder. It should not be the source of
truth for commits, package versions, or release state.

Submodules are intentionally not used. They would add nested commit state, parent-repository pointer
updates, harder pull requests, and harder review without solving the current contract-stabilization
problem. Consider an umbrella repository only later, and only as a docs-only or script-only
coordination repository unless there is a strong need to pin every child repository to exact commits.

## Package Ownership

### `alyldas/uniauth-core`

`@alyldas/uniauth-core` remains the headless core.

It owns:

- domain model;
- service facades;
- policy;
- ports and contracts;
- errors;
- verification, session, account, and audit orchestration;
- public entry points such as `@alyldas/uniauth-core` and `@alyldas/uniauth-core/contracts`.

It must not absorb runtime responsibilities from external adapters:

- no UI;
- no framework route handlers;
- no Express, Fastify, Nest, Nuxt, or Next runtime integration;
- no Drizzle, Prisma, or ORM runtime dependency for external adapter needs;
- no SMTP, SMS, Redis, queue, or hosted infrastructure runtime dependency.

The core may keep reference docs, examples, contracts, and implementation-neutral test fixtures that
protect the public API.

### `alyldas/uniauth-drizzle`

`@alyldas/uniauth-drizzle` implements Drizzle-based persistence for UniAuth.

It owns:

- Drizzle schema mapping;
- repository implementations for UniAuth ports;
- Postgres-first persistence behavior;
- adapter tests for the expected repository semantics.

It must not own:

- auth business logic;
- password verification policy;
- sessions or account orchestration beyond repository persistence;
- HTTP routes;
- cookies;
- UI;
- Prisma or TypeORM integrations.

It must depend only on public UniAuth exports.

### `alyldas/uniauth-express`

`@alyldas/uniauth-express` implements Express routes and middleware on top of an application-provided
UniAuth service instance.

It owns:

- Express Router composition;
- request body validation;
- cookie and bearer session transport;
- error mapping;
- CSRF integration points;
- typed route contracts.

It must call the grouped service surface:

- `auth.public.*`;
- `auth.account.*`;
- `auth.admin.*`.

It must not own:

- auth business logic;
- database access;
- Drizzle-specific code;
- service construction policy that belongs to the application.

### `alyldas/uniauth-nuxt`

`@alyldas/uniauth-nuxt` implements Nuxt-side integration.

It is not the auth backend.

It may provide:

- Nuxt module setup;
- runtime config;
- server utilities for calling the backend auth API;
- composables such as `useAuth`, `useSession`, and `useCurrentUser`;
- route middleware for protected pages;
- SSR-safe helpers.

It must not implement:

- password verification;
- OTP validation;
- session persistence;
- database access;
- core auth policy.

Backend routes are provided by an external backend, for example an Express application using
`@alyldas/uniauth-express`.

### `alyldas/uniauth-example-nuxt-express`

`uniauth-example-nuxt-express` demonstrates the real integration path:

```text
Nuxt frontend
  -> Express backend
  -> UniAuth core
  -> Drizzle adapter
  -> Postgres
```

It owns application wiring, environment examples, and end-to-end usage documentation. It should not
be treated as the source of truth for core contracts.

### `alyldas/uniauth-messenger-provider`

`@alyldas/uniauth-messenger-provider` implements messenger provider adapters for UniAuth.

It owns:

- Telegram Mini App assertion normalization;
- Max WebApp assertion normalization;
- shared messenger provider helpers;
- provider-specific validation inputs and stable provider IDs.

It must not own:

- HTTP framework handlers;
- session transport;
- database persistence;
- core account orchestration;
- application bot setup or webhook lifecycle.

Messenger adapters should return `ProviderIdentityAssertion` data for the application to pass into
UniAuth core. Applications still own transport security, bot secret management, and provider
callback wiring.

### `alyldas/uniauth-authjs-bridge`

`@alyldas/uniauth-authjs-bridge` maps Auth.js OAuth/OIDC account and profile data into UniAuth
provider assertions.

It owns:

- Auth.js account/profile shape normalization;
- OAuth/OIDC account type checks;
- safe copying of identity fields.

It must not own:

- Auth.js session strategy;
- token persistence;
- provider SDK configuration;
- UniAuth service construction.

### `alyldas/uniauth-better-auth-bridge`

`@alyldas/uniauth-better-auth-bridge` maps Better Auth OAuth account and profile data into UniAuth
provider assertions.

It owns:

- Better Auth OAuth account/profile shape normalization;
- safe copying of identity fields;
- a narrow bridge surface for application-owned sign-in flows.

It must not own:

- Better Auth runtime configuration;
- token persistence;
- session ownership;
- UniAuth service construction.

### `alyldas/uniauth-oauth-oidc-provider`

`@alyldas/uniauth-oauth-oidc-provider` provides SDK-free OAuth/OIDC provider adapter helpers.

It owns:

- OAuth/OIDC callback result normalization;
- provider assertion creation;
- optional token metadata output for application-owned storage.

It must not own:

- OAuth client SDK runtime;
- redirect route handlers;
- token storage;
- refresh scheduling;
- session transport;
- database persistence.

## Backend Boundary

The backend is not the Nuxt module.

The intended production shape is:

```text
Nuxt app
  -> HTTP
Express backend
  -> UniAuth core
  -> Drizzle adapter
  -> Postgres
```

Nuxt helpers may expose client and SSR workflows such as:

- `useSession()`;
- `useCurrentUser()`;
- `login()`;
- `logout()`;
- `refreshSession()`;
- server-side current-user fetches;
- protected-page middleware.

Concrete auth routes live in the backend package or the application that uses it:

- `POST /auth/password/sign-in`;
- `POST /auth/otp/start`;
- `POST /auth/otp/finish`;
- `GET /me`;
- `POST /account/password/change`.

## Dependency Rules

External packages must depend only on public UniAuth exports.

Allowed examples:

- `@alyldas/uniauth-core`;
- `@alyldas/uniauth-core/contracts`;
- other documented public subpath exports when the package intentionally supports them.

Forbidden examples:

- imports from `src/**`;
- imports from generated `dist/**` internals;
- imports from private test fixtures;
- changes to private core internals only to satisfy an external adapter.

External packages should express core as a peer dependency:

```json
{
  "peerDependencies": {
    "@alyldas/uniauth-core": ">=0.1.0 <1"
  }
}
```

During local development, an adapter may point its dev dependency at the adjacent core checkout:

```json
{
  "devDependencies": {
    "@alyldas/uniauth-core": "file:../uniauth-core"
  }
}
```

That local file dependency requires the core package to be built first:

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

Each adapter repository should document that setup in its own `AGENTS.md`.

## Work Planning

Use one thread and one worktree per repository and per pull request:

```text
1 thread = 1 repo = 1 PR
```

Use a separate planner thread for ecosystem coordination. The planner may update docs such as
`docs/ecosystem-plan.md`, repository order, contract notes, version policy, and compatibility
matrices. It should not change runtime code.

Implementation threads should stay scoped:

- core thread: public contracts, adapter author guide, external package requirements;
- Drizzle thread: Drizzle storage adapter against public contracts;
- Express thread: routers and middleware over `auth.public`, `auth.account`, and `auth.admin`;
- Nuxt thread: client, SSR, and module helpers that call the backend API;
- example thread: Nuxt, Express, Drizzle, and Postgres wiring;
- messenger provider thread: Telegram, Max, and shared messenger assertion normalization;
- Auth.js bridge thread: Auth.js OAuth/OIDC account/profile mapping;
- Better Auth bridge thread: Better Auth OAuth account/profile mapping;
- OAuth/OIDC provider thread: SDK-free provider assertion helpers.

## Compatibility Matrix

Maintain compatibility expectations in docs before releases are coordinated across repositories.

Initial matrix:

| Package                                | Depends on                 | Must not depend on               | Contract source                        |
| -------------------------------------- | -------------------------- | -------------------------------- | -------------------------------------- |
| `@alyldas/uniauth-core`                | none of the external repos | external adapters or UI packages | local public exports                   |
| `@alyldas/uniauth-drizzle`             | `@alyldas/uniauth-core`    | Express, Nuxt, Prisma            | `@alyldas/uniauth-core/contracts`      |
| `@alyldas/uniauth-express`             | `@alyldas/uniauth-core`    | Drizzle, Nuxt, direct DB access  | grouped service facades                |
| `@alyldas/uniauth-nuxt`                | backend HTTP API           | database adapters, auth logic    | backend route contract                 |
| `uniauth-example-nuxt-express`         | all published packages     | private internals                | released package versions and app docs |
| `@alyldas/uniauth-messenger-provider`  | `@alyldas/uniauth-core`    | HTTP handlers, persistence       | provider assertion contract            |
| `@alyldas/uniauth-authjs-bridge`       | `@alyldas/uniauth-core`    | token storage, sessions          | provider assertion contract            |
| `@alyldas/uniauth-better-auth-bridge`  | `@alyldas/uniauth-core`    | token storage, sessions          | provider assertion contract            |
| `@alyldas/uniauth-oauth-oidc-provider` | `@alyldas/uniauth-core`    | SDK runtime, route handlers      | provider assertion contract            |

Version policy should stay conservative until `1.0.0`: external packages use peer ranges broad
enough for compatible pre-`1.0.0` releases, but each repository's tests should pin concrete local or
published versions during development.

## Cross-Repository Check Order

For cross-repository checks, build and verify upstream packages before packages that consume their
local `dist` output:

1. `uniauth-core`;
2. adapters, providers, and bridges:
   - `uniauth-drizzle`;
   - `uniauth-authjs-bridge`;
   - `uniauth-better-auth-bridge`;
   - `uniauth-messenger-provider`;
   - `uniauth-oauth-oidc-provider`;
3. transport and integration packages:
   - `uniauth-express`;
   - `uniauth-nuxt`;
4. `uniauth-example-nuxt-express`.

Do not check `uniauth-example-nuxt-express` in parallel with upstream package rebuilds that clean
`dist`, especially `uniauth-nuxt`. Build upstream packages first, then run the example check or live
smoke flow as a separate step.

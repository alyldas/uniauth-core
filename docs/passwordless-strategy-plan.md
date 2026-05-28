# Passwordless Strategy Plan

## Summary

Public user authentication should be passwordless-first. Email OTP and magic-link flows should be
the primary public sign-in paths, while password sign-in remains optional and is mostly reserved for
future admin or internal flows.

`@alyldas/uniauth-core` should keep the authentication primitives and security invariants. External
strategy packages may own transport-specific passwordless flows, route composition, validation, safe
response projection, and documentation for concrete application integration.

## Background

A downstream Vue/Vite SPA dogfooding pass clarified the next product boundary:

- The downstream app used a Vue 3 and Vite SPA, not Nuxt.
- The backend used Express.
- The split backend packages worked with `@alyldas/uniauth-core`, `@alyldas/uniauth-drizzle`, and
  `@alyldas/uniauth-express`.
- Password sign-in was used only as a smoke test.
- Nuxt integration was skipped because the app was not Nuxt.
- The SPA needed an application-owned auth client.
- The full `@alyldas/uniauth-express` router exposed raw session data in the account/session flow,
  which made safe response projection important for public routes.

The follow-up design should therefore optimize for framework-neutral browser applications and
backend transport packages without moving passwordless lifecycle rules out of core.

## Authentication vs Authorization

Authentication proves who the actor is. UniAuth authentication primitives include:

- OTP;
- magic link;
- password;
- OAuth;
- Telegram/MAX.

Authorization decides what an authenticated actor can do. Application authorization includes:

- roles;
- permissions;
- admin access;
- RBAC;
- ABAC;
- product and business access rules.

Roles and permissions should stay application-owned for now. Do not add RBAC or ABAC to
`@alyldas/uniauth-core`.

## What Stays In Core

`@alyldas/uniauth-core` should continue to own the stable auth domain primitives:

- verification lifecycle;
- session lifecycle;
- identity and account logic;
- OTP primitives;
- magic-link primitives;
- password primitives;
- account linking, unlinking, and merge security invariants;
- current-account security helpers;
- audit and security events;
- public contracts.

Do not create separate packages such as `@alyldas/uniauth-otp-core`,
`@alyldas/uniauth-magic-link-core`, or `@alyldas/uniauth-session-core`. Those would split the auth
lifecycle without creating a clearer application boundary.

## What Moves To Strategy Packages

Strategy packages are integration and transport packages, not core logic packages. They may compose
core primitives into a concrete application-facing sign-in strategy.

Strategy packages may own:

- Express routes;
- request validation;
- neutral public responses;
- safe response projection;
- cookie writing when configured;
- adapter-specific route composition;
- documentation for a concrete auth strategy.

Strategy packages must not own:

- database lifecycle;
- Drizzle setup;
- SMTP provider runtime;
- OAuth provider runtime;
- UI;
- roles or permissions;
- admin authorization;
- core verification or session lifecycle.

## Proposed Package: `@alyldas/uniauth-express-passwordless`

Repository: `alyldas/uniauth-express-passwordless`

Package: `@alyldas/uniauth-express-passwordless`

Purpose: an Express strategy package for passwordless public sign-in.

Peer dependencies:

- `@alyldas/uniauth-core`;
- `@alyldas/uniauth-express`;
- `express`.

Runtime ownership:

- receives an application-provided UniAuth service;
- receives application-owned sender and runtime configuration indirectly through core service setup;
- receives explicit session and cookie options;
- returns safe public responses.

The package should not create its own UniAuth service, database adapter, sender provider, OAuth
runtime, or UI layer.

## Initial Route Scope

The first stage should support email OTP only:

- `POST /auth/email-otp/start`;
- `POST /auth/email-otp/sign-in`;
- `GET /auth/account/session`;
- `POST /auth/account/sessions/revoke-current`.

Optional:

- `POST /auth/account/session/refresh`, if session refresh should stay close to the session
  strategy.

Magic link should be a second stage:

- `POST /auth/magic-link/start`;
- `POST /auth/magic-link/finish`;
- optional resend route if supported by core.

## Safe Response Model

Public responses must not expose raw internal fields.

Do not return:

- `tokenHash`;
- `passwordHash`;
- `secretHash`;
- raw verification secret;
- provider tokens;
- raw provider payloads.

Return only safe user and session views. Public routes should project account, session, and
verification state into stable response shapes that are safe for browser clients.

Downstream SPA dogfooding showed that account/session routes need safe projection before they are
used as public application APIs.

## Downstream SPA Follow-up

Future downstream SPA follow-up work should:

- remove public password smoke UI in downstream apps;
- keep password sign-in only for possible admin or internal flows later;
- add an email OTP smoke UI;
- keep browser SPA auth clients application-owned until repeated usage proves a shared package is
  needed;
- avoid migrating non-Nuxt apps to Nuxt just for auth;
- avoid adding `@alyldas/uniauth-vue` yet.

## Admin Password Later

Password sign-in may be used later for an admin-only flow, but only after application-owned roles
and admin guards exist.

Admin authorization remains application-owned. UniAuth core should not decide which account is an
administrator or which product permissions an authenticated actor has.

## Do Not Build Yet

Do not create these packages or products yet:

- `@alyldas/uniauth-vue`;
- `@alyldas/uniauth-access`;
- `@alyldas/uniauth-otp-core`;
- `@alyldas/uniauth-magic-link-core`;
- `@alyldas/uniauth-session-core`;
- hosted auth service.

Do not create a new repository, npm package, runtime route implementation, dependency, or package
metadata change as part of this design step.

## Open Questions

- Should magic-link finish be GET or POST?
- Should OTP start return `verificationId` directly or an opaque challenge id?
- Should the strategy package own cookie writing or expose results for application-owned cookie
  writing?
- Should session refresh live in base `@alyldas/uniauth-express` or in the passwordless strategy
  package?
- How should rate-limit metadata be exposed safely?
- Should email OTP and magic link live in one passwordless package or separate packages later?

## Decision

- Do not split OTP or magic-link core primitives out of `@alyldas/uniauth-core`.
- Do not add roles or permissions to core.
- Plan an external Express passwordless strategy package after fixing safe response projection in
  `@alyldas/uniauth-express`.
- Start with email OTP before magic link.
- Keep downstream browser SPA clients application-owned until repeated usage proves a package is
  needed.

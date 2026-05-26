# Comparison

## Better Auth and Auth.js

Better Auth and Auth.js are application auth frameworks. They can own provider integration,
framework integration, route handling, session transport, and application-facing auth flows.

`@alyldas/uniauth-core` is lower-level. It focuses on the identity domain and policy-driven orchestration:

- local users with multiple identities;
- no email-centric user requirement;
- explicit linking and merge policy;
- storage/provider ports;
- framework-neutral sessions and audit events.

## Intended Relationship

Bridge mapping for those frameworks belongs in application code or a dedicated integration package.
Core accepts the resulting `ProviderIdentityAssertion`, but it does not publish framework-specific
bridge helpers, become the primary session engine, own routes, own cookies, or store framework
tokens.

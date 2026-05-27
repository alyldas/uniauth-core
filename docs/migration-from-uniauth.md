# Migration from Archived `@alyldas/uniauth`

The archived `@alyldas/uniauth` package was split into explicit packages that each own a narrower
integration boundary. Migrate consumers to the package that owns the integration they use instead of
depending on the archived monolith.

| Old import/package                      | New package                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `@alyldas/uniauth`                      | `@alyldas/uniauth-core`                                                   |
| `@alyldas/uniauth/testing`              | `@alyldas/uniauth-core/testing`                                           |
| `@alyldas/uniauth/contracts`            | `@alyldas/uniauth-core/contracts`                                         |
| `@alyldas/uniauth/postgres`             | `@alyldas/uniauth-drizzle`                                                |
| `@alyldas/uniauth/providers/messenger`  | `@alyldas/uniauth-messenger-provider`                                     |
| `@alyldas/uniauth/providers/oauth-oidc` | `@alyldas/uniauth-oauth-oidc-provider`                                    |
| `@alyldas/uniauth/bridges`              | `@alyldas/uniauth-authjs-bridge` or `@alyldas/uniauth-better-auth-bridge` |

This migration does not imply full backward compatibility. Review the destination package
documentation and adapt imports, construction, runtime configuration, and tests to the explicit
package boundary.

Runtime wiring remains application-owned. Provider tokens, cookies, session transport, database
lifecycle, OAuth state, nonce, PKCE, CSRF, queues, SMTP/SMS runtime, and UI remain application-owned
unless a specific adapter documents otherwise.

External adapters, providers, bridges, and examples live in separate normal git repositories, not as
submodules. They should depend only on documented public core exports:

- `@alyldas/uniauth-core`
- `@alyldas/uniauth-core/contracts`
- `@alyldas/uniauth-core/testing`

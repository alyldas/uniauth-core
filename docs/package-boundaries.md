# Package Boundary Cleanup

UniAuth stays in one repository and one npm package until the public API is stable enough for
`1.0.0`. The cleanup target is to make package boundaries explicit before considering npm
workspaces, package extraction, or separate repositories.

This is an API stabilization plan, not a feature expansion plan.

## Boundary Target

The root package entry point should be the core API:

- service construction and default service implementation;
- grouped service facades under `auth.public`, `auth.account`, and `auth.admin`;
- domain types and views;
- policy helpers;
- errors;
- core ports and contracts needed by normal consumers;
- safe utilities and attribution metadata.

Optional integrations should stay behind explicit subpath imports:

- `@alyldas/uniauth-core/contracts`;
- `@alyldas/uniauth-core/testing`.

The root entry point should not become a catch-all export surface for provider helpers, storage
adapters, testing utilities, framework handlers, framework bridges, or examples.

## Repository Shape Before `1.0.0`

Use this staged approach:

1. Keep one repository.
2. Keep one npm package.
3. Make internal source boundaries explicit.
4. Make public entry points explicit.
5. Restrict root exports to the core surface.
6. Keep adapters, providers, and testing helpers behind subpath imports.
7. Consider npm workspaces only after the package API is stable.

Do not create separate packages, a monorepo, or separate repositories as part of the pre-`1.0.0`
boundary cleanup.

## Source Boundary Direction

The intended source layout is a modular package with explicit internal ownership:

- `src/core/**` owns application services, domain rules, policy, errors, ports, and safe utilities.
- `src/contracts/**` owns implementation-neutral public contracts.
- `src/testing/**` owns in-memory test support.
- `src/entrypoints/**` owns public package entry files.

Dependency direction should stay one-way:

- core may depend on core and contracts;
- contracts should stay implementation-neutral;
- adapters may depend on core and contracts;
- providers may depend on domain types, contracts, and safe utilities;
- testing may depend on core and contracts.

Core should not depend on adapters, providers, testing, framework bridges, or entrypoint files.

## Cleanup Sequence

Use small changes that keep `npm run check` green:

1. Document the boundary target.
2. Introduce explicit source entrypoint files without changing package exports.
3. Restrict the root entry point to core exports and keep optional helpers on subpaths.
4. Move source files gradually toward explicit boundary folders.
5. Add an import-boundary guard after the layout is stable.
6. Simplify the README around the canonical grouped API.
7. Decide the compatibility story for flat `AuthService` methods before `1.0.0`.

The flat method compatibility decision is documented in
[Flat service method compatibility](flat-service-methods.md).

Avoid mixing public API changes with large file moves.

## Future Workspace Criteria

Consider npm workspaces only after all of these are true:

- the `1.0.0` public API is stable;
- root exports are core-only;
- subpath imports are stable;
- import-boundary tests exist;
- storage adapters, testing helpers, providers, and framework bridges can change independently;
- separate package versions would reduce maintenance pressure rather than increase it.

Use npm workspaces if the repository becomes a monorepo. Do not migrate to another package manager
without a separate decision.

## Future Repository Split Criteria

Separate repositories should remain exceptional. Consider one only when a component has:

- independent maintainers;
- an independent release cadence;
- an independent issue tracker;
- minimal coupling to core internals;
- no need for atomic changes with core.

Current UniAuth components do not meet that threshold. Harden the current package subpath boundaries
before extracting repositories.

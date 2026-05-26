# Development

## Runtime

Use Node.js 22 for local development. The repository keeps `.node-version` as the local runtime
marker because Node.js 22 is the minimum supported runtime in `package.json`.

Keep `@types/node` on the same major line as the minimum supported Node.js runtime. Do not merge a
major `@types/node` update unless `engines.node`, Docker, CI, examples, and docs intentionally move
to the same new minimum runtime.

## Local Setup

```sh
npm ci
npm run check
```

The repository keeps npm cache and `_logs` in project-local `.npm-cache/` through `.npmrc` so
package checks do not depend on a writable home directory.

Use focused commands while developing:

```sh
npm run test
npm run typecheck
npm run lint
```

## Package Gate

`npm run check` is the local release gate. It runs dependency audit, formatting, ESLint,
local Markdown file, anchor, and image link checks, typecheck, 100% coverage, export smoke tests,
package lint, package type-resolution checks, and `npm pack --dry-run`.

Use Docker when you want the same package gate inside the pinned Node 22 Alpine image:

```sh
npm run check:docker
```

For the Docker Compose wrapper:

```sh
npm run check:compose
```

## CI Runs

The CI workflow runs on:

- `pull_request` for pull request validation;
- `push` to `main` after merge.

It does not run on every push to a pull request branch. That keeps PRs to one required `check`
instead of duplicate push and pull request checks for the same head commit.

The release workflow runs on pushes to `main`. Release Please creates or updates release PRs from
Conventional Commits and only publishes when a Release Please PR creates a `v*` tag.

GitHub can also show `Dependabot Updates` runs after `.github/dependabot.yml` changes. Those runs are
GitHub automation checks for Dependabot configuration, not package CI.

## Branch And Merge Policy

Use pull requests for `main`. The required status check is `check`, branches must be up to date
before merge, and conversations must be resolved before merge.

Use rebase merge for regular feature, API, security, and package-hygiene pull requests so useful
Conventional Commits reach `main`. Squash merge is acceptable for small single-purpose pull requests
and Release Please PRs. Merge commits are disabled.

Do not commit, amend, or force-push directly to `release-please--*` branches. Release changes must
land only by merging the Release Please PR into `main` after required checks pass and conversations
are resolved.

After merging, delete feature branches. The repository is configured to delete remote branches after
merge.

## Release Flow

Do not manually edit release metadata in regular development pull requests. Release Please owns:

- `package.json`;
- `package-lock.json`;
- `CHANGELOG.md`.

Before a release PR is merged, verify that the changelog entries are concrete and keep commit links
intact. If release metadata needs correction, update the source change on a normal branch, merge it
into `main`, and let Release Please refresh the release PR.

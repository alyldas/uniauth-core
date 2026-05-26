/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, readdirSync, readFileSync } = require('node:fs')
const { dirname, extname, join, normalize, relative, resolve, sep } = require('node:path')

const SOURCE_ROOT = resolve('src')
const IMPORT_PATTERN =
  /\b((?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"])/gu

const sourceFiles = listTypeScriptFiles(SOURCE_ROOT)
const violations = []

for (const filePath of sourceFiles) {
  const source = readFileSync(filePath, 'utf8')

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const statement = match[1]
    const specifier = match[2]
    const targetPath = resolveSourceImport(filePath, specifier)

    if (!targetPath) {
      continue
    }

    const violation = checkBoundary(filePath, targetPath, isTypeOnlyStatement(statement))

    if (violation) {
      violations.push(`${toRepoPath(filePath)} -> ${toRepoPath(targetPath)}: ${violation}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Import boundary violations found:')

  for (const violation of violations) {
    console.error(`- ${violation}`)
  }

  process.exit(1)
}

function listTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return listTypeScriptFiles(path)
    }

    return entry.isFile() && path.endsWith('.ts') ? [path] : []
  })
}

function resolveSourceImport(filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined
  }

  const resolved = resolve(dirname(filePath), specifier)
  const candidates = []

  if (extname(resolved) === '.js') {
    candidates.push(`${resolved.slice(0, -3)}.ts`)
  } else {
    candidates.push(`${resolved}.ts`)
  }

  candidates.push(join(resolved, 'index.ts'))

  for (const candidate of candidates) {
    if (existsSync(candidate) && candidate.startsWith(SOURCE_ROOT)) {
      return candidate
    }
  }

  return undefined
}

function checkBoundary(fromPath, toPath, isTypeOnly) {
  const from = classify(fromPath)
  const to = classify(toPath)

  if (isCoreBoundary(from)) {
    return !includesAny(to, [
      'core',
      'core/application',
      'core/domain',
      'core/utils',
      'core/errors',
      'core/ports',
      'contracts',
    ])
      ? 'core must not depend on optional integrations, testing, or entrypoints'
      : undefined
  }

  if (from === 'contracts') {
    if (!isTypeOnly) {
      return 'contracts may contain type-only imports and exports only'
    }

    if (!includesAny(to, ['contracts', 'core/domain'])) {
      return 'contracts must stay implementation-neutral'
    }
  }

  if (from === 'adapters/postgres') {
    return !includesAny(to, [
      'adapters/postgres',
      'core',
      'core/application',
      'core/domain',
      'core/utils',
      'core/errors',
      'core/ports',
      'contracts',
    ])
      ? 'Postgres adapter may depend only on core and contracts'
      : undefined
  }

  if (from === 'providers') {
    return !includesAny(to, ['providers', 'core/domain', 'core/utils', 'contracts'])
      ? 'providers may depend only on core domain, core utils, contracts, and provider-local modules'
      : undefined
  }

  if (from === 'bridges') {
    return !includesAny(to, ['bridges', 'core/domain', 'contracts'])
      ? 'bridges may depend only on core domain, contracts, and bridge-local modules'
      : undefined
  }

  if (from === 'testing') {
    return !includesAny(to, [
      'testing',
      'core',
      'core/application',
      'core/domain',
      'core/utils',
      'core/errors',
      'core/ports',
      'contracts',
    ])
      ? 'testing utilities may depend only on core, contracts, and testing-local modules'
      : undefined
  }

  return undefined
}

function classify(filePath) {
  const path = toRepoPath(filePath)

  if (path.startsWith('src/core/application/')) {
    return 'core/application'
  }

  if (path.startsWith('src/core/domain/')) {
    return 'core/domain'
  }

  if (path.startsWith('src/core/utils/')) {
    return 'core/utils'
  }

  if (path.startsWith('src/core/errors/')) {
    return 'core/errors'
  }

  if (path.startsWith('src/core/ports/')) {
    return 'core/ports'
  }

  if (path.startsWith('src/core/')) {
    return 'core'
  }

  if (path.startsWith('src/contracts/')) {
    return 'contracts'
  }

  if (path.startsWith('src/adapters/postgres/')) {
    return 'adapters/postgres'
  }

  if (path.startsWith('src/providers/')) {
    return 'providers'
  }

  if (path.startsWith('src/bridges/')) {
    return 'bridges'
  }

  if (path.startsWith('src/testing/')) {
    return 'testing'
  }

  if (path.startsWith('src/entrypoints/')) {
    return 'entrypoints'
  }

  return 'unknown'
}

function includesAny(value, expected) {
  return expected.includes(value)
}

function isCoreBoundary(value) {
  return includesAny(value, [
    'core',
    'core/application',
    'core/domain',
    'core/utils',
    'core/errors',
    'core/ports',
  ])
}

function isTypeOnlyStatement(statement) {
  return /\b(?:import|export)\s+type\b/u.test(statement)
}

function toRepoPath(filePath) {
  return normalize(relative(process.cwd(), filePath)).split(sep).join('/')
}

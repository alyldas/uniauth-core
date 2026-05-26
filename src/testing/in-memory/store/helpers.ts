import type { AuditEvent } from '../../../core/domain/types.js'

export function compareAuditEventsDescending(left: AuditEvent, right: AuditEvent): number {
  const occurredDifference = right.occurredAt.getTime() - left.occurredAt.getTime()

  if (occurredDifference !== 0) {
    return occurredDifference
  }

  return right.id.localeCompare(left.id)
}

export function applyPatch<Entity extends { readonly id: unknown }, Patch extends object>(
  existing: Entity,
  patch: Patch,
): Entity {
  const updated = { ...existing } as Record<string, unknown>

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete updated[key]
      continue
    }

    updated[key] = value
  }

  return updated as Entity
}

export function compositeKey(...parts: readonly string[]): string {
  return JSON.stringify(parts)
}

export function isOlderThanAuditCursor(
  event: AuditEvent,
  cursor: { readonly occurredAt: Date; readonly id: AuditEvent['id'] },
): boolean {
  const occurredDifference = event.occurredAt.getTime() - cursor.occurredAt.getTime()

  if (occurredDifference !== 0) {
    return occurredDifference < 0
  }

  return event.id.localeCompare(cursor.id) < 0
}

export function isNewerThanAuditCursor(
  event: AuditEvent,
  cursor: { readonly occurredAt: Date; readonly id: AuditEvent['id'] },
): boolean {
  const occurredDifference = event.occurredAt.getTime() - cursor.occurredAt.getTime()

  if (occurredDifference !== 0) {
    return occurredDifference > 0
  }

  return event.id.localeCompare(cursor.id) > 0
}

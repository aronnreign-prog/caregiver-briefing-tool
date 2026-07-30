/**
 * Strict UUID v4 validation.
 * Returns true only for valid UUID v4 strings.
 * Rejects 'undefined', 'null', empty strings, and malformed UUIDs.
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === 'undefined' || value === 'null' || value.trim() === '') return false
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return UUID_V4_REGEX.test(value)
}

/**
 * Sanitizes a value for JSON payload insertion.
 * Ensures undefined JS values are never serialized as the string "undefined".
 */
export function sanitizeForPayload<T>(value: T): Exclude<T, undefined> {
  if (value === undefined || value === null) {
    throw new Error(`sanitizeForPayload: received ${String(value)}, expected a concrete value`)
  }
  return value as Exclude<T, undefined>
}

/**
 * Builds a job payload with strict UUID validation on all ID fields.
 * Throws if any ID field is invalid.
 */
export function buildJobPayload(fields: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      throw new Error(`buildJobPayload: field "${key}" is ${String(value)}`)
    }
    if (key.endsWith('_id') || key === 'id') {
      if (!isValidUUID(value)) {
        throw new Error(`buildJobPayload: field "${key}" is not a valid UUID: ${String(value)}`)
      }
    }
    // Ensure no "undefined" or "null" strings leak into the payload
    if (typeof value === 'string' && (value === 'undefined' || value === 'null')) {
      throw new Error(`buildJobPayload: field "${key}" is the literal string "${value}"`)
    }
    sanitized[key] = String(value)
  }
  return sanitized
}
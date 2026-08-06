/**
 * Result<T,E> — unified error handling for Edge Functions and server actions.
 * Jeff Dean principle: fast path is inline; errors are handled at point of failure.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function errStr(message: string): Result<never, Error> {
  return { ok: false, error: new Error(message) }
}

/** Log a timing entry */
export function logTiming(label: string, startMs: number) {
  const dur = Date.now() - startMs
  console.log(`[timing] ${label}: ${dur}ms`)
  return dur
}

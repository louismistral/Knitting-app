// A tiny navigation guard: a screen (e.g. the project editor) can register an
// async handler that decides whether it's OK to leave. The bottom nav and any
// "back" button consult it before navigating away.

type Guard = () => Promise<boolean>

let guard: Guard | null = null

export function registerNavGuard(g: Guard | null): void {
  guard = g
}

/** Returns true if navigation is allowed to proceed. */
export async function runNavGuard(): Promise<boolean> {
  return guard ? guard() : true
}

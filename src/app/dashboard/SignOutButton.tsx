'use client'

import { authClient } from '@/lib/auth-client'

export default function SignOutButton() {
  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      onClick={handleSignOut}
      type="button"
      className="font-mono text-[11px] text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
    >
      Sign out
    </button>
  )
}

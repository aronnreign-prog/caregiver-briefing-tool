'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { createDemoUser, deleteDemoUser, banDemoUser, unbanDemoUser } from './actions'

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  banReason: string | null
  createdAt: string
  patientCount: number
  documentCount: number
}

interface Props {
  currentUserEmail: string
  users: UserItem[]
}

export function AdminClient({ currentUserEmail, users }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string
    password: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    let rand = ''
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const generated = `demo-${rand}`
    setPassword(generated)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setError(null)
    setCreatedCredentials(null)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('email', email)
    formData.append('password', password)

    try {
      const res = await createDemoUser(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.success) {
        setCreatedCredentials({
          email,
          password,
        })
        setName('')
        setEmail('')
        setPassword('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(userId: string, userEmail: string) {
    if (userEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
      alert('You cannot delete your own admin account.')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete demo account for ${userEmail}? This will wipe their patients and documents.`
    )
    if (!confirmed) return

    setActionUserId(userId)
    setError(null)

    try {
      const res = await deleteDemoUser(userId)
      if (res?.error) {
        setError(res.error)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setActionUserId(null)
    }
  }

  async function handleToggleBan(userId: string, currentlyBanned: boolean) {
    setActionUserId(userId)
    setError(null)

    try {
      if (currentlyBanned) {
        const res = await unbanDemoUser(userId)
        if (res?.error) setError(res.error)
      } else {
        const res = await banDemoUser(userId, 'Demo expired')
        if (res?.error) setError(res.error)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user status')
    } finally {
      setActionUserId(null)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-[#EDEDED] p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link
                href="/dashboard"
                className="font-mono text-[11px] text-white/50 hover:text-white transition-colors"
              >
                ← Back to Workspace
              </Link>
              <span className="text-white/20">/</span>
              <span className="font-mono text-[10px] text-accent bg-accent-dim px-2 py-0.5 rounded border border-accent/30 font-semibold">
                BETTER AUTH ADMIN PLUGIN
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Demo Account Manager
            </h1>
            <p className="text-xs text-white/60 mt-1">
              Powered natively by Better Auth Admin Plugin. Public signup is closed.
            </p>
          </div>

          <div className="font-mono text-right text-[11px] text-white/50 bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 rounded-lg">
            <div>Logged in as: <span className="text-white font-medium">{currentUserEmail}</span></div>
            <div className="text-[10px] text-white/40 mt-0.5">{users.length} registered account(s)</div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/10 text-red-400 p-4 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="font-mono text-xs text-red-300 hover:text-white cursor-pointer"
            >
              Dismiss ✕
            </button>
          </div>
        )}

        {/* Credentials Created Banner */}
        {createdCredentials && (
          <div className="border border-accent/40 bg-accent-dim p-4 sm:p-5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-accent flex items-center gap-1.5">
                ✓ Demo Account Created Successfully
              </span>
              <button
                onClick={() => setCreatedCredentials(null)}
                className="text-white/40 hover:text-white text-xs cursor-pointer font-mono"
              >
                Close ✕
              </button>
            </div>
            <p className="text-xs text-white/80">
              Provide these credentials to your demo client. They can sign in directly at{' '}
              <code className="text-white bg-white/10 px-1 py-0.5 rounded font-mono text-[11px]">/login</code>:
            </p>
            <div className="bg-black/40 border border-white/[0.08] rounded p-3 font-mono text-xs text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div>Email: <span className="text-accent">{createdCredentials.email}</span></div>
                <div>Password: <span className="text-accent">{createdCredentials.password}</span></div>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `CareNote Demo Access:\nURL: https://carenote.in/login\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
                  )
                }
                className="px-3 py-1.5 rounded bg-white text-black font-medium text-[11px] hover:bg-white/90 transition-colors cursor-pointer self-start sm:self-center"
              >
                {copied ? '✓ Copied' : 'Copy Credentials'}
              </button>
            </div>
          </div>
        )}

        {/* Create Demo Account Card */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-white">Create New Demo Account</h2>
              <p className="text-xs text-white/50">
                Uses Better Auth Admin API (`auth.api.createUser`) to provision a verified demo workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={generatePassword}
              className="text-[11px] font-mono text-accent hover:underline cursor-pointer"
            >
              Generate Random Password
            </button>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-white/50 uppercase tracking-widest block mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Eleanor Vance"
                className="w-full bg-black/40 border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-white/50 uppercase tracking-widest block mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="w-full bg-black/40 border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-white/50 uppercase tracking-widest block mb-1.5">
                Temporary Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 chars"
                  className="w-full bg-black/40 border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-white text-black font-medium text-xs px-4 py-2 rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors shrink-0 cursor-pointer shadow-sm"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Existing Accounts Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-white">Active Registered Accounts</h2>
            <span className="font-mono text-xs text-white/40">{users.length} total</span>
          </div>

          <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-white/[0.01]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.02] font-mono text-[10px] text-white/40 uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-center">Patients</th>
                    <th className="py-3 px-4 text-center">Docs</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {users.map((u) => {
                    const isSelf = u.email.toLowerCase() === currentUserEmail.toLowerCase()
                    const isBusy = actionUserId === u.id
                    return (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-white">{u.name}</div>
                          <div className="font-mono text-[11px] text-white/50">{u.email}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[10px]">
                          {u.role === 'admin' ? (
                            <span className="text-accent bg-accent-dim px-2 py-0.5 rounded border border-accent/30 font-semibold">
                              ADMIN
                            </span>
                          ) : (
                            <span className="text-white/60 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                              USER
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[10px]">
                          {u.banned ? (
                            <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                              SUSPENDED ({u.banReason || 'Banned'})
                            </span>
                          ) : (
                            <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-white/50 text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-white/70">
                          {u.patientCount}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-white/70">
                          {u.documentCount}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isSelf ? (
                            <span className="font-mono text-[10px] text-white/30 italic">Active Session</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleBan(u.id, u.banned)}
                                disabled={isBusy}
                                className="font-mono text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer"
                              >
                                {u.banned ? 'Unban' : 'Suspend'}
                              </button>
                              <button
                                onClick={() => handleDelete(u.id, u.email)}
                                disabled={isBusy}
                                className="font-mono text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

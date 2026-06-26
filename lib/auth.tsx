'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from './supabase'

type Session = {
  username: string
  booth: number | null
  isAdmin: boolean
}

type AuthContextType = {
  session: Session | null
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('election_session')
    if (stored) {
      try { setSession(JSON.parse(stored)) } catch {}
    }
  }, [])

  const login = async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    // Fetch passwords and booth count from DB
    const { data, error } = await supabase
      .from('election_settings')
      .select('admin_password, booth_password, booth_count')
      .single()

    if (error || !data) return { ok: false, error: 'Could not connect to server.' }

    const adminPassword = data.admin_password
    const boothPassword = data.booth_password
    const maxBooths = data.booth_count ?? 6

    let newSession: Session | null = null

    if (username === 'Admin') {
      if (password !== adminPassword) return { ok: false, error: 'Invalid username or password.' }
      newSession = { username: 'Admin', booth: null, isAdmin: true }
    } else {
      const match = username.match(/^VotingBooth(\d+)$/)
      if (!match) return { ok: false, error: 'Invalid username or password.' }
      if (password !== boothPassword) return { ok: false, error: 'Invalid username or password.' }
      const boothNum = parseInt(match[1])
      if (boothNum < 1 || boothNum > maxBooths) return { ok: false, error: `Invalid booth. Only Booth 1–${maxBooths} are active.` }
      newSession = { username, booth: boothNum, isAdmin: false }
    }

    setSession(newSession)
    sessionStorage.setItem('election_session', JSON.stringify(newSession))
    return { ok: true }
  }

  const logout = () => {
    setSession(null)
    sessionStorage.removeItem('election_session')
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

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
const VALID_PASSWORD = 'BMIS1815$$#'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('election_session')
    if (stored) {
      try { setSession(JSON.parse(stored)) } catch {}
    }
  }, [])

  const login = async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (password !== VALID_PASSWORD) return { ok: false, error: 'Invalid username or password.' }

    let newSession: Session | null = null

    if (username === 'Admin') {
      newSession = { username: 'Admin', booth: null, isAdmin: true }
    } else {
      const match = username.match(/^VotingBooth(\d+)$/)
      if (!match) return { ok: false, error: 'Invalid username or password.' }

      const boothNum = parseInt(match[1])

      // Check allowed booth count from database
      const { data } = await supabase
        .from('election_settings')
        .select('booth_count')
        .single()

      const maxBooths = data?.booth_count ?? 6
      if (boothNum < 1 || boothNum > maxBooths) {
        return { ok: false, error: `Invalid booth. Only Booth 1–${maxBooths} are active.` }
      }

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

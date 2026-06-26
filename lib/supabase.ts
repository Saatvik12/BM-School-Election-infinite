import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Role = {
  id: number
  name: string
  display_order: number
  active: boolean
}

export type Candidate = {
  id: number
  role_id: number
  role?: Role
  name: string
  photo_url: string | null
  display_order: number
  active: boolean
}

export type Vote = {
  id: number
  booth: number
  role_id: number
  role_name: string
  candidate_name: string
  session_id: string
  created_at: string
}

export type BoothStatus = {
  booth: number
  last_seen: string
}

export type BoothRole = {
  id: number
  booth: number
  role_id: number
}

export type ElectionSettings = {
  id: number
  voting_open: boolean
  booth_count: number
  admin_password: string
  booth_password: string
}
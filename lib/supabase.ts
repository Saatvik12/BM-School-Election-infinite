import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Role = {
  id: number
  name: string           // e.g. "SPL", "ASPL", "House Captain"
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
  session_id: string     // groups all role votes from one voter together
  created_at: string
}

export type BoothStatus = {
  booth: number
  last_seen: string
}

export type ElectionSettings = {
  id: number
  voting_open: boolean
}

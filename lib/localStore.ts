const key = (booth: number, suffix: string) => `bmis_booth${booth}_${suffix}`

export type LocalVote = {
  id: string
  session_id: string
  role_id: number
  role_name: string
  candidate_name: string
  timestamp: string
  synced: boolean
}

export function getLocalVotes(booth: number): LocalVote[] {
  try {
    const raw = localStorage.getItem(key(booth, 'votes'))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveLocalVote(booth: number, vote: Omit<LocalVote, 'id'>): LocalVote {
  const votes = getLocalVotes(booth)
  const newVote: LocalVote = { ...vote, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` }
  votes.push(newVote)
  localStorage.setItem(key(booth, 'votes'), JSON.stringify(votes))
  return newVote
}

export function markVotesSynced(booth: number, ids: string[]) {
  const votes = getLocalVotes(booth)
  const updated = votes.map(v => ids.includes(v.id) ? { ...v, synced: true } : v)
  localStorage.setItem(key(booth, 'votes'), JSON.stringify(updated))
}

export function clearLocalVotes(booth: number) {
  localStorage.removeItem(key(booth, 'votes'))
}

export function getUnsyncedVotes(booth: number): LocalVote[] {
  return getLocalVotes(booth).filter(v => !v.synced)
}

export function getLocalVoteCount(booth: number): number {
  // Count unique sessions (each session = one full voter)
  const votes = getLocalVotes(booth)
  const sessions = new Set(votes.map(v => v.session_id))
  return sessions.size
}

export function getSyncedVoteCount(booth: number): number {
  const votes = getLocalVotes(booth)
  const syncedSessions = new Set(votes.filter(v => v.synced).map(v => v.session_id))
  return syncedSessions.size
}

export function getUnsyncedVoteCount(booth: number): number {
  const unsynced = getUnsyncedVotes(booth)
  const unsyncedSessions = new Set(unsynced.map(v => v.session_id))
  return unsyncedSessions.size
}

export function getLocalTallies(booth: number): Record<string, Record<string, number>> {
  const votes = getLocalVotes(booth)
  const tallies: Record<string, Record<string, number>> = {}
  votes.forEach(v => {
    if (!tallies[v.role_name]) tallies[v.role_name] = {}
    tallies[v.role_name][v.candidate_name] = (tallies[v.role_name][v.candidate_name] || 0) + 1
  })
  return tallies
}

export function getSyncEnabled(booth: number): boolean {
  try {
    const val = localStorage.getItem(key(booth, 'sync'))
    return val === null ? true : val === 'true'
  } catch { return true }
}

export function setSyncEnabled(booth: number, enabled: boolean) {
  localStorage.setItem(key(booth, 'sync'), String(enabled))
}
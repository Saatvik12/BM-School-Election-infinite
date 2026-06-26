'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase, Vote, BoothStatus, Candidate, Role, BoothRole } from '@/lib/supabase'

type Tab = 'results' | 'booths' | 'candidates' | 'settings'

export default function AdminDashboard() {
  const { logout } = useAuth()
  const [tab, setTab] = useState<Tab>('results')
  const [votes, setVotes] = useState<Vote[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [boothStatuses, setBoothStatuses] = useState<BoothStatus[]>([])
  const [boothRoles, setBoothRoles] = useState<BoothRole[]>([])
  const [electionOpen, setElectionOpen] = useState(false)
  const [boothCount, setBoothCount] = useState(6)
  const [savingBoothCount, setSavingBoothCount] = useState(false)
  const [togglingElection, setTogglingElection] = useState(false)
  const [resetStep, setResetStep] = useState<0|1|2>(0)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  const loadAll = useCallback(async () => {
    const [votesRes, rolesRes, candidatesRes, boothRes, settingsRes, boothRolesRes] = await Promise.all([
      supabase.from('votes').select('*').order('created_at'),
      supabase.from('roles').select('*').order('display_order'),
      supabase.from('candidates').select('*').order('display_order'),
      supabase.from('booth_status').select('*'),
      supabase.from('election_settings').select('*').single(),
      supabase.from('booth_roles').select('*'),
    ])
    if (votesRes.data) setVotes(votesRes.data)
    if (rolesRes.data) setRoles(rolesRes.data)
    if (candidatesRes.data) setCandidates(candidatesRes.data)
    if (boothRes.data) setBoothStatuses(boothRes.data)
    if (boothRolesRes.data) setBoothRoles(boothRolesRes.data)
    if (settingsRes.data) {
      setElectionOpen(settingsRes.data.voting_open)
      setBoothCount(settingsRes.data.booth_count ?? 6)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const channel = supabase.channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_status' }, loadAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_settings' }, (p: any) => {
        setElectionOpen(p.new.voting_open)
        setBoothCount(p.new.booth_count ?? 6)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_roles' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadAll])

  const isBoothActive = (booth: BoothStatus) => Date.now() - new Date(booth.last_seen).getTime() < 60000

  const handleToggleElection = async () => {
    setTogglingElection(true)
    await supabase.from('election_settings').update({ voting_open: !electionOpen }).eq('id', 1)
    setElectionOpen(!electionOpen)
    setTogglingElection(false)
  }

  const handleSaveBoothCount = async () => {
    setSavingBoothCount(true)
    await supabase.from('election_settings').update({ booth_count: boothCount }).eq('id', 1)
    setSavingBoothCount(false)
  }

  const handleExportCSV = () => {
    const sessions: Record<string, Vote[]> = {}
    votes.forEach(v => {
      if (!sessions[v.session_id]) sessions[v.session_id] = []
      sessions[v.session_id].push(v)
    })
    const roleNames = roles.filter(r => r.active).sort((a,b) => a.display_order - b.display_order).map(r => r.name)
    const rows = [['Timestamp', 'Booth', ...roleNames]]
    Object.values(sessions).forEach(sv => {
      const first = sv[0]
      const t = new Date(first.created_at)
      const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`
      const row: string[] = [ts, String(first.booth)]
      roleNames.forEach(rn => { const v = sv.find(v => v.role_name === rn); row.push(v ? v.candidate_name : '-') })
      rows.push(row)
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `election-results-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const handleReset = async () => {
    if (resetStep === 0) { setResetStep(1); return }
    if (resetStep === 1) {
      if (resetConfirmText !== 'RESET') { setResetError('Type RESET exactly.'); return }
      setResetError(''); setResetStep(2); return
    }
    if (resetStep === 2) {
      const { data: settings } = await supabase.from('election_settings').select('admin_password').single()
      const adminPw = settings?.admin_password ?? 'BMIS1815$$#'
      if (resetPassword !== adminPw) { setResetError('Incorrect password.'); return }
      setResetting(true)
      const { error } = await supabase.from('votes').delete().gt('id', 0)
      if (error) { setResetError('Delete failed: ' + error.message); setResetting(false); return }
      setVotes([])
      setResetStep(0); setResetConfirmText(''); setResetPassword(''); setResetError('')
      setResetting(false)
    }
  }

  const uniqueSessions = new Set(votes.map(v => v.session_id)).size
  const activeRoles = roles.filter(r => r.active).sort((a,b) => a.display_order - b.display_order)
  const booths = Array.from({ length: boothCount }, (_, i) => i + 1)

  // Get roles for a specific booth (empty = all roles)
  const getBoothRoles = (booth: number): number[] => {
    const assigned = boothRoles.filter(br => br.booth === booth).map(br => br.role_id)
    return assigned.length > 0 ? assigned : activeRoles.map(r => r.id)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      {/* Top nav */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', background: 'var(--accent)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>Election Admin</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>BMIS Elections</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: electionOpen ? 'var(--success)' : '#94a3b8' }} />
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>{electionOpen ? 'Voting Open' : 'Voting Closed'}</span>
          </div>
          <button className="btn-ghost" onClick={logout} style={{ padding: '8px 16px', fontSize: '13px' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <StatCard label="Total Voters" value={uniqueSessions} icon="🗳️" />
          <StatCard label="Vote Records" value={votes.length} icon="📋" />
          <StatCard label="Active Roles" value={activeRoles.length} icon="🏷️" />
          <StatCard label="Active Booths" value={boothStatuses.filter(isBoothActive).length} icon="🖥️" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
          {(['results', 'booths', 'candidates', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: 'all 0.15s ease', background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? 'white' : 'var(--muted)', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── RESULTS TAB ── */}
        {tab === 'results' && (
          <div className="animate-fadeIn">
            {activeRoles.map(role => {
              const roleCandidates = candidates.filter(c => c.role_id === role.id && c.active)
              const counts: Record<string, number> = {}
              roleCandidates.forEach(c => { counts[c.name] = 0 })
              votes.filter(v => v.role_id === role.id).forEach(v => { counts[v.candidate_name] = (counts[v.candidate_name] || 0) + 1 })
              const max = Math.max(...Object.values(counts), 1)
              const total = Object.values(counts).reduce((a,b) => a+b, 0)
              return (
                <div key={role.id} className="card" style={{ padding: '24px', marginBottom: '20px' }}>
                  <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px' }}>{role.name} Results</h3>
                  {Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([name, count]) => (
                    <div key={name} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: '600', fontSize: '14px' }}>{name}</span>
                        <span style={{ fontSize: '14px', color: 'var(--muted)' }}>{count} <span style={{ fontSize: '12px' }}>({total > 0 ? Math.round(count/total*100) : 0}%)</span></span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(count/max)*100}%`, background: 'var(--accent)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  ))}
                  <details style={{ marginTop: '16px' }}>
                    <summary style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontWeight: '600' }}>Booth-wise breakdown</summary>
                    <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: '700' }}>Candidate</th>
                            {booths.map(b => <th key={b} style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--muted)', fontWeight: '700' }}>B{b}</th>)}
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--foreground)', fontWeight: '700' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(counts).sort().map(cand => {
                            const bc = booths.map(b => votes.filter(v => v.role_id === role.id && v.candidate_name === cand && v.booth === b).length)
                            return (
                              <tr key={cand} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px', fontWeight: '600' }}>{cand}</td>
                                {bc.map((c,i) => <td key={i} style={{ textAlign: 'center', padding: '8px', color: c ? 'var(--foreground)' : 'var(--muted)' }}>{c}</td>)}
                                <td style={{ textAlign: 'center', padding: '8px', fontWeight: '700', color: 'var(--accent)' }}>{bc.reduce((a,b)=>a+b,0)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )
            })}
            {activeRoles.length === 0 && <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No active roles yet. Add them in the Candidates tab.</div>}
          </div>
        )}

        {/* ── BOOTHS TAB ── */}
        {tab === 'booths' && (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Booth count selector */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Number of Voting Booths</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>Controls how many booths can log in (VotingBooth1 through VotingBooth{boothCount}).</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => setBoothCount(n)} style={{ width: '40px', height: '40px', borderRadius: '8px', border: `2px solid ${boothCount === n ? 'var(--accent)' : 'var(--border)'}`, background: boothCount === n ? 'var(--accent)' : 'transparent', color: boothCount === n ? 'white' : 'var(--foreground)', fontWeight: '700', cursor: 'pointer', fontSize: '15px', transition: 'all 0.15s ease' }}>
                    {n}
                  </button>
                ))}
              </div>
              <button className="btn-primary" onClick={handleSaveBoothCount} disabled={savingBoothCount} style={{ marginTop: '16px', padding: '10px 20px', fontSize: '14px' }}>
                {savingBoothCount ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* Booth cards with role assignment */}
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ fontWeight: '700', fontSize: '16px' }}>Booth Status & Role Assignment</h3>
                <button className="btn-ghost" onClick={loadAll} style={{ padding: '8px 16px', fontSize: '13px' }}>↻ Refresh</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {booths.map(n => {
                  const status = boothStatuses.find(b => b.booth === n)
                  const active = status && isBoothActive(status)
                  const lastSeen = status ? new Date(status.last_seen) : null
                  const boothVoters = new Set(votes.filter(v => v.booth === n).map(v => v.session_id)).size
                  const assignedRoleIds = boothRoles.filter(br => br.booth === n).map(br => br.role_id)
                  const votesAllRoles = assignedRoleIds.length === 0

                  return (
                    <BoothCard
                      key={n}
                      booth={n}
                      active={!!active}
                      lastSeen={lastSeen}
                      voters={boothVoters}
                      allRoles={activeRoles}
                      assignedRoleIds={assignedRoleIds}
                      votesAllRoles={votesAllRoles}
                      onSave={async (selectedIds) => {
                        // Delete existing assignments for this booth
                        await supabase.from('booth_roles').delete().eq('booth', n)
                        // If not all roles selected, insert specific ones
                        if (selectedIds.length !== activeRoles.length) {
                          const rows = selectedIds.map(rid => ({ booth: n, role_id: rid }))
                          if (rows.length > 0) await supabase.from('booth_roles').insert(rows)
                        }
                        loadAll()
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── CANDIDATES TAB ── */}
        {tab === 'candidates' && (
          <CandidatesTab roles={roles} candidates={candidates} onRefresh={loadAll} />
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Election toggle */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Election Status</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Opening or closing affects all booths immediately.</p>
              <button onClick={handleToggleElection} disabled={togglingElection} style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '15px', background: electionOpen ? 'var(--danger)' : 'var(--success)', color: 'white', opacity: togglingElection ? 0.6 : 1 }}>
                {togglingElection ? 'Updating...' : electionOpen ? '🔒 Close Election' : '🔓 Open Election'}
              </button>
            </div>

            {/* Change passwords */}
            <ChangePasswordCard />

            {/* Export */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Export Data</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Download all {uniqueSessions} voter records as CSV.</p>
              <button className="btn-primary" onClick={handleExportCSV} disabled={votes.length === 0}>📥 Export CSV</button>
            </div>

            {/* Reset */}
            <div className="card" style={{ padding: '24px', borderColor: resetStep > 0 ? 'var(--danger)' : 'var(--border)' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', color: 'var(--danger)' }}>Reset Votes</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Permanently deletes all vote records from the database.</p>
              {resetStep === 0 && <button onClick={handleReset} style={{ padding: '10px 20px', borderRadius: '10px', border: '2px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Reset All Votes</button>}
              {resetStep === 1 && (
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>Type <strong>RESET</strong> to confirm:</p>
                  <input type="text" value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value)} placeholder="Type RESET here" style={{ marginBottom: '12px' }} />
                  {resetError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{resetError}</p>}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReset} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--danger)', color: 'white', fontWeight: '600', cursor: 'pointer' }}>Continue</button>
                    <button className="btn-ghost" onClick={() => { setResetStep(0); setResetConfirmText(''); setResetError('') }}>Cancel</button>
                  </div>
                </div>
              )}
              {resetStep === 2 && (
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>Enter admin password:</p>
                  <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Admin password" style={{ marginBottom: '12px' }} />
                  {resetError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{resetError}</p>}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReset} disabled={resetting} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--danger)', color: 'white', fontWeight: '600', cursor: 'pointer', opacity: resetting ? 0.6 : 1 }}>
                      {resetting ? 'Deleting...' : '⚠️ Delete All Votes'}
                    </button>
                    <button className="btn-ghost" onClick={() => { setResetStep(0); setResetPassword(''); setResetError('') }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Booth Card with role assignment ──────────────────────

function BoothCard({ booth, active, lastSeen, voters, allRoles, assignedRoleIds, votesAllRoles, onSave }: {
  booth: number; active: boolean; lastSeen: Date | null; voters: number
  allRoles: Role[]; assignedRoleIds: number[]; votesAllRoles: boolean
  onSave: (selectedIds: number[]) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<number[]>(votesAllRoles ? allRoles.map(r => r.id) : assignedRoleIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(votesAllRoles ? allRoles.map(r => r.id) : assignedRoleIds)
  }, [assignedRoleIds, votesAllRoles, allRoles])

  const toggleRole = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(selected)
    setSaving(false)
    setExpanded(false)
  }

  const displayRoles = votesAllRoles ? allRoles : allRoles.filter(r => assignedRoleIds.includes(r.id))

  return (
    <div style={{ border: `2px solid ${active ? 'var(--success)' : 'var(--border)'}`, borderRadius: '14px', overflow: 'hidden', background: 'white' }}>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '15px' }}>Booth {booth}</span>
            <span style={{ fontSize: '16px' }}>{active ? '❤️' : '⚠️'}</span>
          </div>
          <button onClick={() => setExpanded(!expanded)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
            {expanded ? 'Close' : '✏️ Edit Roles'}
          </button>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: active ? 'var(--success-light)' : '#f1f5f9', color: active ? 'var(--success)' : 'var(--muted)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? 'var(--success)' : '#94a3b8' }} />
          {active ? 'Active' : lastSeen ? 'Offline' : 'Not Connected'}
        </div>
        {lastSeen && <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Last seen: {lastSeen.toLocaleTimeString()}</div>}
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px' }}>{voters} voter{voters !== 1 ? 's' : ''}</div>

        {/* Role tags */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {votesAllRoles
            ? <span style={{ fontSize: '11px', background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>All roles</span>
            : displayRoles.map(r => <span key={r.id} style={{ fontSize: '11px', background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{r.name}</span>)
          }
        </div>
      </div>

      {/* Role assignment panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: '#fafafa' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--foreground)' }}>Select roles this booth votes for:</p>
          {allRoles.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No roles created yet.</p>}
          {allRoles.map(role => (
            <label key={role.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(role.id)} onChange={() => toggleRole(role.id)} style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{role.name}</span>
            </label>
          ))}
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>Select all to make this booth vote for everything.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || selected.length === 0} style={{ padding: '8px 16px', fontSize: '13px' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={() => setExpanded(false)} style={{ padding: '8px 14px', fontSize: '13px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Change Password Card ──────────────────────────────────

function ChangePasswordCard() {
  const [adminCurrent, setAdminCurrent] = useState('')
  const [adminNew, setAdminNew] = useState('')
  const [adminConfirm, setAdminConfirm] = useState('')
  const [adminMsg, setAdminMsg] = useState('')
  const [adminError, setAdminError] = useState('')
  const [savingAdmin, setSavingAdmin] = useState(false)

  const [boothNew, setBoothNew] = useState('')
  const [boothConfirm, setBoothConfirm] = useState('')
  const [boothAdminPw, setBoothAdminPw] = useState('')
  const [boothMsg, setBoothMsg] = useState('')
  const [boothError, setBoothError] = useState('')
  const [savingBooth, setSavingBooth] = useState(false)

  const handleChangeAdmin = async () => {
    setAdminError(''); setAdminMsg('')
    if (adminNew !== adminConfirm) { setAdminError('New passwords do not match.'); return }
    if (adminNew.length < 6) { setAdminError('Password must be at least 6 characters.'); return }
    setSavingAdmin(true)
    const { data } = await supabase.from('election_settings').select('admin_password').single()
    if (!data || data.admin_password !== adminCurrent) { setAdminError('Current password is incorrect.'); setSavingAdmin(false); return }
    await supabase.from('election_settings').update({ admin_password: adminNew }).eq('id', 1)
    setAdminMsg('✓ Admin password updated.'); setAdminCurrent(''); setAdminNew(''); setAdminConfirm('')
    setSavingAdmin(false)
  }

  const handleChangeBooth = async () => {
    setBoothError(''); setBoothMsg('')
    if (boothNew !== boothConfirm) { setBoothError('New passwords do not match.'); return }
    if (boothNew.length < 6) { setBoothError('Password must be at least 6 characters.'); return }
    setSavingBooth(true)
    const { data } = await supabase.from('election_settings').select('admin_password').single()
    if (!data || data.admin_password !== boothAdminPw) { setBoothError('Admin password is incorrect.'); setSavingBooth(false); return }
    await supabase.from('election_settings').update({ booth_password: boothNew }).eq('id', 1)
    setBoothMsg('✓ Booth password updated.'); setBoothNew(''); setBoothConfirm(''); setBoothAdminPw('')
    setSavingBooth(false)
  }

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px' }}>Change Passwords</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* Admin password */}
        <div>
          <p style={{ fontWeight: '700', fontSize: '14px', marginBottom: '12px', color: 'var(--foreground)' }}>🔐 Admin Password</p>
          <input type="password" value={adminCurrent} onChange={e => setAdminCurrent(e.target.value)} placeholder="Current admin password" style={{ marginBottom: '8px' }} />
          <input type="password" value={adminNew} onChange={e => setAdminNew(e.target.value)} placeholder="New password" style={{ marginBottom: '8px' }} />
          <input type="password" value={adminConfirm} onChange={e => setAdminConfirm(e.target.value)} placeholder="Confirm new password" style={{ marginBottom: '12px' }} />
          {adminError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>{adminError}</p>}
          {adminMsg && <p style={{ color: 'var(--success)', fontSize: '13px', marginBottom: '8px' }}>{adminMsg}</p>}
          <button className="btn-primary" onClick={handleChangeAdmin} disabled={savingAdmin} style={{ padding: '10px 18px', fontSize: '13px' }}>
            {savingAdmin ? 'Saving...' : 'Update Admin Password'}
          </button>
        </div>

        {/* Booth password */}
        <div>
          <p style={{ fontWeight: '700', fontSize: '14px', marginBottom: '12px', color: 'var(--foreground)' }}>🖥️ Booth Password</p>
          <input type="password" value={boothNew} onChange={e => setBoothNew(e.target.value)} placeholder="New booth password" style={{ marginBottom: '8px' }} />
          <input type="password" value={boothConfirm} onChange={e => setBoothConfirm(e.target.value)} placeholder="Confirm new password" style={{ marginBottom: '8px' }} />
          <input type="password" value={boothAdminPw} onChange={e => setBoothAdminPw(e.target.value)} placeholder="Your admin password (to confirm)" style={{ marginBottom: '12px' }} />
          {boothError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>{boothError}</p>}
          {boothMsg && <p style={{ color: 'var(--success)', fontSize: '13px', marginBottom: '8px' }}>{boothMsg}</p>}
          <button className="btn-primary" onClick={handleChangeBooth} disabled={savingBooth} style={{ padding: '10px 18px', fontSize: '13px' }}>
            {savingBooth ? 'Saving...' : 'Update Booth Password'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Candidates Tab ────────────────────────────────────────

function CandidatesTab({ roles, candidates, onRefresh }: { roles: Role[]; candidates: Candidate[]; onRefresh: () => void }) {
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [addingRole, setAddingRole] = useState(false)
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null)
  const [addingCandidateForRole, setAddingCandidateForRole] = useState<number | null>(null)
  const [newCandidateName, setNewCandidateName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const uploadPhoto = async (file: File, candidateId?: number): Promise<string | null> => {
    const ext = file.name.split('.').pop()
    const filename = `candidate_${candidateId || Date.now()}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('candidate-photos').upload(filename, file, { upsert: true })
    if (error) { alert('Photo upload failed: ' + error.message); return null }
    const { data } = supabase.storage.from('candidate-photos').getPublicUrl(filename)
    return data.publicUrl
  }

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return
    setSaving(true)
    const maxOrder = roles.length > 0 ? Math.max(...roles.map(r => r.display_order)) : 0
    await supabase.from('roles').insert({ name: newRoleName.trim(), display_order: maxOrder + 1, active: true })
    setNewRoleName(''); setAddingRole(false); onRefresh(); setSaving(false)
  }

  const handleUpdateRole = async () => {
    if (!editingRole || !editingRole.name.trim()) return
    setSaving(true)
    await supabase.from('roles').update({ name: editingRole.name, active: editingRole.active }).eq('id', editingRole.id)
    setEditingRole(null); onRefresh(); setSaving(false)
  }

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? This will also remove all its candidates.`)) return
    await supabase.from('candidates').delete().eq('role_id', role.id)
    await supabase.from('roles').delete().eq('id', role.id)
    onRefresh()
  }

  const handleAddCandidate = async (file?: File) => {
    if (!newCandidateName.trim() || !addingCandidateForRole) return
    setSaving(true); setUploading(!!file)
    const maxOrder = candidates.filter(c => c.role_id === addingCandidateForRole).length
    const { data: newCand } = await supabase.from('candidates').insert({ role_id: addingCandidateForRole, name: newCandidateName.trim(), display_order: maxOrder + 1, active: true, photo_url: null }).select().single()
    let photoUrl = null
    if (file && newCand) { photoUrl = await uploadPhoto(file, newCand.id) }
    if (photoUrl && newCand) { await supabase.from('candidates').update({ photo_url: photoUrl }).eq('id', newCand.id) }
    setNewCandidateName(''); setAddingCandidateForRole(null); setUploading(false); setSaving(false); onRefresh()
  }

  const handleUpdateCandidate = async (file?: File) => {
    if (!editingCandidate) return
    setSaving(true); setUploading(!!file)
    let photoUrl = editingCandidate.photo_url
    if (file) { photoUrl = await uploadPhoto(file, editingCandidate.id) }
    await supabase.from('candidates').update({ name: editingCandidate.name, active: editingCandidate.active, photo_url: photoUrl }).eq('id', editingCandidate.id)
    setEditingCandidate(null); setUploading(false); setSaving(false); onRefresh()
  }

  const handleDeleteCandidate = async (c: Candidate) => {
    if (!confirm(`Remove candidate "${c.name}"?`)) return
    await supabase.from('candidates').delete().eq('id', c.id)
    onRefresh()
  }

  const activeRoles = roles.filter(r => r.active).sort((a,b) => a.display_order - b.display_order)

  return (
    <div className="animate-fadeIn">
      <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontWeight: '700', fontSize: '16px' }}>Voting Roles</h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>e.g. SPL, ASPL, House Captain</p>
          </div>
          <button className="btn-primary" onClick={() => setAddingRole(true)} style={{ padding: '8px 16px', fontSize: '13px' }}>+ Add Role</button>
        </div>
        {addingRole && (
          <div style={{ background: 'var(--accent-light)', borderRadius: '10px', padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Role name" onKeyDown={e => e.key === 'Enter' && handleAddRole()} autoFocus style={{ flex: 1 }} />
            <button className="btn-primary" onClick={handleAddRole} disabled={saving} style={{ padding: '10px 16px', fontSize: '13px' }}>{saving ? '...' : 'Add'}</button>
            <button className="btn-ghost" onClick={() => { setAddingRole(false); setNewRoleName('') }}>Cancel</button>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeRoles.map(role => (
            <div key={role.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--background)', borderRadius: '10px' }}>
              {editingRole?.id === role.id ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                  <input type="text" value={editingRole.name} onChange={e => setEditingRole({ ...editingRole, name: e.target.value })} autoFocus style={{ flex: 1 }} />
                  <button className="btn-primary" onClick={handleUpdateRole} disabled={saving} style={{ padding: '8px 14px', fontSize: '13px' }}>{saving ? '...' : 'Save'}</button>
                  <button className="btn-ghost" onClick={() => setEditingRole(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <span style={{ fontWeight: '600', fontSize: '15px' }}>{role.name}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-ghost" onClick={() => setEditingRole(role)} style={{ padding: '6px 12px', fontSize: '12px' }}>✏️ Edit</button>
                    <button onClick={() => handleDeleteRole(role)} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontWeight: '600' }}>🗑 Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {roles.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>No roles yet. Add one above.</p>}
        </div>
      </div>

      {activeRoles.map(role => {
        const roleCandidates = candidates.filter(c => c.role_id === role.id).sort((a,b) => a.display_order - b.display_order)
        const isAddingHere = addingCandidateForRole === role.id
        return (
          <div key={role.id} className="card" style={{ padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '15px' }}>{role.name} Candidates</h3>
              <button className="btn-primary" onClick={() => { setAddingCandidateForRole(role.id); setNewCandidateName('') }} style={{ padding: '8px 14px', fontSize: '13px' }}>+ Add</button>
            </div>
            {isAddingHere && (
              <AddCandidateForm name={newCandidateName} onNameChange={setNewCandidateName} onSave={(file) => handleAddCandidate(file)} onCancel={() => { setAddingCandidateForRole(null); setNewCandidateName('') }} saving={saving} uploading={uploading} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {roleCandidates.map(candidate => (
                <div key={candidate.id}>
                  {editingCandidate?.id === candidate.id
                    ? <EditCandidateForm candidate={editingCandidate} onChange={setEditingCandidate} onSave={(file) => handleUpdateCandidate(file)} onCancel={() => setEditingCandidate(null)} saving={saving} uploading={uploading} />
                    : <CandidateCard candidate={candidate} onEdit={() => setEditingCandidate(candidate)} onDelete={() => handleDeleteCandidate(candidate)} />
                  }
                </div>
              ))}
              {roleCandidates.length === 0 && !isAddingHere && <p style={{ color: 'var(--muted)', fontSize: '13px', gridColumn: '1/-1' }}>No candidates yet.</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CandidateCard({ candidate, onEdit, onDelete }: { candidate: Candidate; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
      <div style={{ height: '110px', background: candidate.photo_url ? 'transparent' : 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {candidate.photo_url ? <img src={candidate.photo_url} alt={candidate.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '36px' }}>👤</span>}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '8px' }}>{candidate.name}</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={onEdit} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: 'var(--muted)' }}>✏️ Edit</button>
          <button onClick={onDelete} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid var(--danger)', background: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: 'var(--danger)' }}>🗑</button>
        </div>
      </div>
    </div>
  )
}

function AddCandidateForm({ name, onNameChange, onSave, onCancel, saving, uploading }: { name: string; onNameChange: (v: string) => void; onSave: (file?: File) => void; onCancel: () => void; saving: boolean; uploading: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)) } }
  return (
    <div style={{ background: 'var(--accent-light)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <input type="text" value={name} onChange={e => onNameChange(e.target.value)} placeholder="Candidate name" autoFocus style={{ marginBottom: '10px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        {preview && <img src={preview} style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover' }} alt="preview" />}
        <button type="button" onClick={() => ref.current?.click()} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px dashed var(--accent)', background: 'white', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📷 {file ? 'Change' : 'Add Photo'}</button>
        <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-primary" onClick={() => onSave(file || undefined)} disabled={!name.trim() || saving} style={{ padding: '8px 16px', fontSize: '13px' }}>{uploading ? 'Uploading...' : saving ? 'Saving...' : 'Add Candidate'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function EditCandidateForm({ candidate, onChange, onSave, onCancel, saving, uploading }: { candidate: Candidate; onChange: (c: Candidate) => void; onSave: (file?: File) => void; onCancel: () => void; saving: boolean; uploading: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)) } }
  return (
    <div style={{ border: '2px solid var(--accent)', borderRadius: '12px', padding: '12px', background: 'var(--accent-light)' }}>
      <input type="text" value={candidate.name} onChange={e => onChange({ ...candidate, name: e.target.value })} autoFocus style={{ marginBottom: '8px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <img src={preview || candidate.photo_url || ''} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', display: (preview || candidate.photo_url) ? 'block' : 'none' }} />
        <button type="button" onClick={() => ref.current?.click()} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px dashed var(--accent)', background: 'white', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>📷 {candidate.photo_url ? 'Change' : 'Add'}</button>
        <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button className="btn-primary" onClick={() => onSave(file || undefined)} disabled={saving} style={{ padding: '6px 12px', fontSize: '12px' }}>{uploading ? 'Uploading...' : saving ? '...' : 'Save'}</button>
        <button className="btn-ghost" onClick={onCancel} style={{ padding: '6px 10px', fontSize: '12px' }}>Cancel</button>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ fontSize: '28px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--foreground)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', fontWeight: '500' }}>{label}</div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LayoutDashboard, Building2, CheckSquare, AlertTriangle, Activity, Clock, ChevronRight, ChevronDown, ClipboardCheck, Pencil, Trash2, ShieldCheck, AlertCircle, Sun, Moon } from 'lucide-react'
import { supabase } from './supabaseClient'
import type { Customer, Task, Blocker, UpdateRow, Spotlight, Milestone, StatusDraft, Role, AllowedUser } from './types'

type Tab = 'overview' | 'review' | 'customers' | 'tasks' | 'blockers' | 'status' | 'updates' | 'users'

const STAGES: { key: keyof Customer; label: string }[] = [
  { key: 'demo', label: 'Demo' },
  { key: 'agreement', label: 'Agreement signed' },
  { key: 'handover', label: 'Handover' },
  { key: 'roadmap_disc', label: 'Roadmap discussion' },
  { key: 'roadmap_doc', label: 'Roadmap doc sent' },
  { key: 'go_live', label: 'Go live' },
  { key: 'api_workshop', label: 'API workshop' },
  { key: 'training', label: 'Training' },
  { key: 'mo_conclusion', label: 'MO conclusion' },
]

const NAV: { key: Tab; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'customers', label: 'Customers', icon: Building2 },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'blockers', label: 'Blockers', icon: AlertTriangle },
  { key: 'status', label: 'Status', icon: Activity },
  { key: 'updates', label: 'Updates', icon: Clock },
  { key: 'users', label: 'Users', icon: ShieldCheck, adminOnly: true },
]

export default function Dashboard({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [updates, setUpdates] = useState<UpdateRow[]>([])
  const [spotlight, setSpotlight] = useState<Spotlight[]>([])
  const [statusDrafts, setStatusDrafts] = useState<StatusDraft[]>([])
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([])
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'

  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('pd-theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('pd-theme', dark ? 'dark' : 'light')
  }, [dark])

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    const [c, t, b, u, s, d] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('blockers').select('*').order('created_at', { ascending: false }),
      supabase.from('updates').select('*').order('created_at', { ascending: false }),
      supabase.from('spotlight').select('*').order('created_at', { ascending: false }),
      supabase.from('status_drafts').select('*').order('created_at', { ascending: false }),
    ])
    if (c.error || t.error || b.error || u.error || s.error || d.error) {
      setErrorMsg((c.error || t.error || b.error || u.error || s.error || d.error)?.message ?? 'Could not load data.')
    } else {
      setCustomers(c.data as Customer[])
      setTasks(t.data as Task[])
      setBlockers(b.data as Blocker[])
      setUpdates(u.data as UpdateRow[])
      setSpotlight(s.data as Spotlight[])
      setStatusDrafts(d.data as StatusDraft[])
    }
    setLoading(false)
  }

  async function loadRole() {
    const { data, error } = await supabase.rpc('my_role')
    if (!error) setMyRole((data as Role) ?? 'viewer')
  }

  async function loadUsers() {
    const { data, error } = await supabase.from('allowed_users').select('*').order('added_at')
    if (!error) setAllowedUsers(data as AllowedUser[])
  }

  useEffect(() => { loadAll(); loadRole() }, [])
  useEffect(() => { if (isAdmin) loadUsers() }, [isAdmin])

  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? '—'
  }

  async function addCustomer(name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('customers').insert({ name: name.trim() })
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function patchCustomer(customerId: string, patch: Partial<Customer>) {
    // Optimistic local update so a single field edit doesn't trigger a full 6-table reload
    // (which was making date pickers feel like they "saved and reloaded" mid-edit).
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...patch } : c)))
    const { error } = await supabase.from('customers').update(patch).eq('id', customerId)
    if (error) { setErrorMsg(error.message); loadAll() }
  }
  async function updateCustomerField(customerId: string, field: string, value: string | null) {
    await patchCustomer(customerId, { [field]: value || null } as unknown as Partial<Customer>)
  }
  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Permanently delete ${customer.name}? This also deletes all of their tasks, blockers, updates and status history. This cannot be undone.`)) return
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) setErrorMsg(error.message); else { setExpanded(null); setEditingId(null); loadAll() }
  }
  async function addTask(customerId: string, title: string) {
    if (!title.trim() || !customerId) return
    const { error } = await supabase.from('tasks').insert({ customer_id: customerId, title: title.trim() })
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function setTaskStatus(id: string, status: Task['status']) {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function addBlocker(customerId: string, title: string) {
    if (!title.trim() || !customerId) return
    const { error } = await supabase.from('blockers').insert({ customer_id: customerId, title: title.trim() })
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function toggleBlockerResolved(b: Blocker) {
    const { error } = await supabase.from('blockers').update({ resolved_at: b.resolved_at ? null : new Date().toISOString() }).eq('id', b.id)
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function addUpdateNote(customerId: string, text: string) {
    if (!text.trim() || !customerId) return
    const { error } = await supabase.from('updates').insert({ customer_id: customerId, text: text.trim(), author: session.user.email })
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function addSpotlight(customerId: string, who: string, text: string) {
    if (!text.trim() || !customerId) return
    const { error } = await supabase.from('spotlight').insert({ customer_id: customerId, text: text.trim(), owner: who })
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function approveDraft(draft: StatusDraft, text: string, owner: string) {
    const { error: insertErr } = await supabase.from('spotlight').insert({ customer_id: draft.customer_id, text: text.trim(), owner })
    if (insertErr) { setErrorMsg(insertErr.message); return }
    const { error: updateErr } = await supabase
      .from('status_drafts')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: session.user.email })
      .eq('id', draft.id)
    if (updateErr) setErrorMsg(updateErr.message); else loadAll()
  }
  async function dismissDraft(draft: StatusDraft) {
    const { error } = await supabase
      .from('status_drafts')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString(), reviewed_by: session.user.email })
      .eq('id', draft.id)
    if (error) setErrorMsg(error.message); else loadAll()
  }
  async function updateMilestone(customer: Customer, key: string, patch: Partial<Milestone>) {
    const updated = customer.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m))
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, milestones: updated } : c)))
    const { error } = await supabase.from('customers').update({ milestones: updated }).eq('id', customer.id)
    if (error) { setErrorMsg(error.message); loadAll() }
  }
  async function addAllowedUser(email: string, role: Role) {
    if (!email.trim()) return
    const { error } = await supabase.from('allowed_users').insert({ email: email.trim().toLowerCase(), role })
    if (error) setErrorMsg(error.message); else loadUsers()
  }
  async function updateUserRole(email: string, role: Role) {
    const { error } = await supabase.from('allowed_users').update({ role }).eq('email', email)
    if (error) setErrorMsg(error.message); else loadUsers()
  }
  async function removeAllowedUser(email: string) {
    if (email === session.user.email) { setErrorMsg("You can't remove your own access."); return }
    if (!window.confirm(`Remove access for ${email}? They will be signed out and blocked from logging in again.`)) return
    const { error } = await supabase.from('allowed_users').delete().eq('email', email)
    if (error) setErrorMsg(error.message); else loadUsers()
  }

  const filteredTasks = tasks.filter((t) => customerFilter === 'all' || t.customer_id === customerFilter)
  const filteredBlockers = blockers.filter((b) => customerFilter === 'all' || b.customer_id === customerFilter)
  const filteredUpdates = updates.filter((u) => customerFilter === 'all' || u.customer_id === customerFilter)
  const filteredSpotlight = spotlight.filter((s) => customerFilter === 'all' || s.customer_id === customerFilter)

  const pendingDrafts = statusDrafts.filter((d) => d.status === 'pending')
  const openTasks = tasks.filter((t) => t.status !== 'Done')
  const openBlockers = blockers.filter((b) => !b.resolved_at)
  const upcomingGoLive = customers
    .filter((c) => c.go_live)
    .filter((c) => {
      const d = new Date(c.go_live as string)
      const days = (d.getTime() - Date.now()) / 86400000
      return days > -3 && days < 30
    })
    .sort((a, b) => new Date(a.go_live as string).getTime() - new Date(b.go_live as string).getTime())

  function isPastOrToday(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d.getTime() <= today.getTime()
  }
  function stageState(dateStr: string | null): 'empty' | 'scheduled' | 'done' {
    if (!dateStr) return 'empty'
    return isPastOrToday(dateStr) ? 'done' : 'scheduled'
  }
  function progress(c: Customer) {
    // Only count a stage as complete once its date has actually occurred —
    // a future-dated (planned) stage isn't "done" yet, just scheduled.
    const done = STAGES.filter((s) => stageState(c[s.key] as string | null) === 'done').length
    return Math.round((done / STAGES.length) * 100)
  }

  function daysSince(iso: string) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  }
  function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  }
  function latestSpotlightFor(customerId: string) {
    return spotlight
      .filter((s) => s.customer_id === customerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  }
  function freshness(customerId: string): 'fresh' | 'aging' | 'stale' {
    const latest = latestSpotlightFor(customerId)
    if (!latest) return 'stale'
    const d = daysSince(latest.created_at)
    if (d <= 2) return 'fresh'
    if (d <= 5) return 'aging'
    return 'stale'
  }
  function needsAttention(c: Customer): boolean {
    const stale = freshness(c.id) === 'stale'
    const hasOpenBlockers = blockers.some((b) => b.customer_id === c.id && !b.resolved_at)
    const nearGoLive = c.go_live ? (() => { const d = daysUntil(c.go_live as string); return d >= 0 && d <= 7 && progress(c) < 100 })() : false
    return stale || hasOpenBlockers || nearGoLive
  }
  function progressTier(pct: number) {
    if (pct < 34) return 'low'
    if (pct < 67) return 'mid'
    return 'high'
  }
  function statusSlug(status: Task['status']) {
    return status.toLowerCase().replace(/\s+/g, '-')
  }

  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark" />
          <span>Project Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map(({ key, label, icon: Icon }) => (
            <button key={key} className={tab === key ? 'sidebar-link active' : 'sidebar-link'} onClick={() => setTab(key)}>
              <Icon size={16} />
              {label}
              {key === 'review' && pendingDrafts.length > 0 && <span className="nav-badge">{pendingDrafts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-who">{session.user.email}{myRole && <span className={`role-tag role-${myRole}`}>{myRole}</span>}</div>
          <button className="sidebar-theme-toggle" onClick={() => setDark((v) => !v)}>
            {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="sidebar-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div>
            <h1>{NAV.find((n) => n.key === tab)?.label}</h1>
            <p className="page-sub">{customers.length} customers tracked</p>
          </div>
          {tab !== 'overview' && tab !== 'customers' && tab !== 'users' && (
            <select className="customer-filter" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="all">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {errorMsg && <div className="banner error-banner">{errorMsg}</div>}
        {myRole === 'viewer' && <div className="banner viewer-banner">You have view-only access. Ask an admin if you need editing rights.</div>}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                <div className="stat-grid">
                  <div className="stat-card accent"><div className="num">{customers.length}</div><div className="label">Customers</div></div>
                  <div className="stat-card"><div className="num">{openTasks.length}</div><div className="label">Open tasks</div></div>
                  <div className="stat-card danger"><div className="num">{openBlockers.length}</div><div className="label">Open blockers</div></div>
                  <div className="stat-card warn"><div className="num">{upcomingGoLive.length}</div><div className="label">Go-lives (next 30d)</div></div>
                </div>

                <div className="section-title">Status</div>
                <div className="status-table">
                  <div className="status-head">
                    <span>Customer</span><span>With</span><span>Current status</span><span>Updated</span>
                  </div>
                  {customers.map((c) => {
                    const latest = latestSpotlightFor(c.id)
                    return (
                      <div key={c.id} className="status-row" onClick={() => { setTab('customers'); setExpanded(c.id) }}>
                        <span className="status-cust">
                          <span className={`freshness-dot ${freshness(c.id)}`} title={`Freshness: ${freshness(c.id)}`} />
                          {c.name}
                          {needsAttention(c) && <AlertCircle size={12} className="attention-icon" />}
                        </span>
                        {latest ? (
                          <>
                            <span><WithBadge who={latest.owner} /></span>
                            <span className="status-text">{latest.text}</span>
                            <span className="muted">{timeAgo(latest.created_at)}</span>
                          </>
                        ) : (
                          <>
                            <span className="muted">—</span>
                            <span className="muted">No status logged yet</span>
                            <span className="muted">—</span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                                <div className="section-title">Upcoming go-lives</div>
                <div className="list">
                  {upcomingGoLive.length === 0 && <p className="muted">Nothing in the next 30 days.</p>}
                  {upcomingGoLive.map((c) => (
                    <div key={c.id} className="feed-card">
                      <div className="feed-top"><span className="feed-cust">{c.name}</span><GoLiveBadge date={c.go_live as string} /></div>
                      <div className="feed-text">{progress(c)}% of roadmap stages complete</div>
                    </div>
                  ))}
                </div>

                <div className="section-title">Customer progress</div>
                <div className="customer-grid">
                  {customers.map((c) => (
                    <div key={c.id} className={`customer-card type-${c.type ?? 'none'}`} onClick={() => { setTab('customers'); setExpanded(c.id) }}>
                      <div className="customer-card-top">
                        <h3>{c.name}{needsAttention(c) && <AlertCircle size={13} className="attention-icon" />}</h3>
                        {c.type && <span className={`badge ${c.type}`}>{c.type}</span>}
                      </div>
                      <div className="customer-owner">{c.owner ?? 'Unassigned'}</div>
                      <div className="progress-track"><div className={`progress-fill ${progressTier(progress(c))}`} style={{ width: `${progress(c)}%` }} /></div>
                      <div className="progress-label"><span>{progress(c)}% complete</span>{c.go_live ? <GoLiveBadge date={c.go_live} /> : <span>no go-live set</span>}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'review' && (
              <>
                {pendingDrafts.length === 0 ? (
                  <p className="muted">All caught up — no drafts waiting on review.</p>
                ) : (
                  <div className="list">
                    {pendingDrafts.map((d) => (
                      <DraftCard
                        key={d.id}
                        draft={d}
                        customerName={customerName(d.customer_id)}
                        canEdit={canEdit}
                        onApprove={approveDraft}
                        onDismiss={dismissDraft}
                      />
                    ))}
                  </div>
                )}

                {statusDrafts.some((d) => d.status !== 'pending') && (
                  <>
                    <div className="section-title">Recently reviewed</div>
                    <div className="list">
                      {statusDrafts.filter((d) => d.status !== 'pending').slice(0, 15).map((d) => (
                        <div key={d.id} className="feed-card system">
                          <div className="feed-top">
                            <span className="feed-cust">{customerName(d.customer_id)} · {d.status}</span>
                            <span>{d.reviewed_by} · {d.reviewed_at ? new Date(d.reviewed_at).toLocaleString() : ''}</span>
                          </div>
                          <div className="feed-text">{d.proposed_text}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'customers' && (
              <>
                {canEdit && <AddCustomerRow onAdd={addCustomer} />}
                <div className="customer-grid">
                  {customers.map((c) => {
                    const isOpen = expanded === c.id
                    const isEditing = editingId === c.id
                    return (
                      <div key={c.id} className={`customer-card type-${c.type ?? 'none'}`} onClick={() => setExpanded(isOpen ? null : c.id)}>
                        <div className="customer-card-top">
                          <h3>
                            {isOpen ? <ChevronDown size={14} style={{ verticalAlign: -2 }} /> : <ChevronRight size={14} style={{ verticalAlign: -2 }} />} {c.name}
                            {needsAttention(c) && <span title="Needs attention"><AlertCircle size={13} className="attention-icon" /></span>}
                          </h3>
                          <div className="card-top-actions" onClick={(e) => e.stopPropagation()}>
                            {c.type && <span className={`badge ${c.type}`}>{c.type}</span>}
                            {canEdit && isOpen && (
                              <button className="icon-btn" title="Edit customer" onClick={() => setEditingId(isEditing ? null : c.id)}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {isAdmin && isOpen && (
                              <button className="icon-btn danger" title="Delete customer" onClick={() => deleteCustomer(c)}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="customer-owner">{c.owner ?? 'Unassigned'}</div>
                        <div className="progress-track"><div className={`progress-fill ${progressTier(progress(c))}`} style={{ width: `${progress(c)}%` }} /></div>
                        <div className="progress-label"><span>{progress(c)}% complete</span>{c.go_live ? <GoLiveBadge date={c.go_live} /> : <span>—</span>}</div>

                        {isOpen && (
                          <div className="customer-expand" onClick={(e) => e.stopPropagation()}>
                            {isEditing ? (
                              <EditCustomerForm
                                customer={c}
                                onSave={(field, value) => updateCustomerField(c.id, field, value)}
                                onClose={() => setEditingId(null)}
                              />
                            ) : (
                              c.notes && <p className="notes">{c.notes}</p>
                            )}

                            <div className="stage-grid">
                              {STAGES.map((s) => {
                                const val = (c[s.key] as string) || ''
                                const state = stageState(val || null)
                                return (
                                  <div key={String(s.key)} className={`stage ${state}`}>
                                    <span className="stage-label">{s.label}</span>
                                    {canEdit ? (
                                      <DateField
                                        className="stage-date-input"
                                        value={val}
                                        onCommit={(v) => updateCustomerField(c.id, String(s.key), v)}
                                      />
                                    ) : (
                                      <span className="stage-date">{val || '—'}</span>
                                    )}
                                    {state === 'scheduled' && <span className="stage-tag">Scheduled</span>}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="stage-legend">
                              <span><span className="legend-dot empty" /> Not started</span>
                              <span><span className="legend-dot scheduled" /> Scheduled</span>
                              <span><span className="legend-dot done" /> Done</span>
                            </div>
                            {c.milestones.length > 0 && (
                              <div className="milestones">
                                <h4>Milestones</h4>
                                {c.milestones.map((m: Milestone) => (
                                  <div key={m.key} className="milestone-row">
                                    <input
                                      type="checkbox"
                                      checked={m.completed}
                                      disabled={!canEdit}
                                      onChange={() => updateMilestone(c, m.key, { completed: !m.completed })}
                                    />
                                    <span className={m.completed ? 'done' : ''}>{m.label}</span>
                                    {canEdit ? (
                                      <DateField
                                        className="milestone-date-input"
                                        value={m.date || ''}
                                        onCommit={(v) => updateMilestone(c, m.key, { date: v })}
                                      />
                                    ) : (
                                      m.date && <span className="muted"> — {m.date}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="milestones">
                              <h4>Status <span className={`freshness-dot ${freshness(c.id)}`} title={`Freshness: ${freshness(c.id)}`} /></h4>
                              {spotlight
                                .filter((s) => s.customer_id === c.id)
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                .slice(0, 5)
                                .map((s) => (
                                  <div key={s.id} className="status-history-row">
                                    <WithBadge who={s.owner} />
                                    <span className="status-history-text">{s.text}</span>
                                    <span className="muted">{timeAgo(s.created_at)}</span>
                                  </div>
                                ))}
                              {spotlight.filter((s) => s.customer_id === c.id).length === 0 && (
                                <p className="muted">No status logged yet.</p>
                              )}
                              {canEdit && <CustomerStatusForm customerId={c.id} onAdd={addSpotlight} />}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {tab === 'tasks' && (
              <>
                {canEdit && <AddRow customers={customers} onAdd={addTask} placeholder="New task title" />}
                <div className="kanban">
                  {(['To Do', 'Open', 'In Progress', 'Done'] as Task['status'][]).map((status) => {
                    const col = filteredTasks.filter((t) => t.status === status)
                    return (
                      <div key={status} className="kanban-col">
                        <div className={`kanban-col-title status-${statusSlug(status)}`}><span>{status}</span><span>{col.length}</span></div>
                        {col.map((t) => (
                          <div key={t.id} className="task-card">
                            <div className="cust">{customerName(t.customer_id)}</div>
                            <div className="title">{t.title}</div>
                            <select value={t.status} disabled={!canEdit} onChange={(e) => setTaskStatus(t.id, e.target.value as Task['status'])}>
                              <option value="To Do">To Do</option>
                              <option value="Open">Open</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Done">Done</option>
                            </select>
                            {t.owner && <div className="owner">{t.owner}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {tab === 'blockers' && (
              <>
                {canEdit && <AddRow customers={customers} onAdd={addBlocker} placeholder="New blocker title" />}
                <div className="list">
                  {filteredBlockers.map((b) => (
                    <div key={b.id} className={b.resolved_at ? 'blocker-card resolved' : 'blocker-card'}>
                      <div className="blocker-top">
                        <div>
                          <div className="blocker-cust">{customerName(b.customer_id)}{b.type ? ` · ${b.type}` : ''}</div>
                          <div className="blocker-title">{b.title}</div>
                        </div>
                        <button
                          className={b.resolved_at ? 'pill resolved' : 'pill open'}
                          disabled={!canEdit}
                          onClick={() => toggleBlockerResolved(b)}
                        >
                          {b.resolved_at ? 'Resolved' : 'Open'}
                        </button>
                      </div>
                      {b.detail && <div className="blocker-detail">{b.detail}</div>}
                      <div className="blocker-meta">Raised {new Date(b.created_at).toLocaleDateString()}{b.resolved_at ? ` · Resolved ${new Date(b.resolved_at).toLocaleDateString()}` : ''}</div>
                    </div>
                  ))}
                  {filteredBlockers.length === 0 && <p className="muted">No blockers yet.</p>}
                </div>
              </>
            )}

            {tab === 'status' && (
              <>
                {canEdit && <AddStatusRow customers={customers} onAdd={addSpotlight} />}
                <div className="list">
                  {filteredSpotlight.map((s) => (
                    <div key={s.id} className="feed-card">
                      <div className="feed-top"><span className="feed-cust">{customerName(s.customer_id)}</span><span>{s.owner} · {new Date(s.created_at).toLocaleDateString()}</span></div>
                      <div className="feed-text">{s.text}</div>
                    </div>
                  ))}
                  {filteredSpotlight.length === 0 && <p className="muted">Nothing spotlighted yet.</p>}
                </div>
              </>
            )}

            {tab === 'updates' && (
              <>
                {canEdit && <AddRow customers={customers} onAdd={addUpdateNote} placeholder="New update note" textarea />}
                <div className="list">
                  {filteredUpdates.map((u) => (
                    <div key={u.id} className={u.is_system ? 'feed-card system' : 'feed-card'}>
                      <div className="feed-top"><span className="feed-cust">{customerName(u.customer_id)}</span><span>{u.author} · {new Date(u.created_at).toLocaleString()}</span></div>
                      <div className="feed-text">{u.text}</div>
                    </div>
                  ))}
                  {filteredUpdates.length === 0 && <p className="muted">No updates logged yet.</p>}
                </div>
              </>
            )}

            {tab === 'users' && isAdmin && (
              <UsersTab
                users={allowedUsers}
                myEmail={session.user.email ?? ''}
                onAdd={addAllowedUser}
                onRoleChange={updateUserRole}
                onRemove={removeAllowedUser}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function DateField({ value, onCommit, className }: { value: string; onCommit: (value: string) => void; className?: string }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  function commit() {
    if (local !== value) onCommit(local)
  }

  return (
    <input
      type="date"
      className={className}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

function GoLiveBadge({ date }: { date: string }) {
  const days = Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000)

  // A go-live date in the past just means it already happened — that's a fact worth
  // showing calmly, not a missed deadline. Only the imminent future window carries urgency.
  if (days < 0) return <span className="golive-badge past">Live since {date}</span>
  if (days === 0) return <span className="golive-badge soon">Go-live today</span>
  if (days <= 7) return <span className="golive-badge soon">Go-live in {days}d</span>
  return <span className="golive-badge upcoming">Go-live {date}</span>
}

function WithBadge({ who }: { who: string | null }) {
  const w = (who || 'unknown').toLowerCase()
  const label = who || 'Unknown'
  return <span className={`with-badge with-${w}`}>{label}</span>
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function AddStatusRow({ customers, onAdd }: { customers: Customer[]; onAdd: (customerId: string, who: string, text: string) => void }) {
  const [customerId, setCustomerId] = useState('')
  const [who, setWho] = useState('Both')
  const [text, setText] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(customerId, who, text)
    setText('')
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
        <option value="" disabled>Customer…</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="Us">With us</option>
        <option value="Customer">With customer</option>
        <option value="Both">Both</option>
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Current status / requirement" required />
      <button type="submit">Update status</button>
    </form>
  )
}

function CustomerStatusForm({ customerId, onAdd }: { customerId: string; onAdd: (customerId: string, who: string, text: string) => void }) {
  const [who, setWho] = useState('Both')
  const [text, setText] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(customerId, who, text)
    setText('')
  }
  return (
    <form className="add-row inline-status-form" onSubmit={submit}>
      <select value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="Us">With us</option>
        <option value="Customer">With customer</option>
        <option value="Both">Both</option>
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Log a status update…" required />
      <button type="submit">Update</button>
    </form>
  )
}

function DraftCard({
  draft,
  customerName,
  canEdit,
  onApprove,
  onDismiss,
}: {
  draft: StatusDraft
  customerName: string
  canEdit: boolean
  onApprove: (draft: StatusDraft, text: string, owner: string) => void
  onDismiss: (draft: StatusDraft) => void
}) {
  const [text, setText] = useState(draft.proposed_text)
  const [owner, setOwner] = useState(draft.proposed_owner)

  return (
    <div className="draft-card">
      <div className="draft-top">
        <span className="feed-cust">{customerName}</span>
        <span className="muted">{new Date(draft.created_at).toLocaleString()}</span>
      </div>
      {draft.source_summary && <div className="draft-source muted">{draft.source_summary}</div>}
      <div className="draft-edit-row">
        <select value={owner} disabled={!canEdit} onChange={(e) => setOwner(e.target.value as StatusDraft['proposed_owner'])}>
          <option value="Us">With us</option>
          <option value="Customer">With customer</option>
          <option value="Both">Both</option>
        </select>
        <textarea value={text} disabled={!canEdit} onChange={(e) => setText(e.target.value)} />
      </div>
      {canEdit && (
        <div className="draft-actions">
          <button className="approve-btn" onClick={() => onApprove(draft, text, owner)}>Approve</button>
          <button className="dismiss-btn" onClick={() => onDismiss(draft)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

function AddRow({ customers, onAdd, placeholder, textarea }: { customers: Customer[]; onAdd: (customerId: string, text: string) => void; placeholder: string; textarea?: boolean }) {
  const [customerId, setCustomerId] = useState('')
  const [text, setText] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(customerId, text)
    setText('')
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
        <option value="" disabled>Customer…</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {textarea ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} required />
      ) : (
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} required />
      )}
      <button type="submit">Add</button>
    </form>
  )
}

function AddCustomerRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(name)
    setName('')
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New customer name" required />
      <button type="submit">Add</button>
    </form>
  )
}

function EditCustomerForm({
  customer,
  onSave,
  onClose,
}: {
  customer: Customer
  onSave: (field: string, value: string | null) => void
  onClose: () => void
}) {
  const [name, setName] = useState(customer.name)
  const [owner, setOwner] = useState(customer.owner ?? '')
  const [type, setType] = useState(customer.type ?? '')
  const [jiraEpicKey, setJiraEpicKey] = useState(customer.jira_epic_key ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim() && name.trim() !== customer.name) onSave('name', name.trim())
    if (owner !== (customer.owner ?? '')) onSave('owner', owner)
    if (type !== (customer.type ?? '')) onSave('type', type)
    if (jiraEpicKey !== (customer.jira_epic_key ?? '')) onSave('jira_epic_key', jiraEpicKey)
    if (notes !== (customer.notes ?? '')) onSave('notes', notes)
    onClose()
  }

  return (
    <form className="edit-customer-form" onSubmit={submit}>
      <div className="edit-grid">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Owner<input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <label>Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">—</option>
            <option value="poc">POC</option>
            <option value="termed">Termed</option>
            <option value="established">Established</option>
          </select>
        </label>
        <label>Jira epic key<input value={jiraEpicKey} onChange={(e) => setJiraEpicKey(e.target.value)} placeholder="e.g. PROJ-809" /></label>
      </div>
      <label className="edit-notes">Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="draft-actions">
        <button className="approve-btn" type="submit">Save</button>
        <button className="dismiss-btn" type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}

function UsersTab({
  users,
  myEmail,
  onAdd,
  onRoleChange,
  onRemove,
}: {
  users: AllowedUser[]
  myEmail: string
  onAdd: (email: string, role: Role) => void
  onRoleChange: (email: string, role: Role) => void
  onRemove: (email: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(email, role)
    setEmail('')
    setRole('viewer')
  }

  return (
    <>
      <form className="add-row" onSubmit={submit}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" required />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="viewer">Viewer — view only</option>
          <option value="editor">Editor — can add/edit, no delete</option>
          <option value="admin">Admin — full control</option>
        </select>
        <button type="submit">Grant access</button>
      </form>

      <div className="users-table">
        <div className="users-head">
          <span>Email</span><span>Role</span><span>Added</span><span></span>
        </div>
        {users.map((u) => (
          <div key={u.email} className="users-row">
            <span>{u.email}{u.email === myEmail && <span className="muted"> (you)</span>}</span>
            <select value={u.role} onChange={(e) => onRoleChange(u.email, e.target.value as Role)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <span className="muted">{new Date(u.added_at).toLocaleDateString()}</span>
            <button className="icon-btn danger" disabled={u.email === myEmail} title="Remove access" onClick={() => onRemove(u.email)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <p className="muted users-note">Removing access blocks that email from signing in at all (enforced at login, not just data visibility).</p>
    </>
  )
}

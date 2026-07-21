import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LayoutDashboard, Building2, CheckSquare, AlertTriangle, Star, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from './supabaseClient'
import type { Customer, Task, Blocker, UpdateRow, Spotlight, Milestone } from './types'

type Tab = 'overview' | 'customers' | 'tasks' | 'blockers' | 'spotlight' | 'updates'

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

const NAV: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'customers', label: 'Customers', icon: Building2 },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'blockers', label: 'Blockers', icon: AlertTriangle },
  { key: 'spotlight', label: 'Spotlight', icon: Star },
  { key: 'updates', label: 'Updates', icon: Clock },
]

export default function Dashboard({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [updates, setUpdates] = useState<UpdateRow[]>([])
  const [spotlight, setSpotlight] = useState<Spotlight[]>([])
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    const [c, t, b, u, s] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('blockers').select('*').order('created_at', { ascending: false }),
      supabase.from('updates').select('*').order('created_at', { ascending: false }),
      supabase.from('spotlight').select('*').order('created_at', { ascending: false }),
    ])
    if (c.error || t.error || b.error || u.error || s.error) {
      setErrorMsg((c.error || t.error || b.error || u.error || s.error)?.message ?? 'Could not load data.')
    } else {
      setCustomers(c.data as Customer[])
      setTasks(t.data as Task[])
      setBlockers(b.data as Blocker[])
      setUpdates(u.data as UpdateRow[])
      setSpotlight(s.data as Spotlight[])
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? '—'
  }

  async function addCustomer(name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('customers').insert({ name: name.trim() })
    if (error) setErrorMsg(error.message); else loadAll()
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
  async function toggleMilestone(customer: Customer, key: string) {
    const updated = customer.milestones.map((m) => (m.key === key ? { ...m, completed: !m.completed } : m))
    const { error } = await supabase.from('customers').update({ milestones: updated }).eq('id', customer.id)
    if (error) setErrorMsg(error.message); else loadAll()
  }

  const filteredTasks = tasks.filter((t) => customerFilter === 'all' || t.customer_id === customerFilter)
  const filteredBlockers = blockers.filter((b) => customerFilter === 'all' || b.customer_id === customerFilter)
  const filteredUpdates = updates.filter((u) => customerFilter === 'all' || u.customer_id === customerFilter)
  const filteredSpotlight = spotlight.filter((s) => customerFilter === 'all' || s.customer_id === customerFilter)

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

  function progress(c: Customer) {
    const done = STAGES.filter((s) => c[s.key]).length
    return Math.round((done / STAGES.length) * 100)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark" />
          <span>Project Dashboard</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} className={tab === key ? 'sidebar-link active' : 'sidebar-link'} onClick={() => setTab(key)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-who">{session.user.email}</div>
          <button className="sidebar-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div>
            <h1>{NAV.find((n) => n.key === tab)?.label}</h1>
            <p className="page-sub">{customers.length} customers tracked</p>
          </div>
          {tab !== 'overview' && tab !== 'customers' && (
            <select className="customer-filter" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="all">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {errorMsg && <div className="banner error-banner">{errorMsg}</div>}

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
                    const latest = spotlight
                      .filter((s) => s.customer_id === c.id)
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                    return (
                      <div key={c.id} className="status-row" onClick={() => { setTab('customers'); setExpanded(c.id) }}>
                        <span className="status-cust">{c.name}</span>
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
                      <div className="feed-top"><span className="feed-cust">{c.name}</span><span>{c.go_live}</span></div>
                      <div className="feed-text">{progress(c)}% of roadmap stages complete</div>
                    </div>
                  ))}
                </div>

                <div className="section-title">Customer progress</div>
                <div className="customer-grid">
                  {customers.map((c) => (
                    <div key={c.id} className="customer-card" onClick={() => { setTab('customers'); setExpanded(c.id) }}>
                      <div className="customer-card-top">
                        <h3>{c.name}</h3>
                        {c.type && <span className={`badge ${c.type}`}>{c.type}</span>}
                      </div>
                      <div className="customer-owner">{c.owner ?? 'Unassigned'}</div>
                      <div className="progress-track"><div className="progress-fill" style={{ width: `${progress(c)}%` }} /></div>
                      <div className="progress-label"><span>{progress(c)}% complete</span><span>{c.go_live ?? 'no go-live set'}</span></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'customers' && (
              <>
                <AddCustomerRow onAdd={addCustomer} />
                <div className="customer-grid">
                  {customers.map((c) => {
                    const isOpen = expanded === c.id
                    return (
                      <div key={c.id} className="customer-card" onClick={() => setExpanded(isOpen ? null : c.id)}>
                        <div className="customer-card-top">
                          <h3>{isOpen ? <ChevronDown size={14} style={{ verticalAlign: -2 }} /> : <ChevronRight size={14} style={{ verticalAlign: -2 }} />} {c.name}</h3>
                          {c.type && <span className={`badge ${c.type}`}>{c.type}</span>}
                        </div>
                        <div className="customer-owner">{c.owner ?? 'Unassigned'}</div>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress(c)}%` }} /></div>
                        <div className="progress-label"><span>{progress(c)}% complete</span><span>{c.go_live ?? '—'}</span></div>

                        {isOpen && (
                          <div className="customer-expand" onClick={(e) => e.stopPropagation()}>
                            {c.notes && <p className="notes">{c.notes}</p>}
                            <div className="stage-grid">
                              {STAGES.map((s) => (
                                <div key={String(s.key)} className={c[s.key] ? 'stage done' : 'stage'}>
                                  <span className="stage-label">{s.label}</span>
                                  <span className="stage-date">{(c[s.key] as string) || '—'}</span>
                                </div>
                              ))}
                            </div>
                            {c.milestones.length > 0 && (
                              <div className="milestones">
                                <h4>Milestones</h4>
                                {c.milestones.map((m: Milestone) => (
                                  <label key={m.key} className="milestone-row">
                                    <input type="checkbox" checked={m.completed} onChange={() => toggleMilestone(c, m.key)} />
                                    <span className={m.completed ? 'done' : ''}>{m.label}</span>
                                    {m.date && <span className="muted"> — {m.date}</span>}
                                  </label>
                                ))}
                              </div>
                            )}
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
                <AddRow customers={customers} onAdd={addTask} placeholder="New task title" />
                <div className="kanban">
                  {(['To Do', 'Open', 'In Progress', 'Done'] as Task['status'][]).map((status) => {
                    const col = filteredTasks.filter((t) => t.status === status)
                    return (
                      <div key={status} className="kanban-col">
                        <div className="kanban-col-title"><span>{status}</span><span>{col.length}</span></div>
                        {col.map((t) => (
                          <div key={t.id} className="task-card">
                            <div className="cust">{customerName(t.customer_id)}</div>
                            <div className="title">{t.title}</div>
                            <select value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value as Task['status'])}>
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
                <AddRow customers={customers} onAdd={addBlocker} placeholder="New blocker title" />
                <div className="list">
                  {filteredBlockers.map((b) => (
                    <div key={b.id} className={b.resolved_at ? 'blocker-card resolved' : 'blocker-card'}>
                      <div className="blocker-top">
                        <div>
                          <div className="blocker-cust">{customerName(b.customer_id)}{b.type ? ` · ${b.type}` : ''}</div>
                          <div className="blocker-title">{b.title}</div>
                        </div>
                        <button className={b.resolved_at ? 'pill resolved' : 'pill open'} onClick={() => toggleBlockerResolved(b)}>
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

            {tab === 'spotlight' && (
              <>
                <AddStatusRow customers={customers} onAdd={addSpotlight} />
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
                <AddRow customers={customers} onAdd={addUpdateNote} placeholder="New update note" textarea />
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
          </>
        )}
      </main>
    </div>
  )
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

import { useEffect, useState, Fragment } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Customer, Task, Blocker, UpdateRow, Spotlight, Milestone } from './types'

type Tab = 'tasks' | 'blockers' | 'updates' | 'spotlight' | 'customers'

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

export default function Dashboard({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('customers')
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
      setErrorMsg(
        (c.error || t.error || b.error || u.error || s.error)?.message ??
          'Could not load data. Your account may not be authorized.'
      )
    } else {
      setCustomers(c.data as Customer[])
      setTasks(t.data as Task[])
      setBlockers(b.data as Blocker[])
      setUpdates(u.data as UpdateRow[])
      setSpotlight(s.data as Spotlight[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? '—'
  }

  async function addCustomer(name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('customers').insert({ name: name.trim() })
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function addTask(customerId: string, title: string) {
    if (!title.trim() || !customerId) return
    const { error } = await supabase.from('tasks').insert({ customer_id: customerId, title: title.trim() })
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function setTaskStatus(id: string, status: Task['status']) {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function addBlocker(customerId: string, title: string) {
    if (!title.trim() || !customerId) return
    const { error } = await supabase.from('blockers').insert({ customer_id: customerId, title: title.trim() })
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function toggleBlockerResolved(b: Blocker) {
    const { error } = await supabase
      .from('blockers')
      .update({ resolved_at: b.resolved_at ? null : new Date().toISOString() })
      .eq('id', b.id)
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function addUpdateNote(customerId: string, text: string) {
    if (!text.trim() || !customerId) return
    const { error } = await supabase
      .from('updates')
      .insert({ customer_id: customerId, text: text.trim(), author: session.user.email })
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function addSpotlight(customerId: string, text: string) {
    if (!text.trim() || !customerId) return
    const { error } = await supabase
      .from('spotlight')
      .insert({ customer_id: customerId, text: text.trim(), owner: session.user.email })
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  async function toggleMilestone(customer: Customer, key: string) {
    const updated = customer.milestones.map((m) => (m.key === key ? { ...m, completed: !m.completed } : m))
    const { error } = await supabase.from('customers').update({ milestones: updated }).eq('id', customer.id)
    if (error) setErrorMsg(error.message)
    else loadAll()
  }

  const filteredTasks = tasks.filter((t) => customerFilter === 'all' || t.customer_id === customerFilter)
  const filteredBlockers = blockers.filter((b) => customerFilter === 'all' || b.customer_id === customerFilter)
  const filteredUpdates = updates.filter((u) => customerFilter === 'all' || u.customer_id === customerFilter)
  const filteredSpotlight = spotlight.filter((s) => customerFilter === 'all' || s.customer_id === customerFilter)

  return (
    <div className="dashboard">
      <header className="topbar">
        <h1>Project Dashboard</h1>
        <div className="topbar-right">
          <span className="who">{session.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {errorMsg && <div className="banner error-banner">{errorMsg}</div>}

      <nav className="tabs">
        {(['customers', 'spotlight', 'tasks', 'blockers', 'updates'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <select
          className="customer-filter"
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
        >
          <option value="all">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </nav>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {tab === 'customers' && (
            <Section title="Customers">
              <NewCustomerRow onAdd={addCustomer} />
              <table>
                <thead><tr><th></th><th>Name</th><th>Owner</th><th>Type</th><th>Next milestone</th></tr></thead>
                <tbody>
                  {customers.map((c) => {
                    const nextStage = STAGES.find((s) => !c[s.key])
                    return (
                      <Fragment key={c.id}>
                        <tr key={c.id} className="clickable" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                          <td>{expanded === c.id ? '▾' : '▸'}</td>
                          <td>{c.name}</td>
                          <td>{c.owner ?? '—'}</td>
                          <td>{c.type ?? '—'}</td>
                          <td className="muted">{nextStage ? nextStage.label : 'All stages set'}</td>
                        </tr>
                        {expanded === c.id && (
                          <tr key={c.id + '-detail'}>
                            <td></td>
                            <td colSpan={4}>
                              <div className="customer-detail">
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
                                        <input
                                          type="checkbox"
                                          checked={m.completed}
                                          onChange={() => toggleMilestone(c, m.key)}
                                        />
                                        <span className={m.completed ? 'done' : ''}>{m.label}</span>
                                        {m.date && <span className="muted"> — {m.date}</span>}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {tab === 'spotlight' && (
            <Section title="Spotlight">
              <AddRow customers={customers} onAdd={addSpotlight} placeholder="Current status / focus" textarea />
              <table>
                <thead><tr><th>Customer</th><th>Status</th><th>Owner</th><th>When</th></tr></thead>
                <tbody>
                  {filteredSpotlight.map((s) => (
                    <tr key={s.id}>
                      <td>{customerName(s.customer_id)}</td>
                      <td className="wrap">{s.text}</td>
                      <td>{s.owner}</td>
                      <td className="muted">{new Date(s.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredSpotlight.length === 0 && <tr><td colSpan={4} className="muted">Nothing spotlighted yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          )}

          {tab === 'tasks' && (
            <Section title="Tasks">
              <AddRow customers={customers} onAdd={addTask} placeholder="New task title" />
              <table>
                <thead><tr><th>Customer</th><th>Title</th><th>Owner</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {filteredTasks.map((t) => (
                    <tr key={t.id}>
                      <td>{customerName(t.customer_id)}</td>
                      <td>{t.title}</td>
                      <td className="muted">{t.owner ?? '—'}</td>
                      <td>
                        <select value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value as Task['status'])}>
                          <option value="To Do">To Do</option>
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Done">Done</option>
                        </select>
                      </td>
                      <td className="muted">{new Date(t.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredTasks.length === 0 && <tr><td colSpan={5} className="muted">No tasks yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          )}

          {tab === 'blockers' && (
            <Section title="Blockers">
              <AddRow customers={customers} onAdd={addBlocker} placeholder="New blocker title" />
              <table>
                <thead><tr><th>Customer</th><th>Title</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {filteredBlockers.map((b) => (
                    <tr key={b.id}>
                      <td>{customerName(b.customer_id)}</td>
                      <td>
                        {b.title}
                        {b.detail && <div className="detail muted">{b.detail}</div>}
                      </td>
                      <td className="muted">{b.type ?? '—'}</td>
                      <td>
                        <button className={b.resolved_at ? 'pill resolved' : 'pill open'} onClick={() => toggleBlockerResolved(b)}>
                          {b.resolved_at ? 'Resolved' : 'Open'}
                        </button>
                      </td>
                      <td className="muted">{new Date(b.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredBlockers.length === 0 && <tr><td colSpan={5} className="muted">No blockers yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          )}

          {tab === 'updates' && (
            <Section title="Updates">
              <AddRow customers={customers} onAdd={addUpdateNote} placeholder="New update note" textarea />
              <table>
                <thead><tr><th>Customer</th><th>Note</th><th>Author</th><th>When</th></tr></thead>
                <tbody>
                  {filteredUpdates.map((u) => (
                    <tr key={u.id} className={u.is_system ? 'system-row' : ''}>
                      <td>{customerName(u.customer_id)}</td>
                      <td className="wrap">{u.text}</td>
                      <td>{u.author}</td>
                      <td className="muted">{new Date(u.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredUpdates.length === 0 && <tr><td colSpan={4} className="muted">No updates logged yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function AddRow({
  customers,
  onAdd,
  placeholder,
  textarea,
}: {
  customers: Customer[]
  onAdd: (customerId: string, text: string) => void
  placeholder: string
  textarea?: boolean
}) {
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
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
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

function NewCustomerRow({ onAdd }: { onAdd: (name: string) => void }) {
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

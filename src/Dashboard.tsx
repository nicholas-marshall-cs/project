import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Customer, Task, Blocker, UpdateRow } from './types'

type Tab = 'tasks' | 'blockers' | 'updates' | 'customers'

export default function Dashboard({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('tasks')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [updates, setUpdates] = useState<UpdateRow[]>([])
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    const [c, t, b, u] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('blockers').select('*').order('created_at', { ascending: false }),
      supabase.from('updates').select('*').order('created_at', { ascending: false }),
    ])
    if (c.error || t.error || b.error || u.error) {
      setErrorMsg(
        (c.error || t.error || b.error || u.error)?.message ??
          'Could not load data. Your account may not be authorized.'
      )
    } else {
      setCustomers(c.data as Customer[])
      setTasks(t.data as Task[])
      setBlockers(b.data as Blocker[])
      setUpdates(u.data as UpdateRow[])
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

  const filteredTasks = tasks.filter((t) => customerFilter === 'all' || t.customer_id === customerFilter)
  const filteredBlockers = blockers.filter((b) => customerFilter === 'all' || b.customer_id === customerFilter)
  const filteredUpdates = updates.filter((u) => customerFilter === 'all' || u.customer_id === customerFilter)

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
        {(['tasks', 'blockers', 'updates', 'customers'] as Tab[]).map((t) => (
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
          {tab === 'tasks' && (
            <Section title="Tasks">
              <AddRow customers={customers} onAdd={addTask} placeholder="New task title" />
              <table>
                <thead><tr><th>Customer</th><th>Title</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {filteredTasks.map((t) => (
                    <tr key={t.id}>
                      <td>{customerName(t.customer_id)}</td>
                      <td>{t.title}</td>
                      <td>
                        <select value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value as Task['status'])}>
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Done">Done</option>
                        </select>
                      </td>
                      <td className="muted">{new Date(t.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredTasks.length === 0 && <tr><td colSpan={4} className="muted">No tasks yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          )}

          {tab === 'blockers' && (
            <Section title="Blockers">
              <AddRow customers={customers} onAdd={addBlocker} placeholder="New blocker title" />
              <table>
                <thead><tr><th>Customer</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {filteredBlockers.map((b) => (
                    <tr key={b.id}>
                      <td>{customerName(b.customer_id)}</td>
                      <td>{b.title}</td>
                      <td>
                        <button className={b.resolved_at ? 'pill resolved' : 'pill open'} onClick={() => toggleBlockerResolved(b)}>
                          {b.resolved_at ? 'Resolved' : 'Open'}
                        </button>
                      </td>
                      <td className="muted">{new Date(b.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredBlockers.length === 0 && <tr><td colSpan={4} className="muted">No blockers yet.</td></tr>}
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
                    <tr key={u.id}>
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

          {tab === 'customers' && (
            <Section title="Customers">
              <NewCustomerRow onAdd={addCustomer} />
              <table>
                <thead><tr><th>Name</th><th>Added</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="muted">{new Date(c.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
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

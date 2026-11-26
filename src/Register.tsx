import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Bird, Check, ClipboardCopy, ExternalLink, Inbox, ListTodo, Pencil, Search, Sun, Moon, Trash2, Undo2, Users, Layers, CheckCheck, AlertTriangle } from 'lucide-react'
import { supabase } from './supabaseClient'
import type { Customer, Item, ItemLink, Person, Priority, ItemStatus, SweepRun } from './types'

type View = 'mine' | 'chase' | 'inbox' | 'all' | 'done'

const VIEWS: { key: View; label: string; icon: typeof ListTodo; hint: string }[] = [
  { key: 'mine', label: 'My list', icon: ListTodo, hint: 'Things you own, ranked: P1 before P2 before P3, then project rank, then due date.' },
  { key: 'chase', label: 'Chase list', icon: Users, hint: 'Everything waiting on someone else, grouped by who, oldest first.' },
  { key: 'inbox', label: 'Inbox', icon: Inbox, hint: 'New items from the sweep (and migrated rows). Accept to track, bin to drop.' },
  { key: 'all', label: 'All open', icon: Layers, hint: 'Every accepted open item, whoever owns it.' },
  { key: 'done', label: 'Done (14d)', icon: CheckCheck, hint: 'Closed in the last 14 days. Undo if it was closed by mistake.' },
]

const OPEN: ItemStatus[] = ['open', 'waiting']

export default function Register({ session }: { session: Session }) {
  const [view, setView] = useState<View>('mine')
  const [items, setItems] = useState<Item[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [links, setLinks] = useState<ItemLink[]>([])
  const [lastRun, setLastRun] = useState<SweepRun | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('pd-theme') === 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('pd-theme', dark ? 'dark' : 'light')
  }, [dark])

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    const since = new Date(Date.now() - 14 * 86400000).toISOString()
    const [i, p, c, l, r, me] = await Promise.all([
      supabase.from('items').select('*').or(`status.in.(open,waiting),closed_at.gte.${since}`).neq('triage', 'binned'),
      supabase.from('people').select('*').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('item_links').select('*'),
      supabase.from('sweep_runs').select('*').order('started_at', { ascending: false }).limit(1),
      supabase.rpc('my_role'),
    ])
    const err = i.error || p.error || c.error || l.error || r.error
    if (err) setErrorMsg(err.message)
    else {
      setItems(i.data as Item[])
      setPeople(p.data as Person[])
      setCustomers(c.data as Customer[])
      setLinks(l.data as ItemLink[])
      setLastRun(((r.data as SweepRun[]) ?? [])[0] ?? null)
    }
    if (!me.error) setRole((me.data as string) ?? 'viewer')
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  const me = people.find((p) => p.is_me)
  const personName = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? '—' : '—')
  const customer = (id: string | null) => (id ? customers.find((c) => c.id === id) : undefined)
  const linksFor = (id: string) => links.filter((l) => l.item_id === id)

  async function patch(item: Item, change: Partial<Item>) {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...change } : x)))
    const { error } = await supabase.from('items').update(change).eq('id', item.id)
    if (error) { setErrorMsg(error.message); loadAll() }
  }
  const markDone = (it: Item) => patch(it, { status: 'done', closed_at: new Date().toISOString(), triage: 'accepted' })
  const reopen = (it: Item) => patch(it, { status: it.waiting_on_id ? 'waiting' : 'open', closed_at: null })
  const accept = (it: Item) => patch(it, { triage: 'accepted' })
  const bin = (it: Item) => {
    setItems((prev) => prev.filter((x) => x.id !== it.id))
    supabase.from('items').update({ triage: 'binned', status: 'dropped', closed_at: new Date().toISOString() }).eq('id', it.id)
      .then(({ error }) => { if (error) { setErrorMsg(error.message); loadAll() } })
  }

  async function addItem(f: { title: string; customer_id: string; priority: Priority; due: string; waiting_on_id: string; jira_key: string }) {
    if (!f.title.trim()) return
    const { error } = await supabase.from('items').insert({
      title: f.title.trim(),
      customer_id: f.customer_id || null,
      owner_id: me?.id ?? null,
      waiting_on_id: f.waiting_on_id || null,
      priority: f.priority,
      due: f.due || null,
      jira_key: f.jira_key.trim().toUpperCase() || null,
      is_engineering: !!f.jira_key.trim(),
      status: f.waiting_on_id ? 'waiting' : 'open',
      triage: 'accepted',
      origin: 'manual',
    })
    if (error) setErrorMsg(error.message); else loadAll()
  }

  // ---------- derived lists ----------
  const matches = (it: Item) => {
    if (customerFilter !== 'all' && it.customer_id !== customerFilter) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [it.title, it.notes ?? '', it.jira_key ?? '', customer(it.customer_id)?.name ?? '', personName(it.waiting_on_id), personName(it.owner_id)]
      .some((s) => s.toLowerCase().includes(q))
  }
  const rankSort = (a: Item, b: Item) =>
    a.priority.localeCompare(b.priority) ||
    (customer(a.customer_id)?.project_rank ?? 99) - (customer(b.customer_id)?.project_rank ?? 99) ||
    (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
    (a.rank ?? 999) - (b.rank ?? 999)

  const openAccepted = items.filter((i) => OPEN.includes(i.status) && i.triage === 'accepted' && matches(i))
  const mine = openAccepted.filter((i) => i.owner_id === me?.id).sort(rankSort)
  const inbox = items.filter((i) => OPEN.includes(i.status) && i.triage === 'inbox' && matches(i)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const done = items.filter((i) => i.status === 'done' && matches(i)).sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
  const chaseGroups = useMemo(() => {
    const g = new Map<string, Item[]>()
    for (const it of openAccepted) {
      if (!it.waiting_on_id || it.waiting_on_id === me?.id) continue
      const arr = g.get(it.waiting_on_id) ?? []
      arr.push(it)
      g.set(it.waiting_on_id, arr)
    }
    return [...g.entries()]
      .map(([pid, list]) => ({ pid, name: personName(pid), list: list.sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
      .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name))
  }, [items, people, customerFilter, query])

  const counts: Record<View, number> = {
    mine: mine.length,
    chase: chaseGroups.reduce((n, g) => n + g.list.length, 0),
    inbox: inbox.length,
    all: openAccepted.length,
    done: done.length,
  }

  function chaseMessage(name: string, list: Item[]) {
    const first = name.startsWith('Customer: ') ? 'team' : name.split(' ')[0]
    const lines = list.map((it) => {
      const bits = [it.title]
      if (it.jira_key) bits.push(`(${it.jira_key})`)
      if (it.due) bits.push(`— needed by ${fmtDate(it.due)}`)
      return `• ${bits.join(' ')}`
    })
    return `Hi ${first}, a quick check-in on what I'm waiting on from you:\n${lines.join('\n')}\nAny update or ETA on these would be great. Thanks!`
  }
  async function copyChase(pid: string, name: string, list: Item[]) {
    try {
      await navigator.clipboard.writeText(chaseMessage(name, list))
      setCopied(pid)
      setTimeout(() => setCopied(null), 2000)
    } catch { setErrorMsg('Could not copy to clipboard.') }
  }

  const health = lastRun ? Object.entries(lastRun.source_health ?? {}).filter(([, v]) => v !== 'ok') : []
  const isAdmin = role === 'admin'

  const rowProps = { people, customers, personName, customer, linksFor, editingId, setEditingId, patch, markDone, reopen, accept, bin }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark"><Bird size={16} /></div>
          <span>Kestrel</span>
        </div>
        <nav className="sidebar-nav">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={view === key ? 'sidebar-link active' : 'sidebar-link'} onClick={() => setView(key)}>
              <Icon size={16} />
              {label}
              {key === 'inbox' && counts.inbox > 0 ? <span className="nav-badge">{counts.inbox}</span> : <span className="nav-count">{counts[key]}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-who">{session.user.email}</div>
          <button className="sidebar-theme-toggle" onClick={() => setDark((v) => !v)}>
            {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="sidebar-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
          <div className="sidebar-credit">Chase register · built by Nick</div>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div>
            <h1>{VIEWS.find((v) => v.key === view)?.label}</h1>
            <p className="page-sub">{VIEWS.find((v) => v.key === view)?.hint}</p>
          </div>
          <div className="page-header-actions">
            <div className="reg-search">
              <Search size={14} />
              <input placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className="customer-filter" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="all">All projects</option>
              {customers.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {errorMsg && <div className="banner error-banner">{errorMsg}</div>}
        {role && !isAdmin && <div className="banner viewer-banner">Kestrel is private for now. Your account doesn't have access to the register.</div>}
        <SweepBanner run={lastRun} health={health} />

        {loading ? <p className="muted">Loading…</p> : (
          <>
            {(view === 'mine' || view === 'all') && isAdmin && (
              <AddItemRow customers={customers} people={people} onAdd={addItem} />
            )}

            {view === 'mine' && <ItemList items={mine} empty="Nothing on your list. Enjoy it." numbered {...rowProps} />}
            {view === 'all' && <ItemList items={[...openAccepted].sort(rankSort)} empty="No open items." showOwner {...rowProps} />}
            {view === 'inbox' && <ItemList items={inbox} empty="Inbox zero." inbox showOwner {...rowProps} />}
            {view === 'done' && <ItemList items={done} empty="Nothing closed in the last 14 days." showOwner {...rowProps} />}

            {view === 'chase' && (
              chaseGroups.length === 0 ? <p className="muted">Nobody owes you anything right now.</p> : (
                <div className="chase-groups">
                  {chaseGroups.map((g) => (
                    <section key={g.pid} className="chase-group">
                      <header className="chase-head">
                        <div>
                          <span className="chase-name">{g.name}</span>
                          <span className="muted"> · {g.list.length} item{g.list.length > 1 ? 's' : ''} · oldest {daysAgo(g.list[0].created_at)}d</span>
                        </div>
                        <button className="digest-btn" onClick={() => copyChase(g.pid, g.name, g.list)}>
                          <ClipboardCopy size={13} /> {copied === g.pid ? 'Copied!' : 'Copy chase message'}
                        </button>
                      </header>
                      <ItemList items={g.list} empty="" showOwner hideWaiting {...rowProps} />
                    </section>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ---------- pieces ----------

function SweepBanner({ run, health }: { run: SweepRun | null; health: [string, string][] }) {
  if (!run) return <div className="banner sweep-banner">No sweep has run yet. Items here come from your Focus List and the old tasks/blockers.</div>
  const when = new Date(run.finished_at ?? run.started_at)
  return (
    <div className={health.length ? 'banner sweep-banner warn' : 'banner sweep-banner'}>
      {health.length > 0 && <><AlertTriangle size={13} /> <strong>Source problem:</strong> {health.map(([k, v]) => `${k} (${v})`).join(', ')} · </>}
      Last sweep {when.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}: {run.items_created} new, {run.items_updated} updated, {run.items_closed} closed.
    </div>
  )
}

type RowProps = {
  people: Person[]
  customers: Customer[]
  personName: (id: string | null) => string
  customer: (id: string | null) => Customer | undefined
  linksFor: (id: string) => ItemLink[]
  editingId: string | null
  setEditingId: (id: string | null) => void
  patch: (it: Item, change: Partial<Item>) => void
  markDone: (it: Item) => void
  reopen: (it: Item) => void
  accept: (it: Item) => void
  bin: (it: Item) => void
}

function ItemList({ items, empty, numbered, inbox, showOwner, hideWaiting, ...p }: RowProps & {
  items: Item[]; empty: string; numbered?: boolean; inbox?: boolean; showOwner?: boolean; hideWaiting?: boolean
}) {
  if (items.length === 0) return empty ? <p className="muted">{empty}</p> : null
  return (
    <div className="item-list">
      {items.map((it, idx) => (
        <ItemRow key={it.id} it={it} n={numbered ? idx + 1 : undefined} inbox={inbox} showOwner={showOwner} hideWaiting={hideWaiting} {...p} />
      ))}
    </div>
  )
}

function ItemRow({ it, n, inbox, showOwner, hideWaiting, ...p }: RowProps & { it: Item; n?: number; inbox?: boolean; showOwner?: boolean; hideWaiting?: boolean }) {
  const editing = p.editingId === it.id
  const cust = p.customer(it.customer_id)
  const quiet = daysAgo(it.last_seen_at)
  const isDone = it.status === 'done' || it.status === 'dropped'
  const otherLinks = p.linksFor(it.id).filter((l) => l.kind !== 'jira' && l.url)
  return (
    <div className={`item-row pri-${it.priority.toLowerCase()} ${isDone ? 'is-done' : ''}`}>
      <div className="item-main">
        {n != null && <span className="item-n">{n}</span>}
        <span className={`pri-pill pri-${it.priority.toLowerCase()}`}>{it.priority}</span>
        <div className="item-body">
          <div className="item-title">{it.title}</div>
          <div className="item-meta">
            {cust && <span className="chip">{cust.name}</span>}
            {showOwner && <span>Owner: {p.personName(it.owner_id)}</span>}
            {!hideWaiting && it.waiting_on_id && <span className="waiting">Waiting on {p.personName(it.waiting_on_id)}</span>}
            {it.due && <DueBadge due={it.due} done={isDone} />}
            {!it.due && !isDone && <span className="no-due">no due date</span>}
            {it.jira_key && (
              <a className="jira-link" href={`https://contactspace.atlassian.net/browse/${it.jira_key}`} target="_blank" rel="noreferrer">
                {it.jira_key} <ExternalLink size={11} />
              </a>
            )}
            {!it.jira_key && it.is_engineering && <span className="needs-jira">needs a Jira</span>}
            {otherLinks.map((l) => (
              <a key={l.id} className="src-link" href={l.url as string} target="_blank" rel="noreferrer" title={l.excerpt ?? l.kind}>{l.kind.replace('_', ' ')}</a>
            ))}
            {!isDone && quiet >= 7 && <span className="quiet">quiet {quiet}d</span>}
            {it.confidence === 'low' && <span className="low-conf">low confidence</span>}
            {isDone && it.closed_at && <span className="muted">closed {new Date(it.closed_at).toLocaleDateString()}</span>}
          </div>
          {it.notes && !editing && <div className="item-notes">{it.notes}</div>}
        </div>
        <div className="item-actions">
          {inbox && <button className="act accept" onClick={() => p.accept(it)} title="Accept"><Check size={14} /> Accept</button>}
          {inbox && <button className="act bin" onClick={() => p.bin(it)} title="Bin"><Trash2 size={14} /></button>}
          {!inbox && !isDone && <button className="act done" onClick={() => p.markDone(it)} title="Mark done"><Check size={14} /></button>}
          {isDone && <button className="act" onClick={() => p.reopen(it)} title="Reopen"><Undo2 size={14} /></button>}
          <button className="act" onClick={() => p.setEditingId(editing ? null : it.id)} title="Edit"><Pencil size={13} /></button>
        </div>
      </div>
      {editing && <EditItem it={it} people={p.people} customers={p.customers} onSave={(c) => { p.patch(it, c); p.setEditingId(null) }} onCancel={() => p.setEditingId(null)} />}
    </div>
  )
}

function EditItem({ it, people, customers, onSave, onCancel }: { it: Item; people: Person[]; customers: Customer[]; onSave: (c: Partial<Item>) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    title: it.title, customer_id: it.customer_id ?? '', owner_id: it.owner_id ?? '', waiting_on_id: it.waiting_on_id ?? '',
    priority: it.priority, due: it.due ?? '', jira_key: it.jira_key ?? '', notes: it.notes ?? '', is_engineering: it.is_engineering,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  function save(e: React.FormEvent) {
    e.preventDefault()
    const jira = f.jira_key.trim().toUpperCase() || null
    onSave({
      title: f.title.trim() || it.title,
      customer_id: f.customer_id || null,
      owner_id: f.owner_id || null,
      waiting_on_id: f.waiting_on_id || null,
      priority: f.priority as Priority,
      due: f.due || null,
      jira_key: jira,
      is_engineering: f.is_engineering || !!jira,
      notes: f.notes.trim() || null,
      status: it.status === 'done' || it.status === 'dropped' ? it.status : f.waiting_on_id ? 'waiting' : 'open',
    })
  }
  return (
    <form className="item-edit" onSubmit={save}>
      <label className="wide">Title<input value={f.title} onChange={set('title')} /></label>
      <label>Project<select value={f.customer_id} onChange={set('customer_id')}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Owner<select value={f.owner_id} onChange={set('owner_id')}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Waiting on<select value={f.waiting_on_id} onChange={set('waiting_on_id')}><option value="">Nobody</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Priority<select value={f.priority} onChange={set('priority')}><option>P1</option><option>P2</option><option>P3</option></select></label>
      <label>Due<input type="date" value={f.due} onChange={set('due')} /></label>
      <label>Jira<input value={f.jira_key} onChange={set('jira_key')} placeholder="PROJ-1234" /></label>
      <label className="check"><input type="checkbox" checked={f.is_engineering} onChange={(e) => setF({ ...f, is_engineering: e.target.checked })} /> Engineering work</label>
      <label className="wide">Notes<textarea value={f.notes} onChange={set('notes')} /></label>
      <div className="item-edit-actions">
        <button type="submit" className="approve-btn">Save</button>
        <button type="button" className="dismiss-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function AddItemRow({ customers, people, onAdd }: { customers: Customer[]; people: Person[]; onAdd: (f: { title: string; customer_id: string; priority: Priority; due: string; waiting_on_id: string; jira_key: string }) => void }) {
  const blank = { title: '', customer_id: '', priority: 'P2' as Priority, due: '', waiting_on_id: '', jira_key: '' }
  const [f, setF] = useState(blank)
  function submit(e: React.FormEvent) { e.preventDefault(); onAdd(f); setF(blank) }
  return (
    <form className="add-row" onSubmit={submit}>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="New item: what needs to happen" required />
      <select value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
        <option value="">Project…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}><option>P1</option><option>P2</option><option>P3</option></select>
      <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} title="Due" />
      <select value={f.waiting_on_id} onChange={(e) => setF({ ...f, waiting_on_id: e.target.value })}>
        <option value="">Waiting on…</option>{people.filter((p) => !p.is_me).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input className="narrow" value={f.jira_key} onChange={(e) => setF({ ...f, jira_key: e.target.value })} placeholder="Jira key" />
      <button type="submit">Add</button>
    </form>
  )
}

function DueBadge({ due, done }: { due: string; done: boolean }) {
  const d = Math.round((new Date(due + 'T00:00:00').getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000)
  const cls = done ? 'due' : d < 0 ? 'due overdue' : d === 0 ? 'due today' : d <= 2 ? 'due soon' : 'due'
  const label = done ? `due ${fmtDate(due)}` : d < 0 ? `overdue ${-d}d (${fmtDate(due)})` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due ${fmtDate(due)}`
  return <span className={cls}>{label}</span>
}

function fmtDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
function daysAgo(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

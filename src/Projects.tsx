import { useState } from 'react'
import { ArrowLeft, ExternalLink, Hash, Plus } from 'lucide-react'
import type { Customer, Item, Milestone, Note, Person, Spotlight } from './types'

export interface StageGate {
  stage_key: string
  stage_label: string
  stage_order: number
  gate: 'A' | 'B' | 'C' | 'D'
  gate_label: string
}

export type Health = 'red' | 'amber' | 'green'

type Ctx = {
  customers: Customer[]
  items: Item[]
  people: Person[]
  spotlight: Spotlight[]
  notes: Note[]
  gates: StageGate[]
  meId: string | undefined
}

const OPEN = ['open', 'waiting']
const todayIso = () => new Date().toISOString().slice(0, 10)
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

export function openItemsFor(ctx: Ctx, customerId: string) {
  return ctx.items.filter((i) => i.customer_id === customerId && OPEN.includes(i.status) && i.triage === 'accepted')
}

export function ballOf(ctx: Ctx, it: Item): 'us' | 'customer' | 'others' {
  if (!it.waiting_on_id || it.waiting_on_id === ctx.meId) return 'us'
  const p = ctx.people.find((x) => x.id === it.waiting_on_id)
  if (p?.kind === 'customer') return 'customer'
  return 'others'
}

export function latestStatus(ctx: Ctx, customerId: string) {
  return ctx.spotlight.filter((s) => s.customer_id === customerId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

export function projectHealth(ctx: Ctx, c: Customer): { health: Health; reasons: string[] } {
  const open = openItemsFor(ctx, c.id)
  const today = todayIso()
  const overdue = open.filter((i) => i.due && i.due < today)
  const p1Overdue = overdue.filter((i) => i.priority === 'P1')
  const quiet = open.filter((i) => daysSince(i.last_seen_at) >= 7)
  const longCustomer = open.filter((i) => ballOf(ctx, i) === 'customer' && daysSince(i.created_at) >= 14)
  const st = latestStatus(ctx, c.id)
  const reasons: string[] = []
  if (p1Overdue.length) reasons.push(`${p1Overdue.length} P1 overdue`)
  else if (overdue.length) reasons.push(`${overdue.length} overdue`)
  if (longCustomer.length) reasons.push(`${longCustomer.length} with customer 14d+`)
  if (quiet.length) reasons.push(`${quiet.length} quiet 7d+`)
  if (open.length && (!st || daysSince(st.created_at) > 10)) reasons.push(st ? `status ${daysSince(st.created_at)}d old` : 'no status yet')
  const health: Health = p1Overdue.length || longCustomer.length ? 'red' : reasons.length ? 'amber' : 'green'
  return { health, reasons }
}

function stageDone(date: string | null | undefined) {
  return !!date && date <= todayIso()
}

export function gateProgress(ctx: Ctx, c: Customer) {
  const hidden = c.hidden_stages ?? []
  const byGate = ['A', 'B', 'C', 'D'].map((g) => {
    const stages = ctx.gates.filter((s) => s.gate === g && !hidden.includes(s.stage_key)).sort((a, b) => a.stage_order - b.stage_order)
    const dates = stages.map((s) => (c as unknown as Record<string, string | null>)[s.stage_key])
    const reached = stages.length > 0 && dates.every(stageDone)
    const reachedOn = reached ? dates.filter(Boolean).sort().slice(-1)[0] ?? null : null
    const label = ctx.gates.find((s) => s.gate === g)?.gate_label ?? ''
    return { gate: g, label, stages, reached, reachedOn, skipped: stages.length === 0 }
  })
  const current = byGate.find((g) => !g.reached && !g.skipped)
  return { byGate, current }
}

// ---------- grid ----------

export function ProjectsGrid({ ctx, onOpen, filter }: { ctx: Ctx; onOpen: (id: string) => void; filter: (c: Customer) => boolean }) {
  const rows = ctx.customers
    .filter((c) => c.active !== false && filter(c))
    .map((c) => ({ c, open: openItemsFor(ctx, c.id), h: projectHealth(ctx, c), g: gateProgress(ctx, c), st: latestStatus(ctx, c.id) }))
    .filter((r) => r.open.length > 0 || r.st || r.c.jira_epic_key)
    .sort((a, b) => (a.c.project_rank ?? 99) - (b.c.project_rank ?? 99) || a.c.name.localeCompare(b.c.name))
  if (rows.length === 0) return <p className="muted">No projects yet.</p>
  return (
    <div className="proj-grid">
      {rows.map(({ c, open, h, g, st }) => {
        const ball = { us: 0, customer: 0, others: 0 }
        open.forEach((i) => { ball[ballOf(ctx, i)]++ })
        const nextDue = open.map((i) => i.due).filter(Boolean).sort()[0]
        return (
          <button key={c.id} className={`proj-card h-${h.health}`} onClick={() => onOpen(c.id)}>
            <div className="proj-card-top">
              <span className="proj-name">{c.name}</span>
              {c.type && <span className={`badge ${c.type}`}>{c.type}</span>}
              <span className={`health-dot h-${h.health}`} title={h.reasons.join(' · ') || 'On track'} />
            </div>
            <GateStrip gates={g.byGate} compact />
            <div className="proj-ball">
              <span>{open.length} open</span>
              {ball.us > 0 && <span className="b-us">{ball.us} with us</span>}
              {ball.customer > 0 && <span className="b-cust">{ball.customer} with customer</span>}
              {ball.others > 0 && <span className="b-oth">{ball.others} with others</span>}
            </div>
            {st && <div className="proj-status">{st.text}</div>}
            <div className="proj-foot">
              {h.reasons.length ? <span className={`h-text h-${h.health}`}>{h.reasons.join(' · ')}</span> : <span className="h-text h-green">On track</span>}
              {nextDue && <span className="muted">next due {fmt(nextDue)}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function GateStrip({ gates, compact }: { gates: ReturnType<typeof gateProgress>['byGate']; compact?: boolean }) {
  const firstOpen = gates.find((g) => !g.reached && !g.skipped)?.gate
  return (
    <div className={compact ? 'gate-strip compact' : 'gate-strip'}>
      {gates.map((g) => (
        <div key={g.gate} className={`gate-pill ${g.skipped ? 'skipped' : g.reached ? 'reached' : g.gate === firstOpen ? 'current' : 'todo'}`} title={`Gate ${g.gate}: ${g.label}${g.reachedOn ? ` (reached ${g.reachedOn})` : ''}`}>
          <b>{g.gate}</b>{!compact && <span> {g.label}</span>}
        </div>
      ))}
    </div>
  )
}

// ---------- project page ----------

export function ProjectPage({
  ctx, customerId, onBack, renderItems, onPatchCustomer, onAddStatus, onAddNote, onAddItem,
}: {
  ctx: Ctx
  customerId: string
  onBack: () => void
  renderItems: (items: Item[], opts?: { hideWaiting?: boolean; showOwner?: boolean }) => React.ReactNode
  onPatchCustomer: (id: string, patch: Partial<Customer>) => void
  onAddStatus: (customerId: string, owner: string, text: string) => void
  onAddNote: (customerId: string, text: string) => void
  onAddItem: (customerId: string, title: string) => void
}) {
  const c = ctx.customers.find((x) => x.id === customerId)
  const [showHistory, setShowHistory] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [statusOwner, setStatusOwner] = useState('Both')
  const [noteText, setNoteText] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [msLabel, setMsLabel] = useState('')
  if (!c) return <p className="muted">Project not found.</p>

  const open = openItemsFor(ctx, c.id).sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const groups = { us: [] as Item[], customer: [] as Item[], others: [] as Item[] }
  open.forEach((i) => groups[ballOf(ctx, i)].push(i))
  const closed = ctx.items.filter((i) => i.customer_id === c.id && i.status === 'done' && i.closed_at && daysSince(i.closed_at) <= 14)
  const needsJira = open.filter((i) => i.is_engineering && !i.jira_key)
  const h = projectHealth(ctx, c)
  const g = gateProgress(ctx, c)
  const history = ctx.spotlight.filter((s) => s.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const st = history[0]
  const notes = ctx.notes.filter((n) => n.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const hidden = c.hidden_stages ?? []
  const rec = c as unknown as Record<string, string | null>

  function setStage(key: string, value: string) { onPatchCustomer(c!.id, { [key]: value || null } as Partial<Customer>) }
  function toggleHidden(key: string, hide: boolean) {
    onPatchCustomer(c!.id, { hidden_stages: hide ? [...hidden, key] : hidden.filter((k) => k !== key) } as Partial<Customer>)
  }
  function patchMilestone(key: string, patch: Partial<Milestone>) {
    onPatchCustomer(c!.id, { milestones: c!.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)) })
  }
  function addMilestone() {
    if (!msLabel.trim()) return
    onPatchCustomer(c!.id, { milestones: [...(c!.milestones ?? []), { key: `m_${Date.now()}`, label: msLabel.trim(), completed: false }] })
    setMsLabel('')
  }

  return (
    <div className="proj-page">
      <button className="digest-btn" onClick={onBack}><ArrowLeft size={13} /> All projects</button>

      <div className="proj-head">
        <div>
          <h2>{c.name} <span className={`health-dot h-${h.health}`} /></h2>
          <div className="proj-links">
            <select value={c.type ?? ''} onChange={(e) => onPatchCustomer(c.id, { type: e.target.value || null })}>
              <option value="">Type…</option><option value="poc">POC</option><option value="termed">Termed</option><option value="established">Established</option>
            </select>
            {c.jira_epic_key && <a href={`https://contactspace.atlassian.net/browse/${c.jira_epic_key}`} target="_blank" rel="noreferrer">{c.jira_epic_key} <ExternalLink size={11} /></a>}
            {c.slack_channel_name && <span className="muted"><Hash size={11} />{c.slack_channel_name}</span>}
            {h.reasons.length > 0 && <span className={`h-text h-${h.health}`}>{h.reasons.join(' · ')}</span>}
          </div>
        </div>
      </div>

      <section className="proj-section">
        <div className="section-title">Status</div>
        {st ? (
          <div className="status-now">
            <span className={`with-badge with-${(st.owner ?? 'unknown').toLowerCase()}`}>{st.owner ?? '—'}</span>
            <span className="status-now-text">{st.text}</span>
            <span className="muted">{daysSince(st.created_at)}d ago</span>
          </div>
        ) : <p className="muted">No status yet. The Friday sweep will draft one, or write it here.</p>}
        <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (statusText.trim()) { onAddStatus(c.id, statusOwner, statusText.trim()); setStatusText('') } }}>
          <select value={statusOwner} onChange={(e) => setStatusOwner(e.target.value)}>
            <option value="Us">With us</option><option value="Customer">With customer</option><option value="Both">Both</option>
          </select>
          <input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="Update the status…" />
          <button type="submit">Update</button>
        </form>
        {history.length > 1 && (
          <button className="link-btn" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'Show'} status history ({history.length - 1})</button>
        )}
        {showHistory && (
          <div className="status-hist">
            {history.slice(1, 20).map((s) => (
              <div key={s.id} className="status-hist-row"><span className="muted">{new Date(s.created_at).toLocaleDateString()}</span><span>{s.text}</span></div>
            ))}
          </div>
        )}
      </section>

      <section className="proj-section">
        <div className="section-title">Gates and stages</div>
        <GateStrip gates={g.byGate} />
        <div className="gate-bands">
          {g.byGate.filter((band) => !band.skipped).map((band) => (
            <div key={band.gate} className={`gate-band ${band.reached ? 'reached' : band.gate === g.current?.gate ? 'current' : ''}`}>
              <div className="gate-band-head">Gate {band.gate} · {band.label}{band.reachedOn && <span className="muted"> · reached {fmt(band.reachedOn)}</span>}</div>
              {band.stages.map((s) => {
                const val = rec[s.stage_key] ?? ''
                const state = !val ? 'empty' : stageDone(val) ? 'done' : 'scheduled'
                return (
                  <div key={s.stage_key} className={`stage-line ${state}`}>
                    <span className="stage-line-label">{s.stage_label}</span>
                    <input type="date" value={val} onChange={(e) => setStage(s.stage_key, e.target.value)} />
                    <button className="link-btn" title="Doesn't apply to this project" onClick={() => toggleHidden(s.stage_key, true)}>hide</button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {hidden.length > 0 && (
          <div className="hidden-stages">
            <span className="muted">Hidden:</span>
            {hidden.map((k) => <button key={k} className="chip-btn" onClick={() => toggleHidden(k, false)}>+ {ctx.gates.find((s) => s.stage_key === k)?.stage_label ?? k}</button>)}
          </div>
        )}
        <div className="milestones">
          <h4>Milestones</h4>
          {(c.milestones ?? []).map((m) => (
            <div key={m.key} className="milestone-row">
              <input type="checkbox" checked={m.completed} onChange={() => patchMilestone(m.key, { completed: !m.completed })} />
              <span className={m.completed ? 'done' : ''}>{m.label}</span>
              <input type="date" className="milestone-date-input" value={m.date ?? ''} onChange={(e) => patchMilestone(m.key, { date: e.target.value || undefined })} />
            </div>
          ))}
          <form className="ms-add" onSubmit={(e) => { e.preventDefault(); addMilestone() }}>
            <input value={msLabel} onChange={(e) => setMsLabel(e.target.value)} placeholder="Add a milestone…" />
            <button type="submit" className="act"><Plus size={13} /></button>
          </form>
        </div>
      </section>

      <section className="proj-section">
        <div className="section-title">Open items ({open.length})</div>
        <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (itemTitle.trim()) { onAddItem(c.id, itemTitle.trim()); setItemTitle('') } }}>
          <input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder={`New item for ${c.name}…`} />
          <button type="submit">Add</button>
        </form>
        {([['us', 'With us'], ['customer', 'With the customer'], ['others', 'With other teams / vendors']] as const).map(([k, label]) => (
          groups[k].length > 0 && (
            <div key={k} className="ball-group">
              <div className="ball-group-head">{label} <span className="muted">({groups[k].length})</span></div>
              {renderItems(groups[k], { showOwner: true })}
            </div>
          )
        ))}
        {open.length === 0 && <p className="muted">Nothing open.</p>}
        {needsJira.length > 0 && <p className="needs-jira-note">{needsJira.length} engineering item{needsJira.length > 1 ? 's' : ''} without a Jira.</p>}
      </section>

      {closed.length > 0 && (
        <section className="proj-section">
          <div className="section-title">Closed in the last 14 days ({closed.length})</div>
          {renderItems(closed, { showOwner: true })}
        </section>
      )}

      <section className="proj-section">
        <div className="section-title">Notes</div>
        <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (noteText.trim()) { onAddNote(c.id, noteText.trim()); setNoteText('') } }}>
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Contacts, context, things to remember…" />
          <button type="submit">Add</button>
        </form>
        {notes.map((n) => <div key={n.id} className="note-line"><span>{n.text}</span><span className="muted">{new Date(n.created_at).toLocaleDateString()}</span></div>)}
      </section>
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

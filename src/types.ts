export interface Milestone {
  key: string
  label: string
  date?: string
  completed: boolean
}

export interface Customer {
  id: string
  name: string
  owner: string | null
  type: string | null
  notes: string | null
  legacy_id: string | null
  jira_epic_key: string | null
  demo: string | null
  agreement: string | null
  handover: string | null
  roadmap_disc: string | null
  roadmap_doc: string | null
  go_live: string | null
  api_workshop: string | null
  training: string | null
  mo_conclusion: string | null
  milestones: Milestone[]
  // Keys from the fixed STAGES list (e.g. "mo_conclusion") that this customer has
  // opted to hide — the stage's stored date/value is untouched, it's just not shown.
  hidden_stages: string[]
  created_at: string
}

export interface Task {
  id: string
  customer_id: string
  title: string
  owner: string | null
  status: 'To Do' | 'Open' | 'In Progress' | 'Done'
  created_at: string
  updated_at: string
}

export interface Blocker {
  id: string
  customer_id: string
  title: string
  type: string | null
  detail: string | null
  resolved_at: string | null
  created_at: string
}

export interface UpdateRow {
  id: string
  customer_id: string
  text: string
  author: string
  is_system: boolean
  created_at: string
}

export interface Spotlight {
  id: string
  customer_id: string
  text: string
  owner: string | null
  created_at: string
}

export interface Note {
  id: string
  customer_id: string
  text: string
  author: string
  created_at: string
}

export interface StatusDraft {
  id: string
  customer_id: string
  proposed_text: string
  proposed_owner: 'Us' | 'Customer' | 'Both'
  source_summary: string | null
  status: 'pending' | 'approved' | 'dismissed'
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  // Snapshot of the live spotlight entry at the moment this draft was generated,
  // so the Review tab can show an explicit "yesterday vs today" diff.
  previous_text: string | null
  previous_owner: string | null
}

// Zero or more of these can be attached to a single StatusDraft (via draft_id) —
// e.g. a new-blocker suggestion AND a close-task suggestion can both show up on
// the same day's card. Never auto-applied by the scheduled task — Nick has to
// click a button in the app for one to actually write anywhere.
export interface StatusDraftSuggestion {
  id: string
  draft_id: string
  customer_id: string
  // 'create' = propose a brand new task/milestone/blocker (action is the
  // title/label). 'close' = propose closing/completing an EXISTING task
  // (target_id), milestone (target_key) or blocker (target_blocker_id), action
  // is then just a human-readable label of what's being closed.
  kind: 'create' | 'close'
  type: 'task' | 'milestone' | 'blocker'
  action: string
  // For kind = 'close' + type = 'task': the tasks.id to mark Done.
  target_id: string | null
  // For kind = 'close' + type = 'milestone': the milestone's key within
  // customers.milestones to mark completed.
  target_key: string | null
  // For kind = 'close' + type = 'blocker': the blockers.id to resolve
  // (sets blockers.resolved_at).
  target_blocker_id: string | null
  // For kind = 'create' + type = 'blocker': the blockers.type to use when
  // inserting (e.g. "Waiting on Customer", "Internal").
  blocker_type: string | null
  // 'pending' = not yet actioned. 'applied' = written to tasks/blockers/
  // customers.milestones. 'dismissed' = declined. Only ever set to
  // applied/dismissed by the app, never by the scheduled task.
  status: 'pending' | 'applied' | 'dismissed'
  created_at: string
}

export type Role = 'admin' | 'editor' | 'viewer'

export interface AllowedUser {
  email: string
  role: Role
  added_at: string
}

// Every domain user who has actually signed in, whether or not they have
// an allowed_users row. Comes from the list_all_dashboard_users RPC.
export interface DashboardUser {
  email: string
  last_sign_in_at: string | null
  account_created_at: string
  role: Role | null
  blocked: boolean
}

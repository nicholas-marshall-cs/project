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
}

export type Role = 'admin' | 'editor' | 'viewer'

export interface AllowedUser {
  email: string
  role: Role
  added_at: string
}

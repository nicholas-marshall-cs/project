export interface Customer {
  id: string
  name: string
  created_at: string
}

export interface Task {
  id: string
  customer_id: string
  title: string
  status: 'Open' | 'In Progress' | 'Done'
  created_at: string
  updated_at: string
}

export interface Blocker {
  id: string
  customer_id: string
  title: string
  resolved_at: string | null
  created_at: string
}

export interface UpdateRow {
  id: string
  customer_id: string
  text: string
  author: string
  created_at: string
}

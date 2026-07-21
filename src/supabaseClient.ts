import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://cmwabhhvrdqugiokfgbs.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SanORzgTEJP_X-Kttogm4Q_vjGsvwiv'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

export const COMPANY_DOMAIN = 'contactspace.com'

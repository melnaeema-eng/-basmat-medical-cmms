import { createClient } from '@supabase/supabase-js'
import {createMedicalCompanyFetch} from './medicalCompanyTransport.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey,{
 global:{fetch:createMedicalCompanyFetch((...args)=>fetch(...args),supabaseUrl)}
})

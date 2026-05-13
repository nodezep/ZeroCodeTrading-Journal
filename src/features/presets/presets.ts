import { supabase } from '../../lib/supabaseClient'

export type PresetRow = {
  id: string
  user_id: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type RrPresetRow = PresetRow & {
  r_factor: number | null
}

export async function fetchPairPresets() {
  const { data, error } = await supabase
    .from('pair_presets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as PresetRow[]
}

export async function fetchSessionPresets() {
  const { data, error } = await supabase
    .from('session_presets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as PresetRow[]
}

export async function fetchRrPresets() {
  const { data, error } = await supabase
    .from('rr_presets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as RrPresetRow[]
}


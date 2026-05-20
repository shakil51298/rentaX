import { supabase } from './supabase'

function mapBanner(item) {
  return {
    ...item,
    id: String(item.id),
    target_property_id: item?.target_property_id ? String(item.target_property_id) : null,
  }
}

export async function fetchVisibleHomeBanners() {
  const { data, error } = await supabase
    .from('home_banners')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(mapBanner)
}

export async function fetchAdminHomeBanners() {
  const { data, error } = await supabase
    .from('home_banners')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(mapBanner)
}

export async function createHomeBanner(payload) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('home_banners')
    .insert({
      ...payload,
      updated_at: now,
      created_at: now,
    })
    .select('*')
    .single()

  if (error) throw error

  return mapBanner(data)
}

export async function updateHomeBanner(bannerId, updates) {
  const { data, error } = await supabase
    .from('home_banners')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bannerId)
    .select('*')
    .single()

  if (error) throw error

  return mapBanner(data)
}

export async function deleteHomeBanner(bannerId) {
  const { error } = await supabase
    .from('home_banners')
    .delete()
    .eq('id', bannerId)

  if (error) throw error
}

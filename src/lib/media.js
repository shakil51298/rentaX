import { supabase } from './supabase'

export const CHAT_MEDIA_BUCKET = 'chat-media'
export const PROPERTY_MEDIA_BUCKET = 'property-media'

export function normalizeMediaItem(item) {
  if (typeof item === 'string') {
    return {
      uri: item,
      type: /\.(mp4|mov|m4v|webm)$/i.test(item || '') ? 'video' : 'image',
    }
  }

  const uri = item?.uri || item?.url || item?.path

  if (!uri) return null

  return {
    ...item,
    uri,
    type: item?.type || item?.media_type || (/\.(mp4|mov|m4v|webm)$/i.test(uri || '') ? 'video' : 'image'),
  }
}

export function normalizeMediaList(items) {
  return (items || []).map(normalizeMediaItem).filter(Boolean)
}

function getFileExtension(uri, mimeType, type) {
  const uriExtension = uri?.split('?')?.[0]?.split('.')?.pop()?.toLowerCase()

  if (uriExtension && uriExtension.length <= 5) return uriExtension
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('webp')) return 'webp'
  if (mimeType?.includes('jpeg')) return 'jpg'
  if (mimeType?.includes('jpg')) return 'jpg'
  if (mimeType?.includes('quicktime')) return 'mov'
  if (mimeType?.includes('video')) return 'mp4'
  if (mimeType?.includes('mpeg')) return 'mp3'
  if (mimeType?.includes('webm')) return 'webm'
  if (type === 'voice') return 'm4a'

  return 'jpg'
}

function fallbackMimeType(type, extension) {
  if (type === 'video') return extension === 'mov' ? 'video/quicktime' : 'video/mp4'
  if (type === 'voice') return 'audio/mp4'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'

  return 'image/jpeg'
}

export async function uploadMediaAsset({
  uri,
  type,
  mimeType,
  userId,
  bucket,
}) {
  const extension = getFileExtension(uri, mimeType, type)
  const contentType = mimeType || fallbackMimeType(type, extension)
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  const path = `${userId}/${safeName}`
  const response = await fetch(uri)
  const arrayBuffer = await response.arrayBuffer()

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path)

  return {
    mediaUrl: publicUrlData.publicUrl,
    mediaMimeType: contentType,
  }
}

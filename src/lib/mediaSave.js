import { Directory, File, Paths } from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library'

function guessExtension(uri, type) {
  const cleanUri = String(uri || '').split('?')[0]
  const extension = cleanUri.split('.').pop()?.toLowerCase()

  if (extension && extension.length <= 5) return extension
  return type === 'video' ? 'mp4' : 'jpg'
}

function guessMimeType(type, extension) {
  if (type === 'video') {
    return extension === 'mov' ? 'video/quicktime' : 'video/mp4'
  }

  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function ensureMediaLibraryPermission() {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])

  if (!permission.granted) {
    throw new Error('Please allow photo and video access to save media to your phone.')
  }
}

async function getLocalUriForSave(uri, type) {
  if (String(uri || '').startsWith('file://')) {
    return uri
  }

  const extension = guessExtension(uri, type)
  const mimeType = guessMimeType(type, extension)
  const downloadDirectory = new Directory(Paths.cache, 'saved-media')

  if (!downloadDirectory.exists) {
    downloadDirectory.create({ idempotent: true, intermediates: true })
  }

  const targetFile = new File(
    downloadDirectory,
    `rental-x-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  )

  const downloadedFile = await File.downloadFileAsync(uri, targetFile, {
    idempotent: true,
  })

  if (!downloadedFile?.uri) {
    throw new Error(`Could not download ${mimeType} right now.`)
  }

  return downloadedFile.uri
}

export async function saveMediaToLibrary({ uri, type = 'image' }) {
  if (!uri) {
    throw new Error('No media file was found to save.')
  }

  await ensureMediaLibraryPermission()
  const localUri = await getLocalUriForSave(uri, type)
  await MediaLibrary.saveToLibraryAsync(localUri)
  return localUri
}

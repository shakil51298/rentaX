const LINK_URL_PATTERN = /https?:\/\/[^\s<>"']+/i
const TRAILING_PUNCTUATION_PATTERN = /[)\].,!?;:]+$/
const previewCache = new Map()

function cleanUrl(value) {
  return String(value || '').replace(TRAILING_PUNCTUATION_PATTERN, '')
}

export function extractFirstLink(text = '') {
  const match = String(text || '').match(LINK_URL_PATTERN)
  return match ? cleanUrl(match[0]) : null
}

export function getLinkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return cleanUrl(url).replace(/^https?:\/\//, '').split('/')[0] || 'Link'
  }
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function readMetaTag(html, propertyNames = []) {
  for (const name of propertyNames) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      'i'
    )
    const match = html.match(pattern)
    const value = match?.[1] || match?.[2]

    if (value) return decodeHtml(value)
  }

  return ''
}

function readTitle(html) {
  const metaTitle = readMetaTag(html, ['og:title', 'twitter:title'])

  if (metaTitle) return metaTitle

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return titleMatch?.[1] ? decodeHtml(titleMatch[1]) : ''
}

function normalizePreviewImage(imageUrl, sourceUrl) {
  if (!imageUrl) return null

  try {
    return new URL(imageUrl, sourceUrl).toString()
  } catch {
    return null
  }
}

export async function fetchLinkPreview(url) {
  const safeUrl = cleanUrl(url)

  if (!safeUrl) return null

  if (previewCache.has(safeUrl)) {
    return previewCache.get(safeUrl)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6500)

  try {
    const response = await fetch(safeUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    })

    const contentType = response.headers?.get?.('content-type') || ''
    const host = getLinkHost(safeUrl)

    if (!response.ok || !contentType.toLowerCase().includes('text/html')) {
      const fallbackPreview = {
        url: safeUrl,
        title: host,
        description: safeUrl,
        image: null,
        siteName: host,
      }

      previewCache.set(safeUrl, fallbackPreview)
      return fallbackPreview
    }

    const html = await response.text()
    const title = readTitle(html) || host
    const description = readMetaTag(html, ['og:description', 'description', 'twitter:description'])
    const siteName = readMetaTag(html, ['og:site_name']) || host
    const image = normalizePreviewImage(
      readMetaTag(html, ['og:image', 'twitter:image', 'twitter:image:src']),
      safeUrl
    )

    const preview = {
      url: safeUrl,
      title,
      description,
      image,
      siteName,
    }

    previewCache.set(safeUrl, preview)
    return preview
  } catch {
    const fallbackPreview = {
      url: safeUrl,
      title: getLinkHost(safeUrl),
      description: safeUrl,
      image: null,
      siteName: getLinkHost(safeUrl),
    }

    previewCache.set(safeUrl, fallbackPreview)
    return fallbackPreview
  } finally {
    clearTimeout(timeout)
  }
}

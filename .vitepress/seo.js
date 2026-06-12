// SEO helpers extracted from config.mts so the pure URL / JSON-LD / sitemap
// logic is unit-testable with `node --test` (mirrors the repo convention of a
// `.js` module + a `.test.mjs` sibling, e.g. lifecircle.js / countdown.js).
// config.mts imports these; one source of truth keeps canonical URLs and the
// sitemap <loc> in sync (they used to drift on the trailing slash).

import { ALBUMS, ARTIST } from './theme/components/music.js'

export const SITE_URL = 'https://alterfo.github.io'
export const AUTHOR = 'Oleg Sidorkin'

// Source relativePath (e.g. 'blog/index.md') → canonical path ('/blog/').
// `index` collapses to the directory: 'index.md' → '/', 'blog/index.md' → '/blog/'.
export function canonicalPath(rel) {
  let p = rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')
  if (!p.startsWith('/')) p = '/' + p
  return p === '/' ? '/' : p
}

export function canonicalFor(rel) {
  return SITE_URL + canonicalPath(rel)
}

// Reusable Person node for JSON-LD (nested as author refs; @context added at top level).
export const PERSON = {
  '@type': 'Person',
  name: AUTHOR,
  alternateName: 'alterfo',
  url: SITE_URL,
  jobTitle: 'Software Engineer',
  knowsAbout: ['Music', 'Audio DSP', 'AI', 'RAG', 'Frontend Development', 'Solution Architecture'],
  sameAs: ['https://github.com/alterfo'],
}

// Client-side tool pages → schema.org applicationCategory. Also the source of
// truth for the sitemap "tool" priority tier (see sitemapPriority).
export const TOOL_CATEGORY = {
  'idef0.md': 'BusinessApplication',
  'planner.md': 'BusinessApplication',
  'journal.md': 'LifestyleApplication',
  'piano.md': 'MultimediaApplication',
  'openpose.md': 'DesignApplication',
  'decision-journal.md': 'BusinessApplication',
}

// Build the per-page JSON-LD object (or null if the page type has none).
export function jsonLdFor(rel, title, desc, url) {
  if (rel === 'index.md') {
    return { '@context': 'https://schema.org', ...PERSON }
  }
  if (rel === 'music.md') {
    return {
      '@context': 'https://schema.org',
      '@type': 'MusicGroup',
      name: ARTIST.name,
      url,
      sameAs: [ARTIST.url],
      album: ALBUMS.map(a => ({ '@type': 'MusicAlbum', name: a.title, datePublished: String(a.year) })),
    }
  }
  if (rel in TOOL_CATEGORY) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: title,
      description: desc,
      url,
      applicationCategory: TOOL_CATEGORY[rel],
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: PERSON,
    }
  }
  if (rel.startsWith('posts/')) {
    const m = rel.slice('posts/'.length).match(/^(\d{4}-\d{2}-\d{2})/)
    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      description: desc,
      url,
      inLanguage: 'ru-RU',
      author: PERSON,
      ...(m ? { datePublished: m[1] } : {}),
    }
  }
  return null
}

// Serialize a JSON-LD object for embedding in <script type="application/ld+json">.
// VitePress inserts a script tag's innerHTML verbatim (no HTML-escaping, and no
// esbuild pass for non-JS script types), and JSON.stringify does NOT escape <, >,
// & or the "</script>" sequence — so an author-controlled title containing those
// could break out of the element. Escape them to \uXXXX (still valid JSON).
export function jsonLdScript(ld) {
  return JSON.stringify(ld)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

// Sitemap <priority> tier for a source page. Keyed off TOOL_CATEGORY so all five
// tool apps share one tier (the old /^(idef0|planner|journal)/ regex omitted
// piano/openpose and would also have matched an unrelated 'journalists.md').
export function sitemapPriority(rel) {
  if (rel === 'index.md') return '1.0'
  if (rel in TOOL_CATEGORY) return '0.8'
  if (rel === 'music.md') return '0.8'
  if (rel.startsWith('projects/')) return '0.7'
  return '0.6'
}

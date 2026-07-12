// SEO helpers extracted from config.mts so the pure URL / JSON-LD / sitemap
// logic is unit-testable with `node --test` (mirrors the repo convention of a
// `.js` module + a `.test.mjs` sibling, e.g. lifecircle.js / countdown.js).
// config.mts imports these; one source of truth keeps canonical URLs and the
// sitemap <loc> in sync (they used to drift on the trailing slash).

import { ALBUMS, ARTIST } from './theme/components/music.js'

export const SITE_URL = 'https://alterfo.github.io'
export const AUTHOR = 'Oleg Sidorkin'

// Mirrors --ds-void in theme/styles/vars.css (page background; site is dark-only,
// see appearance: 'force-dark' in config.mts) — used for the mobile chrome theme-color.
export const THEME_COLOR = '#14161a'

// Site-wide <head> tags (favicon family + theme-color), static across all pages so
// they live here as plain data rather than in transformPageData (which is per-page).
// Icon source is public/home-wheel.svg — the actual «колесо жизни» brand mark (already
// the nav logo), not public/og-source.svg (that's the 1200×630 OG social card, wrong
// shape for an icon). apple-touch-icon.png / favicon.png are PNG rasters of the same
// SVG (iOS/old browsers don't do SVG favicons) generated via headless Chrome, same
// vendoring approach the OG image already uses — see .vitepress/CLAUDE.md.
export const SITE_HEAD = [
  ['link', { rel: 'icon', type: 'image/svg+xml', href: '/home-wheel.svg' }],
  ['link', { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon.png' }],
  ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
  ['meta', { name: 'theme-color', content: THEME_COLOR }],
]

// Static sub-apps served from dist/<subpath>/ that VitePress doesn't know about
// (not in siteConfig.pages) — appended to the sitemap in buildEnd at priority 0.8.
// `/vacuum-rogues/` is intentionally NOT listed: it isn't deployed yet (no placeholder),
// so advertising it would put a 404 in the sitemap. Add it back when the game ships.
export const EXTRA_URLS = ['/ar/']

// Source relativePath (e.g. 'blog.md') → canonical path ('/blog').
// `index` collapses to the directory: 'index.md' → '/', 'posts/index.md' → '/posts/'.
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

// Lazy app-root chunk basename -> the one page (relativePath) that actually
// renders it. These six are reached via dynamic import() (defineAsyncComponent
// in theme/index.mts, or Layout.vue's gpuAvailable()-gated WebGPUParticles
// import) from every page's shared client entry, so without this VitePress
// would tag all six as an eager <link rel="modulepreload"> on every single
// page (incl. the home page, which renders none of them) - defeating the
// lazy-load payload win documented in CLAUDE.md. WebGPUParticles has no
// dedicated page (header animation, runtime-gated) so it's never eager.
const LAZY_CHUNK_PAGE = {
  IDEF0Editor: 'idef0.md',
  Journal: 'journal.md',
  Piano: 'piano.md',
  OpenPoseEditor: 'openpose.md',
  PlannerEditor: 'planner.md',
  DecisionJournal: 'decision-journal.md',
}
const LAZY_CHUNK_RE = /\/(IDEF0Editor|Journal|Piano|OpenPoseEditor|PlannerEditor|DecisionJournal|WebGPUParticles)\.[^/]+\.js$/

// VitePress's shouldPreload(link, page) hook (config.mts): false demotes a link
// from an eager <link rel="modulepreload"> to a low-priority <link rel="prefetch">
// (fetched on idle instead of contending with the current page's own resources).
// Non-lazy-chunk links (vendor/runtime/page chunks) stay eager as before.
export function shouldPreloadLink(link, page) {
  const m = link.match(LAZY_CHUNK_RE)
  if (!m) return true
  return LAZY_CHUNK_PAGE[m[1]] === page
}

import { defineConfig } from 'vitepress'
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SITE_URL = 'https://alterfo.github.io'
const AUTHOR = 'Oleg Sidorkin'

function redirectHtml(target: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
</head>
<body>
<p>Redirecting to <a href="${target}">${target}</a></p>
</body>
</html>
`
}

function canonicalFor(rel: string): string {
  let p = rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')
  if (!p.startsWith('/')) p = '/' + p
  return SITE_URL + (p === '/' ? '/' : p)
}

// Reusable Person node for JSON-LD (nested as author refs; @context added at top level).
const PERSON = {
  '@type': 'Person',
  name: AUTHOR,
  alternateName: 'alterfo',
  url: SITE_URL,
  jobTitle: 'Software Engineer',
  knowsAbout: ['Music', 'Audio DSP', 'AI', 'RAG', 'Frontend Development', 'Solution Architecture'],
  sameAs: ['https://github.com/alterfo'],
}

// Client-side tool pages → schema.org applicationCategory.
const TOOL_CATEGORY: Record<string, string> = {
  'idef0.md': 'BusinessApplication',
  'planner.md': 'BusinessApplication',
  'journal.md': 'LifestyleApplication',
  'piano.md': 'MultimediaApplication',
  'openpose.md': 'DesignApplication',
}

// Build the per-page JSON-LD object (or null if the page type has none).
function jsonLdFor(rel: string, title: string, desc: string, url: string): Record<string, unknown> | null {
  if (rel === 'index.md') {
    return { '@context': 'https://schema.org', ...PERSON }
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

export default defineConfig({
  title: 'Alterfo',
  titleTemplate: ':title — Alterfo',
  description: 'Олег Сидоркин — инженер и музыкант: проекты, локальные инструменты без облака и заметки об аудио, AI и архитектуре.',
  lang: 'ru-RU',
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('opensheetmusicdisplay')) return 'osmd'
          },
        },
      },
    },
  },
  ignoreDeadLinks: [/^\/(reflection|stack-1|stack-2|stack-3)$/],
  srcExclude: [
    'blog/_posts/**',
    'blog/.vuepress/**',
    'blog/about.md',
    'blog/idef0.md',
    'node_modules/**',
    'KODA.md',
    'README.md',
    'CLAUDE.md',
    'docs/**',
    'ar-engine/**',
  ],
  nav: [
    { text: 'Главная', link: '/' },
    { text: 'Блог', link: '/blog/' },
    { text: 'Planner', link: '/planner' },
  ],
  transformPageData(pageData) {
    const url = canonicalFor(pageData.relativePath)
    const title = pageData.title || 'Alterfo'
    const desc = pageData.description
      || (pageData.frontmatter.description as string)
      || 'Oleg Sidorkin — инженер и музыкант. Проекты, инструменты и заметки.'
    const isPost = pageData.relativePath.startsWith('posts/')
    ;(pageData.frontmatter.head ??= []).push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:type', content: isPost ? 'article' : 'website' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: desc }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: SITE_URL + '/og.png' }],
      ['meta', { property: 'og:site_name', content: 'Alterfo' }],
      ['meta', { property: 'og:locale', content: 'ru_RU' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: desc }],
      ['meta', { name: 'twitter:image', content: SITE_URL + '/og.png' }],
    )
    const ld = jsonLdFor(pageData.relativePath, title, desc, url)
    if (ld) {
      pageData.frontmatter.head.push(['script', { type: 'application/ld+json' }, JSON.stringify(ld)])
    }
  },
  // Old VuePress posts used /posts/:year/:month/:day/:slug.
  // New VitePress posts live at /posts/YYYY-MM-DD-slug.
  // No source rewrites needed (posts stay at /posts/); static HTML redirects
  // are generated below so old inbound links keep working.
  buildEnd: async (siteConfig) => {
    let files: string[] = []
    try {
      files = readdirSync(join(siteConfig.srcDir, 'posts')).filter(f => f.endsWith('.md'))
    } catch {
      files = []
    }
    for (const file of files) {
      const basename = file.replace(/\.md$/, '')
      const match = basename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/)
      if (!match) continue
      const [, year, month, day, slug] = match
      const dir = join(siteConfig.outDir, 'posts', year, month, day, slug)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.html'), redirectHtml(`/posts/${basename}`))
    }

    // Hand-rolled sitemap.xml from source pages (md only → redirect stubs auto-excluded).
    const EXTRA_URLS = ['/ar/'] // static apps not in siteConfig.pages
    const entries = siteConfig.pages
      .map((p: string) => {
        const path = '/' + p.replace(/\.md$/, '').replace(/(^|\/)index$/, '')
        let lastmod = ''
        try {
          lastmod = statSync(join(siteConfig.srcDir, p)).mtime.toISOString().slice(0, 10)
        } catch {}
        const priority = p === 'index.md' ? '1.0'
          : /^(idef0|planner|journal)/.test(p) ? '0.8'
          : p.startsWith('projects/') ? '0.7' : '0.6'
        return { loc: SITE_URL + (path === '/' ? '/' : path), lastmod, priority }
      })
      .concat(EXTRA_URLS.map(u => ({ loc: SITE_URL + u, lastmod: '', priority: '0.8' })))
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + entries.map(e => `  <url><loc>${e.loc}</loc>`
          + (e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '')
          + `<priority>${e.priority}</priority></url>`).join('\n')
      + `\n</urlset>\n`
    writeFileSync(join(siteConfig.outDir, 'sitemap.xml'), xml)
  },
})

import { defineConfig } from 'vitepress'
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_URL, canonicalFor, jsonLdFor, jsonLdScript, sitemapPriority } from './seo.js'
import { nbspBeforeDash, applyNbspToInlineTokens } from './typography.js'

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

export default defineConfig({
  title: 'Alterfo',
  //   — неразрывный пробел перед длинным тире (правило типографики сайта)
  titleTemplate: ':title — Alterfo',
  description: 'Олег Сидоркин — инженер и музыкант: проекты, локальные инструменты без облака и заметки об аудио, AI и архитектуре.',
  lang: 'ru-RU',
  // Сайт тёмный по дизайн-системе «Spiral», светлой темы нет и не планируется —
  // прибиваем тёмную и убираем переключатель sun/moon из шапки блога.
  appearance: 'force-dark',
  markdown: {
    config(md) {
      // Русская типографика: в текстовых токенах пробел перед «—» → U+00A0,
      // чтобы тире не отрывалось от слова при переносе. Посты можно писать
      // с обычными пробелами — сборка поправит (включая &mdash;-сущности и alt).
      // Правило в конце core-ruler — ПОСЛЕ markdown-it-anchor, чтобы не менять
      // slug'и заголовков (входящие #-якоря должны остаться стабильными).
      md.core.ruler.push('nbsp_before_mdash', (state) => {
        for (const token of state.tokens) {
          if (token.type !== 'inline' || !token.children) continue
          applyNbspToInlineTokens(token.children)
        }
      })
    },
  },
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
  // Навигация дефолтной темы живёт в themeConfig (top-level `nav` VitePress
  // игнорирует — меню из-за этого вообще не рендерилось). Вместо надписи
  // «Alterfo» — иконка-колесо (статичная копия HomeMark, ссылка на главную).
  themeConfig: {
    logo: '/home-wheel.svg',
    siteTitle: false,
    nav: [
      {
        text: 'Проекты',
        items: [
          { text: 'AR Engine', link: '/projects/ar-engine' },
          { text: 'IDEF0 Editor', link: '/projects/idef0-editor' },
        ],
      },
      { text: 'Блог', link: '/blog/' },
      { text: 'Planner', link: '/planner' },
    ],
  },
  transformPageData(pageData) {
    const url = canonicalFor(pageData.relativePath)
    // nbspBeforeDash: правило типографики сайта действует и в мета-тегах/JSON-LD.
    // pageData.description мутируется, чтобы и базовый <meta name="description">
    // (его VitePress рендерит сам, мимо frontmatter.head) получил nbsp.
    pageData.description = nbspBeforeDash(pageData.description || '')
    const title = nbspBeforeDash(pageData.title || 'Alterfo')
    const desc = pageData.description
      || 'Oleg Sidorkin — инженер и музыкант. Проекты, инструменты и заметки.'
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
      pageData.frontmatter.head.push(['script', { type: 'application/ld+json' }, jsonLdScript(ld)])
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
        let lastmod = ''
        try {
          lastmod = statSync(join(siteConfig.srcDir, p)).mtime.toISOString().slice(0, 10)
        } catch {}
        // Reuse canonicalFor so <loc> matches each page's own canonical link
        // (they used to diverge on the trailing slash for nested index pages).
        return { loc: canonicalFor(p), lastmod, priority: sitemapPriority(p) }
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

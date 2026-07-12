import { defineConfig } from 'vitepress'
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_URL, EXTRA_URLS, SITE_HEAD, canonicalFor, jsonLdFor, jsonLdScript, sitemapPriority, shouldPreloadLink } from './seo.js'
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
  head: SITE_HEAD,
  // Demotes the lazy app-root/WebGPU chunks from modulepreload to prefetch on every
  // page except the one that actually renders them — see shouldPreloadLink in seo.js.
  shouldPreload: shouldPreloadLink,
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
    // Vite's default dependency-scanner globs every *.html in the project root to seed
    // its esbuild pre-bundle crawl. vacuum-rogues/src/index.html and ar-engine/web/index.html
    // are vendored static sub-apps built entirely separately (own deps, own CI step) — their
    // own node_modules never exists at this repo's root, so the default scan crashes `npm run
    // dev` trying to resolve their imports (zod, pixi.js, @/* aliases). Excluding them here
    // mirrors srcExclude below (which only controls VitePress page routing, not Vite's scan).
    optimizeDeps: {
      entries: ['**/*.html', '!vacuum-rogues/**', '!ar-engine/**'],
    },
    // Dev-only: proxy /vacuum-rogues/ to the locally-running game (default :4137) so the
    // home-page center mark's `HEAD /vacuum-rogues/` probe sees it and the ship shows in
    // `npm run dev`. Override the target with VACUUM_ROGUES_DEV_URL. No effect on build/prod.
    // The probe only needs a 200 here; to actually PLAY locally, open the game's own dev
    // server directly (it serves at base '/').
    server: {
      proxy: {
        '/vacuum-rogues': {
          target: process.env.VACUUM_ROGUES_DEV_URL || 'http://localhost:4137',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/vacuum-rogues/, '') || '/',
        },
      },
    },
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
    'node_modules/**',
    'KODA.md',
    'README.md',
    'CLAUDE.md',
    'docs/**',
    'ar-engine/**',
    'vacuum-rogues/**',
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
          {
            text: 'Приложения',
            items: [
              { text: 'Дневник', link: '/journal' },
              { text: 'IDEF0-редактор', link: '/idef0' },
              // target: '_self' — /ar/ живёт вне VitePress-роутера (см. LifeCircle)
              { text: 'Аудио-реактив', link: '/ar/', target: '_self' },
              { text: 'Piano Teacher', link: '/piano' },
              { text: 'OpenPose Editor', link: '/openpose' },
              { text: 'Планировщик', link: '/planner' },
              { text: 'Журнал решений', link: '/decision-journal' },
            ],
          },
          {
            text: 'Разборы',
            items: [
              { text: 'Аудио-реактив — архитектура', link: '/projects/ar-engine' },
              { text: 'IDEF0 Editor — архитектура', link: '/projects/idef0-editor' },
            ],
          },
        ],
      },
      { text: 'Музыка', link: '/music' },
      { text: 'Блог', link: '/blog' },
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
    // EXTRA_URLS (static sub-apps not in siteConfig.pages) live in seo.js so they're unit-testable.
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

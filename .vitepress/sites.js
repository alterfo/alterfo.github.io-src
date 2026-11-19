import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'

const CREATIVE_NAV = [
  {
    text: 'Проекты',
    items: [
      {
        text: 'Приложения',
        items: [
          { text: 'Piano Teacher', link: '/piano' },
          { text: 'OpenPose Editor', link: '/openpose' },
          { text: 'Пазлы', link: '/casual-games' },
          { text: 'Аудио-реактив', link: '/ar/', target: '_self' },
        ],
      },
      {
        text: 'Разборы',
        items: [{ text: 'Аудио-реактив — архитектура', link: '/projects/ar-engine' }],
      },
    ],
  },
  { text: 'Музыка', link: '/music' },
  { text: 'Блог', link: '/blog' },
]

const PRO_NAV = [
  {
    text: 'Проекты',
    items: [
      { text: 'IDEF0-редактор', link: '/idef0' },
      { text: 'Дневник', link: '/journal' },
      { text: 'Финансы', link: '/finance' },
      { text: 'Планировщик', link: '/planner' },
      { text: 'Журнал решений', link: '/decision-journal' },
    ],
  },
  { text: 'Разборы', link: '/projects/idef0-editor' },
  {
    text: 'Кейсы',
    items: [
      { text: 'kb — GraphRAG', link: '/work/kb' },
      { text: 'Approximate — трейдинг', link: '/work/approximate' },
      { text: 'FinContext MCP', link: '/work/fincontext' },
      { text: 'Shelfprice — ценники', link: '/work/shelfprice' },
      { text: 'watersort — солвер', link: '/work/watersort' },
      { text: 'IDEF0 Editor', link: '/work/idef0' },
    ],
  },
  { text: 'Аудит', link: '/audit/', target: '_self' },
  { text: 'CV', link: '/cv' },
  { text: 'Контакты', link: '/contact' },
]

export const SITES = {
  creative: {
    id: 'creative',
    name: 'Alterfo',
    url: 'https://alterfo.ru',
    domain: 'alterfo.ru',
    titleTemplate: ':title — Alterfo',
    description: 'Олег Сидоркин — инженер и музыкант: музыка, блог, игры и инструменты без облака.',
    ogImage: '/og.png',
    logo: '/home-wheel.svg',
    nav: CREATIVE_NAV,
    extraUrls: ['/ar/'],
  },
  pro: {
    id: 'pro',
    name: 'Oleg Sidorkin',
    url: 'https://oleg-sidorkin.ru',
    domain: 'oleg-sidorkin.ru',
    titleTemplate: ':title — Oleg Sidorkin',
    description: 'Олег Сидоркин — инженер: кейсы, системы, аудит зрелости платформы.',
    ogImage: '/og.png',
    logo: '/home-wheel.svg',
    nav: PRO_NAV,
    extraUrls: ['/audit/'],
  },
}

export const DEFAULT_SITE = 'creative'
export const SHARED_PAGES = ['index.md']
const NON_CONTENT = new Set(['AGENTS.md', 'README.md', 'CLAUDE.md', 'KODA.md'])

export function canonicalPath(rel) {
  let p = rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')
  if (!p.startsWith('/')) p = '/' + p
  return p === '/' ? '/' : p
}

export function resolveSite(value) {
  const id = String(value || DEFAULT_SITE).trim().toLowerCase()
  if (!SITES[id]) {
    throw new Error(`Unknown SITE "${value}". Expected one of: ${Object.keys(SITES).join(', ')}`)
  }
  return SITES[id]
}

export function activeSite(env = process.env) {
  return resolveSite(env.SITE)
}

function pageDirs(root) {
  const out = []
  for (const entry of readdirSync(root)) {
    if (!entry.endsWith('.md') || NON_CONTENT.has(entry)) continue
    out.push(entry)
  }
  for (const dir of ['posts', 'projects', 'work']) {
    const base = join(root, dir)
    if (existsSync(base)) walkDir(base, dir, out)
  }
  return out
}

function walkDir(abs, rel, out) {
  for (const entry of readdirSync(abs)) {
    const next = join(abs, entry)
    const nextRel = rel + '/' + entry
    if (statSync(next).isDirectory()) walkDir(next, nextRel, out)
    else if (entry.endsWith('.md')) out.push(nextRel)
  }
}

export function scanPages(root) {
  return pageDirs(root).map((file) => {
    const { data } = matter(readFileSync(join(root, file), 'utf-8'))
    const site = data.site
    if (!site) throw new Error(`Page "${file}" is missing the "site" frontmatter field`)
    if (site !== 'pro' && site !== 'creative' && site !== 'shared') {
      throw new Error(`Page "${file}" has invalid site "${site}"`)
    }
    if (site === 'shared' && !SHARED_PAGES.includes(file)) {
      throw new Error(`Page "${file}" may not be "shared"; only ${SHARED_PAGES.join(', ')} can be`)
    }
    return { file, site }
  })
}


export function redirectsFor(root, siteId) {
  const site = resolveSite(siteId)
  const other = Object.values(SITES).find((entry) => entry.id !== site.id)
  const out = []
  for (const page of scanPages(root)) {
    if (page.site !== other.id) continue
    const path = canonicalPath(page.file)
    out.push({ from: path, to: other.url + path })
    if (!page.file.startsWith('posts/')) continue
    const basename = page.file.slice('posts/'.length).replace(/\.md$/, '')
    const match = basename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/)
    if (match) {
      const [, year, month, day, slug] = match
      out.push({ from: '/posts/' + year + '/' + month + '/' + day + '/' + slug.toLowerCase(), to: other.url + '/posts/' + basename })
    }
    const { data } = matter(readFileSync(join(root, page.file), 'utf-8'))
    if (typeof data.permalink === 'string' && /^\/[\w-]+$/.test(data.permalink)) {
      out.push({ from: data.permalink, to: other.url + '/posts/' + basename })
    }
  }
  return out
}

export function excludedFor(root, siteId) {
  return scanPages(root)
    .filter((p) => p.site !== 'shared' && p.site !== siteId)
    .map((p) => p.file)
}

export function relativeToRoot(root, file) {
  return relative(root, file).split(sep).join('/')
}

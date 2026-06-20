// Post-deploy smoke test for the live site (https://alterfo.github.io).
// Run by .github/workflows/smoke.yml after the Deploy workflow succeeds; also runnable
// locally: `npm i --no-save playwright && npx playwright install chromium &&
//           SMOKE_INITIAL_DELAY_MS=0 node scripts/smoke.mjs`.
//
// For each route it asserts HTTP < 400, the SSR <title> (stable, server-rendered), and —
// for the Vue apps — that the client-mounted root element actually appears (proves the app
// boots, not just the shell). A full-page screenshot of every route is written to smoke-shots/
// (uploaded as a CI artifact). Any failure → non-zero exit → red workflow → GitHub email.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = (process.env.SMOKE_BASE_URL || 'https://alterfo.github.io').replace(/\/$/, '')
const OUT = 'smoke-shots'
const INITIAL_DELAY_MS = Number(process.env.SMOKE_INITIAL_DELAY_MS ?? 60_000)

// path, name, title substring (SSR), optional client-mounted app root selector.
const ROUTES = [
  { path: '/',                 name: 'home',      title: 'Alterfo' },
  { path: '/blog',             name: 'blog',      title: 'Блог' },
  { path: '/idef0',            name: 'idef0',     title: 'IDEF0',    root: '.idef0-root' },
  { path: '/journal',          name: 'journal',   title: 'Journal',  root: '.journal-root' },
  { path: '/piano',            name: 'piano',     title: 'Piano',    root: '.piano-app' },
  { path: '/openpose',         name: 'openpose',  title: 'OpenPose', root: '.op-root' },
  { path: '/planner',          name: 'planner',   title: 'Planner',  root: '.planner-root' },
  { path: '/decision-journal', name: 'decisions', title: 'решений',  root: '.dj-root' },
  { path: '/music',            name: 'music',     title: 'Музыка',   root: '.music-albums' },
  { path: '/ar/',              name: 'ar',        title: 'AR Engine' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

// GitHub Pages can lag behind the deploy push by a minute or two — poll '/' until it answers.
async function waitForLive() {
  const deadline = Date.now() + 5 * 60_000
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(BASE + '/', { redirect: 'follow' })
      if (res.ok) { console.log(`site live (attempt ${attempt})`); return }
      console.log(`wait attempt ${attempt}: HTTP ${res.status}`)
    } catch (e) {
      console.log(`wait attempt ${attempt}: ${e.message}`)
    }
    if (Date.now() > deadline) throw new Error('site did not become live within 5 min')
    await sleep(15_000)
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  console.log(`smoke target: ${BASE}`)
  if (INITIAL_DELAY_MS > 0) {
    console.log(`initial settle ${INITIAL_DELAY_MS}ms for Pages to publish the fresh deploy`)
    await sleep(INITIAL_DELAY_MS)
  }
  await waitForLive()

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(30_000)

  const failures = []
  for (const r of ROUTES) {
    const url = BASE + r.path
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' })
      const status = resp?.status() ?? 0
      if (status >= 400) throw new Error(`HTTP ${status}`)

      const title = await page.title()
      if (/PAGE NOT FOUND|^404/i.test(title)) throw new Error(`looks like 404: "${title}"`)
      if (r.title && !title.includes(r.title)) throw new Error(`title "${title}" missing "${r.title}"`)

      if (r.root) {
        await page.waitForSelector(r.root, { state: 'attached' })
      } else {
        await page.waitForLoadState('networkidle').catch(() => {}) // animated canvases never idle
      }
      await sleep(800) // let first paint settle before the shot
      await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: true })
      console.log(`OK    ${r.path.padEnd(18)} ${title}`)
    } catch (e) {
      console.log(`FAIL  ${r.path.padEnd(18)} ${e.message}`)
      try { await page.screenshot({ path: `${OUT}/${r.name}-FAIL.png`, fullPage: true }) } catch {}
      failures.push(`${r.path}: ${e.message}`)
    }
  }

  await browser.close()

  console.log(`\n${ROUTES.length - failures.length}/${ROUTES.length} routes OK`)
  if (failures.length) {
    console.error('FAILURES:\n' + failures.map(f => '  - ' + f).join('\n'))
    process.exit(1)
  }
  console.log('smoke test passed ✓')
}

main().catch(e => { console.error('smoke runner error:', e); process.exit(1) })

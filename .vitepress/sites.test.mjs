import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { SITES, SHARED_PAGES, activeSite, canonicalPath, excludedFor, redirectsFor, resolveSite, scanPages } from './sites.js'
import { SITE_URL, SITE_NAME, EXTRA_URLS } from './seo.js'

const root = fileURLToPath(new URL('..', import.meta.url))

test('resolveSite: defaults to creative', () => {
  assert.equal(resolveSite().id, 'creative')
  assert.equal(resolveSite('').id, 'creative')
})

test('resolveSite: accepts pro and is case-insensitive', () => {
  assert.equal(resolveSite('pro').id, 'pro')
  assert.equal(resolveSite(' PRO ').id, 'pro')
})

test('resolveSite: rejects unknown values with a readable message', () => {
  assert.throws(() => resolveSite('staging'), /Unknown SITE "staging"/)
})

test('activeSite: reads SITE from the environment', () => {
  assert.equal(activeSite({ SITE: 'pro' }).id, 'pro')
  assert.equal(activeSite({}).id, 'creative')
})

test('sites: every site has a url, name, nav and title template', () => {
  for (const site of Object.values(SITES)) {
    assert.match(site.url, /^https:\/\//)
    assert.ok(site.domain)
    assert.ok(site.name)
    assert.ok(site.titleTemplate.includes(':title'))
    assert.ok(Array.isArray(site.nav) && site.nav.length > 0)
  }
})

test('seo: site-level exports follow the active site', () => {
  assert.equal(SITE_URL, SITES.creative.url)
  assert.equal(SITE_NAME, SITES.creative.name)
  assert.deepEqual(EXTRA_URLS, SITES.creative.extraUrls)
})

test('scanPages: every content page declares a valid owner', () => {
  const pages = scanPages(root)
  assert.ok(pages.length > 100)
  for (const page of pages) {
    assert.ok(['pro', 'creative', 'shared'].includes(page.site), page.file)
  }
})

test('scanPages: shared ownership is limited to the shell', () => {
  const shared = scanPages(root).filter((p) => p.site === 'shared').map((p) => p.file)
  assert.deepEqual(shared, SHARED_PAGES)
})

test('excludedFor: excludes exactly the other site, never shared', () => {
  const pages = scanPages(root)
  for (const id of ['pro', 'creative']) {
    const excluded = excludedFor(root, id)
    const expected = pages.filter((p) => p.site !== 'shared' && p.site !== id).map((p) => p.file)
    assert.deepEqual(excluded.sort(), expected.sort())
    assert.ok(!excluded.includes('index.md'))
  }
})

test('excludedFor: the two sites are disjoint', () => {
  const pro = new Set(excludedFor(root, 'creative'))
  const creative = new Set(excludedFor(root, 'pro'))
  for (const file of pro) assert.ok(!creative.has(file), file)
})

test('internal links never cross site ownership', () => {
  const pages = scanPages(root)
  const owners = new Map(pages.map((p) => [canonicalPath(p.file), p.site]))
  const problems = []
  for (const page of pages) {
    const body = readFileSync(join(root, page.file), 'utf8')
    for (const match of body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const path = match[1].split('#')[0].split('?')[0]
      if (!path) continue
      const target = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
      const owner = owners.get(target)
      if (!owner || owner === 'shared' || page.site === 'shared') continue
      if (owner !== page.site) problems.push(page.file + ' -> ' + path)
    }
  }
  assert.deepEqual(problems, [])
})

test('redirectsFor: stubs point at the other site and never at a real page', () => {
  const pages = scanPages(root)
  const ownPaths = new Set(pages.filter((p) => p.site !== 'shared').map((p) => canonicalPath(p.file)))
  for (const id of ['pro', 'creative']) {
    const other = SITES[id === 'pro' ? 'creative' : 'pro']
    for (const entry of redirectsFor(root, id)) {
      assert.ok(entry.from.startsWith('/'), entry.from)
      assert.ok(entry.to.startsWith(other.url + '/'), entry.from + ' -> ' + entry.to)
      if (ownPaths.has(entry.from)) {
        const owner = pages.find((p) => canonicalPath(p.file) === entry.from)
        assert.equal(owner.site, other.id, entry.from)
      }
    }
  }
})

test('redirectsFor: the old date permalink of a moved post is covered', () => {
  const urls = redirectsFor(root, 'creative').map((e) => e.from)
  assert.ok(urls.includes('/posts/2020/09/25/critical-rendering-path'))
  assert.ok(urls.includes('/idef0'))
})

test('canonicalPath: shared shell is the root and never redirected', () => {
  assert.equal(canonicalPath('index.md'), '/')
  for (const id of ['pro', 'creative']) {
    assert.ok(!redirectsFor(root, id).some((e) => e.from === '/'))
  }
})

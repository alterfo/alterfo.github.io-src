import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SITE_URL,
  canonicalPath,
  canonicalFor,
  jsonLdFor,
  jsonLdScript,
  sitemapPriority,
  TOOL_CATEGORY,
} from './seo.js'

test('canonicalPath: root index collapses to /', () => {
  assert.equal(canonicalPath('index.md'), '/')
})

test('canonicalPath: nested index keeps its trailing slash', () => {
  assert.equal(canonicalPath('blog/index.md'), '/blog/')
})

test('canonicalPath: top-level page', () => {
  assert.equal(canonicalPath('idef0.md'), '/idef0')
})

test('canonicalPath: dated post', () => {
  assert.equal(canonicalPath('posts/2020-09-03-foo.md'), '/posts/2020-09-03-foo')
})

test('canonicalPath: projects page', () => {
  assert.equal(canonicalPath('projects/ar-engine.md'), '/projects/ar-engine')
})

test('canonicalFor prefixes SITE_URL', () => {
  assert.equal(canonicalFor('index.md'), SITE_URL + '/')
  assert.equal(canonicalFor('blog/index.md'), SITE_URL + '/blog/')
})

test('jsonLdFor: home → Person with top-level @context', () => {
  const ld = jsonLdFor('index.md', 'Alterfo', 'd', SITE_URL + '/')
  assert.equal(ld['@type'], 'Person')
  assert.equal(ld['@context'], 'https://schema.org')
})

test('jsonLdFor: tool page → SoftwareApplication with matching category', () => {
  const ld = jsonLdFor('piano.md', 'Piano', 'd', SITE_URL + '/piano')
  assert.equal(ld['@type'], 'SoftwareApplication')
  assert.equal(ld.applicationCategory, TOOL_CATEGORY['piano.md'])
  assert.equal(ld.author['@type'], 'Person')
  assert.equal(ld.offers.price, '0')
})

test('jsonLdFor: decision-journal is a registered tool page (SoftwareApplication)', () => {
  const ld = jsonLdFor('decision-journal.md', 'Журнал решений', 'd', SITE_URL + '/decision-journal')
  assert.equal(ld['@type'], 'SoftwareApplication')
  assert.equal(ld.applicationCategory, TOOL_CATEGORY['decision-journal.md'])
  assert.equal(sitemapPriority('decision-journal.md'), '0.8')
})

test('jsonLdFor: dated post → BlogPosting with datePublished', () => {
  const ld = jsonLdFor('posts/2021-01-15-foo.md', 'T', 'd', 'u')
  assert.equal(ld['@type'], 'BlogPosting')
  assert.equal(ld.datePublished, '2021-01-15')
  assert.equal(ld.headline, 'T')
  assert.equal(ld.description, 'd')
  assert.equal(ld.url, 'u')
  assert.equal(ld.inLanguage, 'ru-RU')
  assert.equal(ld.author['@type'], 'Person')
})

test('jsonLdFor: undated post omits datePublished (no undefined field)', () => {
  const ld = jsonLdFor('posts/foo.md', 'T', 'd', 'u')
  assert.equal(ld['@type'], 'BlogPosting')
  assert.ok(!('datePublished' in ld))
})

test('jsonLdFor: case-study / unknown page → null (no structured data)', () => {
  assert.equal(jsonLdFor('projects/ar-engine.md', 'T', 'd', 'u'), null)
  assert.equal(jsonLdFor('blog/index.md', 'T', 'd', 'u'), null)
})

test('jsonLdScript escapes <, >, & so a title cannot break out of the script element', () => {
  const out = jsonLdScript({ headline: 'A </script><b> & B' })
  assert.ok(!out.includes('<'), 'no raw <')
  assert.ok(!out.includes('>'), 'no raw >')
  assert.ok(!out.includes('&'), 'no raw &')
  assert.ok(!/<\/script>/i.test(out), 'no </script> sequence')
  // still valid JSON that round-trips to the original data
  assert.deepEqual(JSON.parse(out), { headline: 'A </script><b> & B' })
})

test('jsonLdFor: music.md → MusicGroup with albums and sameAs', () => {
  const ld = jsonLdFor('music.md', 'Музыка', 'd', 'https://alterfo.github.io/music')
  assert.equal(ld['@type'], 'MusicGroup')
  assert.equal(ld['@context'], 'https://schema.org')
  assert.equal(ld.name, 'Alterfo')
  assert.equal(ld.url, 'https://alterfo.github.io/music')
  assert.ok(Array.isArray(ld.sameAs) && ld.sameAs.length > 0, 'sameAs contains artist link')
  assert.ok(ld.sameAs[0].includes('yandex'), 'sameAs points to Yandex Music')
  assert.ok(Array.isArray(ld.album) && ld.album.length === 2, 'two albums')
  assert.equal(ld.album[0]['@type'], 'MusicAlbum')
  assert.equal(ld.album[0].name, 'Impressions')
  assert.equal(ld.album[0].datePublished, '2025')
  assert.equal(ld.album[1].name, 'Механика близости')
  assert.equal(ld.album[1].datePublished, '2026')
})

test('sitemapPriority: tiers per page type', () => {
  assert.equal(sitemapPriority('index.md'), '1.0')
  assert.equal(sitemapPriority('idef0.md'), '0.8')
  assert.equal(sitemapPriority('piano.md'), '0.8') // regression: was 0.6 before fix
  assert.equal(sitemapPriority('openpose.md'), '0.8') // regression: was 0.6 before fix
  assert.equal(sitemapPriority('music.md'), '0.8')
  assert.equal(sitemapPriority('projects/ar-engine.md'), '0.7')
  assert.equal(sitemapPriority('posts/2020-01-01-x.md'), '0.6')
})

test('sitemapPriority: a page merely prefixed with a tool name is not a tool', () => {
  // the old /^(idef0|planner|journal)/ regex would have matched 'journalists.md'
  assert.equal(sitemapPriority('journalists.md'), '0.6')
})

test('sitemap <loc> matches the page canonical for every page type (no drift)', () => {
  for (const rel of ['index.md', 'blog/index.md', 'idef0.md', 'projects/ar-engine.md', 'posts/2020-01-01-x.md']) {
    assert.equal(canonicalFor(rel), SITE_URL + canonicalPath(rel))
  }
})

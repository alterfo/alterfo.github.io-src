import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ALBUMS, ARTIST, formatDuration, albumUrl, embedUrl } from './music.js'

describe('formatDuration', () => {
  it('formats sub-minute seconds (58 → 0:58)', () => {
    assert.equal(formatDuration(58), '0:58')
  })
  it('formats multi-minute seconds (288 → 4:48)', () => {
    assert.equal(formatDuration(288), '4:48')
  })
  it('pads single-digit seconds (63 → 1:03)', () => {
    assert.equal(formatDuration(63), '1:03')
  })
  it('formats exactly 0 seconds (0 → 0:00)', () => {
    assert.equal(formatDuration(0), '0:00')
  })
  it('formats exactly 60 seconds (60 → 1:00)', () => {
    assert.equal(formatDuration(60), '1:00')
  })
})

describe('albumUrl', () => {
  it('builds correct Yandex album URL for first album', () => {
    assert.equal(albumUrl(39942489), 'https://music.yandex.ru/album/39942489')
  })
  it('builds correct Yandex album URL for second album', () => {
    assert.equal(albumUrl(41458836), 'https://music.yandex.ru/album/41458836')
  })
})

describe('embedUrl', () => {
  it('builds correct Yandex embed URL for first album', () => {
    assert.equal(embedUrl(39942489), 'https://music.yandex.ru/iframe/#album/39942489')
  })
  it('builds correct Yandex embed URL for second album', () => {
    assert.equal(embedUrl(41458836), 'https://music.yandex.ru/iframe/#album/41458836')
  })
})

describe('ALBUMS', () => {
  it('has exactly 2 albums', () => {
    assert.equal(ALBUMS.length, 2)
  })
  it('first album (Impressions) has 7 tracks', () => {
    assert.equal(ALBUMS[0].tracks.length, 7)
  })
  it('second album (Механика близости) has 8 tracks', () => {
    assert.equal(ALBUMS[1].tracks.length, 8)
  })
  it('every album has cover at /music/<name>.(jpg|png|webp), year, genreLabel, id', () => {
    for (const album of ALBUMS) {
      assert.match(album.cover, /^\/music\/.+\.(jpg|png|webp)$/i, `${album.title}: cover must be a root-relative /music/ path`)
      assert.ok(album.year, `${album.title}: missing year`)
      assert.ok(album.genreLabel, `${album.title}: missing genreLabel`)
      assert.ok(album.id, `${album.title}: missing id`)
    }
  })
  it('every track has a title and positive seconds', () => {
    for (const album of ALBUMS) {
      for (const track of album.tracks) {
        assert.ok(track.title, `${album.title}: track missing title`)
        assert.ok(track.seconds > 0, `${album.title}/${track.title}: seconds must be positive`)
      }
    }
  })
  it('Impressions year is 2025', () => {
    assert.equal(ALBUMS[0].year, 2025)
  })
  it('Механика близости year is 2026', () => {
    assert.equal(ALBUMS[1].year, 2026)
  })
})

describe('ARTIST', () => {
  it('has name Alterfo', () => {
    assert.equal(ARTIST.name, 'Alterfo')
  })
  it('has correct Yandex artist URL', () => {
    assert.equal(ARTIST.url, 'https://music.yandex.ru/artist/25224352')
  })
})

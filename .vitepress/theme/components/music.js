// Pure data + helpers for the /music page. No Vue, no DOM — node-testable.

export const ARTIST = {
  name: 'Alterfo',
  id: 25224352,
  url: 'https://music.yandex.ru/artist/25224352',
}

export const ALBUMS = [
  {
    id: 39942489,
    title: 'Impressions',
    year: 2025,
    genreLabel: 'релакс',
    cover: '/music/impressions.jpg',
    tracks: [
      { title: 'Tribe', seconds: 166 },
      { title: 'Take One', seconds: 288 },
      { title: 'Predator', seconds: 58 },
      { title: 'Up Again', seconds: 108 },
      { title: 'Obedience', seconds: 240 },
      { title: 'Buy something', seconds: 98 },
      { title: 'Spring', seconds: 163 },
    ],
  },
  {
    id: 41458836,
    title: 'Механика близости',
    year: 2026,
    genreLabel: 'эмбиент',
    cover: '/music/mekhanika-blizosti.jpg',
    tracks: [
      { title: 'Начало', seconds: 63 },
      { title: 'Одиночество в глуши', seconds: 264 },
      { title: 'Танец под горной луной', seconds: 248 },
      { title: 'Хрупкая надежда', seconds: 141 },
      { title: 'Уединение', seconds: 220 },
      { title: 'Искусство Легких Касаний', seconds: 234 },
      { title: 'Мелонхоменко', seconds: 182 },
      { title: 'Конец', seconds: 149 },
    ],
  },
]

// Formats seconds as 'M:SS'
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function albumUrl(id) {
  return `https://music.yandex.ru/album/${id}`
}

export function embedUrl(id) {
  return `https://music.yandex.ru/iframe/#album/${id}`
}

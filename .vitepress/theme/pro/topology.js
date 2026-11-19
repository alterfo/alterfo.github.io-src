// Модель связей в команде: только арифметика числа каналов, без выдуманных
// коэффициентов продуктивности. n человек в одной группе — n(n-1)/2 каналов.

export function channels(n) {
  if (!Number.isFinite(n) || n < 2) return 0
  return (n * (n - 1)) / 2
}

export function channelsPerPerson(n) {
  if (!Number.isFinite(n) || n < 2) return 0
  return (n - 1) / 2
}

// Группы по size человек, максимально ровные. Внутри группы — полный граф,
// между группами — по одному каналу на пару групп (лид с лидом).
export function groupSizes(n, size = 8) {
  const total = Math.max(2, Math.floor(n))
  const per = Math.max(2, Math.min(Math.floor(size), total))
  const groups = Math.max(1, Math.round(total / per))
  const base = Math.floor(total / groups)
  const rest = total - base * groups
  const out = []
  for (let i = 0; i < groups; i++) out.push(base + (i < rest ? 1 : 0))
  return out
}

export function groupModel(n, size = 8) {
  return groupModelExact(n, size)
}

export function groupModelExact(n, size = 8) {
  const sizes = groupSizes(n, size)
  const within = sizes.reduce((sum, s) => sum + channels(s), 0)
  const cross = channels(sizes.length)
  const total = within + cross
  return {
    sizes,
    groups: sizes.length,
    size: sizes[0],
    within,
    cross,
    total,
    perPerson: total / Math.max(2, n),
  }
}

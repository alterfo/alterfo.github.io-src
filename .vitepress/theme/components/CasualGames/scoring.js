export const HINT_PENALTY = 25
export const TIME_PENALTY_PER_SECOND = 1

export function scorePuzzle(basePoints, hints = 0, elapsedSeconds = 0) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0))
  const hintCount = Math.max(0, Math.floor(Number(hints) || 0))
  const seconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0))
  return Math.max(0, base - hintCount * HINT_PENALTY - seconds * TIME_PENALTY_PER_SECOND)
}

export function queensScore(size, hints, elapsedSeconds) {
  return scorePuzzle(size * 100, hints, elapsedSeconds)
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

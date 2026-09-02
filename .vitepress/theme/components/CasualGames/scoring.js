export const HINT_PENALTY = 25
export const TIME_PENALTY_PER_SECOND = 1

export function scorePuzzle({
  basePoints,
  hints = 0,
  elapsedSeconds = 0,
  hintPenalty = HINT_PENALTY,
  timePenaltyPerSecond = TIME_PENALTY_PER_SECOND,
  minPoints = 0,
}) {
  const hintCount = Math.max(0, Math.floor(Number(hints) || 0))
  const seconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0))
  return Math.max(minPoints, basePoints - hintCount * hintPenalty - seconds * timePenaltyPerSecond)
}

export function queensScore(size, hints, elapsedSeconds) {
  return scorePuzzle({ basePoints: size * 100, hints, elapsedSeconds })
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

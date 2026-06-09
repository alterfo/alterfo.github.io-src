// Pure countdown math — extracted from CountDown.vue for unit-testability.
// No Vue / DOM deps: same numbers the component renders, but testable under node --test.

const MS_PER_DAY = 86400000
const MS_PER_HOUR = 3600000
const MS_PER_MINUTE = 60000
const MS_PER_SECOND = 1000

// Pure: remaining time until (startMs + days) at the instant nowMs.
// Returns days/hours/minutes/seconds plus `finished` once the target is reached.
export function computeRemaining(startMs, days, nowMs) {
  const targetMs = startMs + days * MS_PER_DAY
  const diff = targetMs - nowMs
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true }
  return {
    days: Math.floor(diff / MS_PER_DAY),
    hours: Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND),
    finished: false,
  }
}

// Pure: stroke-dashoffset for a progress ring given the fill fraction value/max.
// max === 0 → empty ring (full circumference offset), guarding against div-by-zero.
export function ringOffset(value, max, circumference) {
  const progress = max === 0 ? 0 : value / max
  return circumference * (1 - progress)
}

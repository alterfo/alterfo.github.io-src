// Pure geometry helpers for the LifeCircle wheel.
// 0° = top, clockwise; all functions are DOM-free and unit-tested.

// Радианы из градусов (0° = top, clockwise)
export function deg2rad(deg) {
  return (deg - 90) * Math.PI / 180
}

// SVG-путь кольцевого сегмента (donut arc)
// cx,cy — центр; innerR, outerR — радиусы; startDeg, endDeg — углы (0°=top, CW)
export function arcPath(cx, cy, innerR, outerR, startDeg, endDeg) {
  const s = deg2rad(startDeg), e = deg2rad(endDeg)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  const x1 = cx + innerR * Math.cos(s), y1 = cy + innerR * Math.sin(s)
  const x2 = cx + outerR * Math.cos(s), y2 = cy + outerR * Math.sin(s)
  const x3 = cx + outerR * Math.cos(e), y3 = cy + outerR * Math.sin(e)
  const x4 = cx + innerR * Math.cos(e), y4 = cy + innerR * Math.sin(e)
  return `M${x1},${y1} L${x2},${y2} A${outerR},${outerR},0,${large},1,${x3},${y3} L${x4},${y4} A${innerR},${innerR},0,${large},0,${x1},${y1} Z`
}

// Координаты для лейбла (внешний радиус + отступ), середина сегмента
export function labelXY(cx, cy, r, midDeg) {
  const a = deg2rad(midDeg)
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

// Внешний радиус заливки по уровню готовности (1-10)
// innerR + (maxOuterR - innerR) * (readiness / 10)
export function fillRadius(readiness, innerR, maxOuterR) {
  const clamped = Math.max(0, Math.min(10, readiness))
  return innerR + (maxOuterR - innerR) * (clamped / 10)
}

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

// Per-segment render data for the wheel: background track + readiness fill paths,
// outside label position and its text-anchor. Generalized to n = defs.length spheres:
// span = 360/n, sphere `i` spans `i*span+2 … (i+1)*span−2` (a 4° gap between spheres),
// midpoint `i*span+span/2`, so n × (span−4) + n × 4 = 360°. For n = 6 → span 60° (the
// original 56°/4° layout); for n = 7 → span ≈ 51.43°, last sphere ends at 358°.
// Pure — unit-tested; the .vue only renders it.
// `defs` = sphere defs ({ id, title, href, color, readiness, soon? });
// `geom` = { cx, cy, innerR, maxOuterR, labelR }.
export function buildSegments(defs, geom) {
  const { cx, cy, innerR, maxOuterR, labelR } = geom
  const span = 360 / defs.length
  return defs.map((s, i) => {
    const startDeg = i * span + 2
    const endDeg = (i + 1) * span - 2
    const midDeg = i * span + span / 2
    const fillR = fillRadius(s.readiness, innerR, maxOuterR)
    const label = labelXY(cx, cy, labelR, midDeg)
    const dx = Math.cos(deg2rad(midDeg))
    const anchor = dx > 0.2 ? 'start' : dx < -0.2 ? 'end' : 'middle'
    return {
      ...s,
      bgPath: arcPath(cx, cy, innerR, maxOuterR, startDeg, endDeg),
      fillPath: arcPath(cx, cy, innerR, fillR, startDeg, endDeg),
      label,
      anchor,
    }
  })
}

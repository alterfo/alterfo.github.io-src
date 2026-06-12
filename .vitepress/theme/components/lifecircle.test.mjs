import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deg2rad, arcPath, labelXY, fillRadius, buildSegments } from './lifecircle.js'

test('deg2rad: 0° (top) maps to -π/2 radians', () => {
  assert.ok(Math.abs(deg2rad(0) - (-Math.PI / 2)) < 1e-9)
})

test('deg2rad: 90° maps to 0 radians (pointing right)', () => {
  assert.ok(Math.abs(deg2rad(90) - 0) < 1e-9)
})

test('labelXY: at 0° (top) y decreases below center, x ≈ center', () => {
  const { x, y } = labelXY(200, 200, 100, 0)
  assert.ok(Math.abs(x - 200) < 1e-9)
  assert.ok(Math.abs(y - 100) < 1e-9)
})

test('labelXY: at 90° points to the right of center', () => {
  const { x, y } = labelXY(200, 200, 100, 90)
  assert.ok(Math.abs(x - 300) < 1e-9)
  assert.ok(Math.abs(y - 200) < 1e-9)
})

test('labelXY: at 180° (bottom) y grows below center, x ≈ center', () => {
  const { x, y } = labelXY(200, 200, 100, 180)
  assert.ok(Math.abs(x - 200) < 1e-9)
  assert.ok(Math.abs(y - 300) < 1e-9)
})

test('labelXY: at 270° points to the left of center', () => {
  const { x, y } = labelXY(200, 200, 100, 270)
  assert.ok(Math.abs(x - 100) < 1e-9)
  assert.ok(Math.abs(y - 200) < 1e-9)
})

test('fillRadius: readiness 10 → maxOuterR', () => {
  assert.equal(fillRadius(10, 55, 150), 150)
})

test('fillRadius: readiness 0 → innerR only', () => {
  assert.equal(fillRadius(0, 55, 150), 55)
})

test('fillRadius: readiness 5 → halfway', () => {
  assert.equal(fillRadius(5, 55, 150), 102.5)
})

test('fillRadius: clamps readiness above 10 and below 0', () => {
  assert.equal(fillRadius(99, 55, 150), 150)
  assert.equal(fillRadius(-5, 55, 150), 55)
})

test('arcPath: returns a string starting with M and ending with Z', () => {
  const p = arcPath(200, 200, 55, 155, 2, 58)
  assert.equal(typeof p, 'string')
  assert.ok(p.startsWith('M'))
  assert.ok(p.endsWith('Z'))
})

test('arcPath: sets large-arc flag for sweeps over 180°', () => {
  const big = arcPath(200, 200, 55, 155, 0, 200)
  // outer arc command uses the large-arc flag = 1 for >180°
  assert.ok(big.includes(`A155,155,0,1,1,`))
  const small = arcPath(200, 200, 55, 155, 0, 56)
  assert.ok(small.includes(`A155,155,0,0,1,`))
})

test('arcPath: large-arc flag is strict (180° → 0, 181° → 1)', () => {
  // exactly 180° must NOT set the large-arc flag (condition is > 180, not >=)
  const exactly180 = arcPath(200, 200, 55, 155, 0, 180)
  assert.ok(exactly180.includes(`A155,155,0,0,1,`))
  const justOver = arcPath(200, 200, 55, 155, 0, 181)
  assert.ok(justOver.includes(`A155,155,0,1,1,`))
})

const GEOM = { cx: 200, cy: 200, innerR: 55, maxOuterR: 155, labelR: 170 }
const DEFS = [
  { id: 'a', title: 'A', href: '/a', color: '#111', readiness: 9 },
  { id: 'b', title: 'B', href: '/b', color: '#222', readiness: 8 },
  { id: 'c', title: 'C', href: '/c', color: '#333', readiness: 5 },
  { id: 'd', title: 'D', href: '/d', color: '#444', readiness: 4 },
  { id: 'e', title: 'E', href: '/e', color: '#555', readiness: 4 },
  { id: 'f', title: 'F', href: null, color: '#666', readiness: 4, soon: true },
]

test('buildSegments: returns one render record per def, preserving fields', () => {
  const segs = buildSegments(DEFS, GEOM)
  assert.equal(segs.length, DEFS.length)
  assert.equal(segs[0].id, 'a')
  assert.equal(segs[0].title, 'A')
  assert.equal(segs[0].readiness, 9)
  assert.equal(segs[5].soon, true)
})

test('buildSegments: every segment carries non-empty bgPath, fillPath and a label', () => {
  for (const seg of buildSegments(DEFS, GEOM)) {
    assert.ok(seg.bgPath.startsWith('M') && seg.bgPath.endsWith('Z'))
    assert.ok(seg.fillPath.startsWith('M') && seg.fillPath.endsWith('Z'))
    assert.equal(typeof seg.label.x, 'number')
    assert.equal(typeof seg.label.y, 'number')
  }
})

test('buildSegments: fill outer radius matches fillRadius for each readiness', () => {
  const segs = buildSegments(DEFS, GEOM)
  // fillPath outer arc starts with "A<R>,<R>,..." — assert the encoded radius
  const r = fillRadius(9, GEOM.innerR, GEOM.maxOuterR)
  assert.ok(segs[0].fillPath.includes(`A${r},${r},0,`))
})

test('buildSegments: text-anchor follows the hemisphere (right→start, left→end)', () => {
  const segs = buildSegments(DEFS, GEOM)
  // mid angles: 30,90,150 are on the right half → start; 210,270,330 left → end
  assert.deepEqual(
    segs.map((s) => s.anchor),
    ['start', 'start', 'start', 'end', 'end', 'end'],
  )
})

test('buildSegments: only the soon segment lacks an href', () => {
  const segs = buildSegments(DEFS, GEOM)
  for (const seg of segs) {
    if (seg.soon) assert.equal(seg.href, null)
    else assert.ok(seg.href && seg.href.startsWith('/'))
  }
})

test('buildSegments: passes through extra flags (external) untouched', () => {
  const defs = [{ id: 'ar', title: 'AR', href: '/ar/', color: '#fff', readiness: 5, external: true }]
  const geom = { cx: 200, cy: 200, innerR: 55, maxOuterR: 155, labelR: 170 }
  const [seg] = buildSegments(defs, geom)
  assert.equal(seg.external, true)
  assert.equal(seg.href, '/ar/')
})

test('buildSegments: 6-sphere layout uses the original 60° span (i*60+2 … i*60+58)', () => {
  // n = 6 → span = 60; each bgPath must equal arcPath rebuilt at the 56°/4° angles.
  const segs = buildSegments(DEFS, GEOM)
  segs.forEach((seg, i) => {
    assert.equal(
      seg.bgPath,
      arcPath(GEOM.cx, GEOM.cy, GEOM.innerR, GEOM.maxOuterR, i * 60 + 2, i * 60 + 58),
    )
  })
})

test('buildSegments: generalizes to 7 spheres (span = 360/7, last ends at 358°)', () => {
  const defs7 = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i}`, title: `S${i}`, href: `/s${i}`, color: '#000', readiness: 5,
  }))
  const segs = buildSegments(defs7, GEOM)
  assert.equal(segs.length, 7)
  const span = 360 / 7
  segs.forEach((seg, i) => {
    const start = i * span + 2
    const end = (i + 1) * span - 2
    assert.equal(
      seg.bgPath,
      arcPath(GEOM.cx, GEOM.cy, GEOM.innerR, GEOM.maxOuterR, start, end),
    )
    const mid = i * span + span / 2
    const expected = labelXY(GEOM.cx, GEOM.cy, GEOM.labelR, mid)
    assert.ok(Math.abs(seg.label.x - expected.x) < 1e-9)
    assert.ok(Math.abs(seg.label.y - expected.y) < 1e-9)
  })
  // the 7th sphere's trailing edge closes the ring at 358° (360 − 2° gap)
  assert.ok(Math.abs((7 * span - 2) - 358) < 1e-9)
})

test('buildSegments: generalizes to 8 spheres (span = 45°, last ends at 358°)', () => {
  const defs8 = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`, title: `S${i}`, href: `/s${i}`, color: '#000', readiness: 5,
  }))
  const segs = buildSegments(defs8, GEOM)
  assert.equal(segs.length, 8)
  const span = 45 // 360 / 8
  segs.forEach((seg, i) => {
    const start = i * span + 2
    const end = (i + 1) * span - 2
    assert.equal(
      seg.bgPath,
      arcPath(GEOM.cx, GEOM.cy, GEOM.innerR, GEOM.maxOuterR, start, end),
    )
    const mid = i * span + span / 2
    const expected = labelXY(GEOM.cx, GEOM.cy, GEOM.labelR, mid)
    assert.ok(Math.abs(seg.label.x - expected.x) < 1e-9)
    assert.ok(Math.abs(seg.label.y - expected.y) < 1e-9)
  })
  // the 8th sphere's trailing edge closes the ring at 358° (360 − 2° gap)
  assert.ok(Math.abs((8 * span - 2) - 358) < 1e-9)
  // mid angles: 22.5,67.5,112.5,157.5 → right half (start); 202.5,247.5,292.5,337.5 → left (end)
  assert.deepEqual(
    segs.map((s) => s.anchor),
    ['start', 'start', 'start', 'start', 'end', 'end', 'end', 'end'],
  )
})

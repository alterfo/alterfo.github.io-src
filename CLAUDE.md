# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with a fully client-side IDEF0 diagram editor at `/idef0`.

## Key paths

- `.vitepress/theme/components/IDEF0Editor.vue` — root Vue component wrapped in `<ClientOnly>`, SVG-based editor
- `.vitepress/theme/components/IDEF0Editor/` — editor modules (see below)
- `idef0.md` — page that mounts the editor

## IDEF0 Editor modules

| File | Purpose |
|------|---------|
| `model.js` | Reactive project/diagram/box/arrow state via Vue 3 `ref`/`reactive`; CRUD functions |
| `renderer.js` | Pure functions → SVG attribute objects for boxes, arrows (Manhattan routing), boundary arrows, labels |
| `layout.js` | `autoLayout` (FIPS 183 diagonal placement), `fitToView` for zoom/pan |
| `icom.js` | ICOM type constants, `SIDE_FOR_TYPE`, `icomCode()`, `validateDiagram()` (FIPS 183 rules) |
| `history.js` | Snapshot-based undo/redo (50-step limit); resets on diagram navigation |
| `hierarchy.js` | `decomposeBox`, node-id scheme (A0→A1→A11…), breadcrumb, `navigateTo`, `navigateUp` |
| `db.js` | IndexedDB persistence (`loadProject` / `saveProject`, debounce 300 ms) + cross-tab sync via localStorage |
| `exporter.js` | `exportToSVG`, `exportToPNG` (2×), `exportToJSON`, `importFromJSON` |

## FIPS 183 ICOM arrow rules

| Type | Edge | Marker |
|------|------|--------|
| INPUT | left (enters block) | I |
| OUTPUT | right (exits block) | O |
| CONTROL | top (enters block) | C |
| MECHANISM | bottom (enters block) | M |
| CALL | bottom (exits block) | R |

## Development

- No automated tests — verification is manual via browser DevTools
- Dev server: `yarn dev` (VitePress)
- Build: `yarn build`

## Key patterns

- SVG viewport: fixed `viewBox="0 0 1200 800"`, zoom via CSS `scale(zoom)`, pan via `translate(panX, panY)`
- Blocks: `<rect>` white fill + 1px stroke, label centered, number in bottom-right; red stroke on validation error; `[+]` marker if decomposed
- Arrows: Manhattan L-shaped routing (min 2 segments, 90° corners); internal = solid, boundary = `stroke-dasharray="5,5"`; arrowhead = filled 6px triangle
- Boundary arrows attach to diagram edges; ICOM code (I1/C1/O1/M1/R1) shown at edge attachment point
- Double-click block → inline `<foreignObject><input>` label editor; Enter/blur saves, Escape cancels
- Ctrl+Z / Ctrl+Y → undo/redo; Hover block → ICOM handles appear for drawing arrows
- Decompose: toolbar "↳ Войти" button navigates into child diagram; breadcrumb for navigation
- Plan files live in `docs/plans/` and are git-ignored (local only)

## Completed features (as of 2026-06-07)

- Full rewrite: canvas → SVG + Vue 3, strictly following FIPS 183
- Reactive model (model.js): Project / Diagram / Box / Arrow / BoundaryArrow data structures
- SVG rendering: boxes, internal arrows (Manhattan routing), boundary arrows with ICOM codes
- Auto-layout: FIPS 183 diagonal placement (box 1 top-left, box N bottom-right)
- Block drag-and-drop; arrow routing updates on drag; click-to-select; Delete to remove
- Arrow drawing: hover handles on block sides → drag to connect → ICOM type popup
- Inline label editing: double-click block or arrow label
- Diagram hierarchy: decompose box → child diagram with boundary arrows; breadcrumb navigation
- Undo/redo (Ctrl+Z / Ctrl+Y), 50-step snapshots, resets on diagram switch
- IndexedDB persistence (auto-save debounced 300 ms) + cross-tab sync via localStorage
- Export: SVG, PNG (2×), JSON; Import: JSON round-trip
- FIPS 183 validation panel: errors shown in sidebar, red border on offending blocks

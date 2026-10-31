# IDEF0 Editor — modules & rules

Root component: `.vitepress/theme/components/IDEF0Editor.vue` (`<ClientOnly>`, SVG-based).
Page: `idef0.md`.

## Modules

| File | Purpose |
|------|---------|
| `model.js` | Reactive project/diagram/box/arrow state via Vue 3 `ref`/`reactive`; CRUD; `resetProject()` also resets `_idCounter` — required for test isolation |
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

## SVG rendering patterns

- Viewport: fixed `viewBox="0 0 1200 800"`, zoom via CSS `scale(zoom)`, pan via `translate(panX, panY)`
- Blocks: `<rect>` white fill + 1px stroke, label centered, number in bottom-right; red stroke on validation error; `[+]` marker if decomposed
- Arrows: Manhattan L-shaped routing (min 2 segments, 90° corners); internal = solid, boundary = `stroke-dasharray="5,5"`; arrowhead = filled 6px triangle
- Boundary arrows attach to diagram edges; ICOM code (I1/C1/O1/M1/R1) shown at edge attachment point
- Double-click block → inline `<foreignObject><input>` label editor; Enter/blur saves, Escape cancels
- Ctrl+Z / Ctrl+Y → undo/redo; Hover block → ICOM handles appear for drawing arrows
- Decompose: toolbar "↳ Войти" button navigates into child diagram; breadcrumb for navigation

## Hierarchy integrity — non-obvious invariants

Four related bugs were fixed (2026-06-12). Keep these invariants when editing:

1. **Child id derivation**: `decompose()` uses the first free `A<n>` suffix — NOT the box index (indices shift after sibling deletion → id collision). Decomposing an already-decomposed box just navigates into its existing child.
2. **`_removeSubtree`** recurses via BOTH `childMap` AND `box.childDiagramId` — `childMap` can be stale on imported projects.
3. **`_normalizeHierarchy()`** (GC): boxes' `childDiagramId` is the source of truth — drops diagrams unreachable from root, nulls dangling pointers, rebuilds `childMap`. Runs after `deleteSelectedBox`, `onRemoveDecomposition`, and on every load/import.
4. **Undo**: `applySnapshot` guards against root diagrams without `boundaryArrows`. `navigateTo` calls `resetHistory()` on diagram change — without this, Ctrl+Z after navigation spliced another diagram's snapshot into the current one.

## Tests

`node --test .vitepress/theme/components/IDEF0Editor/model.test.mjs`

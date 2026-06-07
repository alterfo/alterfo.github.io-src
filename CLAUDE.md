# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with a fully client-side IDEF0 diagram editor at `/idef0`.

## Key paths

- `.vitepress/theme/components/IDEF0Editor.vue` — main Vue component (~1100 lines), canvas-based editor
- `.vitepress/theme/components/IDEF0Editor/` — editor modules (see below)
- `idef0.md` — page that mounts the editor

## IDEF0 Editor modules

| File | Purpose |
|------|---------|
| `constants.js` | COLORS, SIZES, DEFAULT_DIAGRAM |
| `db.js` | IndexedDB persistence (loadProject / saveProject) + cross-tab sync via localStorage |
| `exporter.js` | exportToPNG, exportToSVG, exportToJSON, importFromJSON |
| `hierarchy.js` | Nested diagram ID scheme (A0→A1→A11…), breadcrumb, cycle detection |
| `manhattan.js` | Manhattan-routing path solver for arrows |
| `validation.js` | FIPS 183 ICOM edge validation (validateDiagram, hasErrors) |
| `router.js` | In-app navigation between diagrams |
| `minimap.js` | Minimap overlay (currently unused — do not import) |
| `renderer.js` | Alternative renderer (currently unused — do not import) |

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

## Completed features (as of 2026-06-07)

- Critical UX bug fixes: inline editor positioning, arrow drag, boundary arrow offset on block drag
- FIPS 183 compliance: correct ICOM markers, CALL/MECHANISM direction, validation
- Undo/redo (Ctrl+Z / Ctrl+Y), 50-step history
- Arrow type change via T key popup menu
- Block resize via corner handles
- JSON import/export

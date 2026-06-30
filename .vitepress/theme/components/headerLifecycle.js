// Pure decision helpers extracted from Layout.vue's header particle lifecycle
// (the historically buggy WebGPU/2D-canvas init/reseed/teardown dance — see
// the inline comments in Layout.vue for the bugs each guard fixed). Kept in a
// separate module (not WebGPUParticles.js) so Layout.vue can import these
// statically without pulling the GPU class back into the eager entry chunk.

// Single-flight: should initWebGPU() kick off a new init, or does an
// in-flight (or already-resolved) promise already cover it? Calling init
// twice before the first resolves created a second WebGPUParticles instance
// fighting the first for the same canvas context.
export function shouldStartInit(existingInit) {
  return !existingInit
}

// Which branch initHeader() should take, given current state. Returns one
// of: 'init' (kick off WebGPU init), 'field-2d' (use/ensure the 2D
// fallback), 'reseed-render' (resize+reseed+render the live WebGPU
// instance on SPA navigation), 'noop' (WebGPU flagged active but the
// instance isn't constructed yet — init() is still in flight).
//
// reducedMotion routes away from 'init' even when a GPU is available:
// WebGPUParticles has no reduced-motion gate of its own (unlike the 2D
// field), so the only way to honor prefers-reduced-motion on a WebGPU-
// capable browser is to never pick the WebGPU branch in the first place.
export function headerAction({ useWebGPU, gpuAvailable, hasParticles, reducedMotion }) {
  if (!useWebGPU && gpuAvailable && !reducedMotion) return 'init'
  if (!useWebGPU) return 'field-2d'
  if (hasParticles) return 'reseed-render'
  return 'noop'
}

// Canvas-recreation guard: does the new canvas element require tearing down
// the particles/field bound to the previous one? True only when a previous
// canvas was bound AND the new element differs from it — comparing against
// `prev` instead of `boundEl` missed this on the second mount, because
// DefaultLayout unmounts on navigation and the ref always starts `null`.
export function shouldResetForNewCanvas(boundEl, newEl) {
  return !!(boundEl && newEl !== boundEl)
}

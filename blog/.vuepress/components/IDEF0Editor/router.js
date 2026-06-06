// Query-based routing for diagram navigation inside VuePress
// Uses ?diagram=A1 to track current diagram without conflicting with VuePress router

export function getDiagramIdFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('diagram');
}

export function setDiagramIdInQuery(diagramId) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (diagramId && diagramId !== 'A0') {
    url.searchParams.set('diagram', diagramId);
  } else {
    url.searchParams.delete('diagram');
  }
  window.history.replaceState({}, '', url);
}

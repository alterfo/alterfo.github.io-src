/**
 * IndexedDB persistence for IDEF0 projects.
 *
 * Stored data shape (projectData):
 *   { diagrams: Record<string, Diagram> }
 *
 * Diagram:
 *   { id: string, name: string, parentDiagramId: string|null,
 *     blocks: Block[], arrows: Arrow[],
 *     view: { x: number, y: number, scale: number } }
 *
 * Block:
 *   { id: string, name: string, x: number, y: number, w: number, h: number,
 *     diagramId?: string }   // diagramId — linked child diagram (decomposition)
 *
 * Arrow:
 *   { id: string, name: string, type: 'input'|'output'|'control'|'mechanism'|'call',
 *     from: Endpoint, to: Endpoint,
 *     segments?: {x,y}[],       // interior waypoints for Manhattan routing
 *     labelOffset?: {x,y} }     // manual label position offset
 *
 * Endpoint:
 *   { blockId: string|null,     // null = boundary / floating
 *     edge: 'left'|'right'|'top'|'bottom'|null,
 *     offset: number,           // perpendicular offset along the edge
 *     x?: number, y?: number }  // world coords for floating endpoints
 */

const DB_NAME = 'IDEF0EditorDB';
const DB_VERSION = 2;
const STORE_NAME = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

export async function loadProject(projectId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(projectId);
    req.onsuccess = () => {
      const result = req.result;
      if (result && result.data) {
        resolve(result.data);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(projectId, data) {
  const db = await openDB();
  const payload = {
    id: projectId,
    data,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(payload);
    req.onsuccess = () => {
      // Broadcast change to other tabs
      try {
        localStorage.setItem(
          `idef0-sync-${projectId}`,
          JSON.stringify({ updatedAt: payload.updatedAt })
        );
      } catch (e) {
        // ignore
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Listen for changes from other tabs.
 * @param {string} projectId
 * @param {Function} callback - called when external change detected
 */
export function onExternalChange(projectId, callback) {
  const handler = (e) => {
    if (e.key === `idef0-sync-${projectId}` && e.newValue) {
      try {
        const info = JSON.parse(e.newValue);
        callback(info);
      } catch (err) {
        // ignore
      }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

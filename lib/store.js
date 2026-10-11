const DB_NAME = "ceritaanimasi";
const STORE = "kv";
const KEY = "project";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export function saveProject(project) {
  return run("readwrite", (s) => s.put(project, KEY));
}

export function loadProject() {
  return run("readonly", (s) => s.get(KEY));
}

export function clearProject() {
  return run("readwrite", (s) => s.delete(KEY));
          }
    

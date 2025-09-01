// Minimal IndexedDB wrapper for analysis history

export type HistoryEntry = {
  id: string // ISO timestamp
  meta: any
  files: { name: string; type: string; dataUrl: string }[]
  result: any
}

const DB_NAME = 'sta'
const STORE = 'history'
const VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

export async function addHistory(entry: HistoryEntry) {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).put(entry)
  })
  db.close()
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await openDB()
  const items: HistoryEntry[] = []
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const req = tx.objectStore(STORE).openCursor(null, 'prev')
    req.onsuccess = () => {
      const cur = req.result
      if (cur) {
        items.push(cur.value as HistoryEntry)
        cur.continue()
      }
    }
  })
  db.close()
  return items
}

export async function getHistory(id: string): Promise<HistoryEntry | undefined> {
  const db = await openDB()
  const val = await new Promise<HistoryEntry | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.oncomplete = () => {}
    tx.onerror = () => reject(tx.error)
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as any)
  })
  db.close()
  return val
}

export async function deleteHistory(id: string) {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).delete(id)
  })
  db.close()
}

export async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(f)
  })
}

export function dataUrlToFile(url: string, name: string, type: string): File {
  const arr = url.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || type
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new File([u8arr], name, { type: mime })
}


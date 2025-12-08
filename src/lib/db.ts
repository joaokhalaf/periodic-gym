import type { SessionData } from '@/types/ai-coach'

const DB_NAME = 'ai-coach-sessions'
const DB_VERSION = 1
const STORE_NAME = 'sessions'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        objectStore.createIndex('date', 'date', { unique: false })
        objectStore.createIndex('exercise', 'exercise', { unique: false })
      }
    }
  })
}

export async function saveSession(session: SessionData): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(session)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getSession(id: string): Promise<SessionData | undefined> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getSessions(limit = 10): Promise<SessionData[]> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('date')
    const request = index.openCursor(null, 'prev') // Order by date descending

    const sessions: SessionData[] = []
    let count = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor && count < limit) {
        sessions.push(cursor.value)
        count++
        cursor.continue()
      } else {
        resolve(sessions)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function clearAllSessions(): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getSessionsByExercise(exercise: string, limit = 5): Promise<SessionData[]> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('exercise')
    const request = index.openCursor(IDBKeyRange.only(exercise), 'prev')

    const sessions: SessionData[] = []
    let count = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor && count < limit) {
        sessions.push(cursor.value)
        count++
        cursor.continue()
      } else {
        resolve(sessions)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

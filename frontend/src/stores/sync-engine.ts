/**
 * SyncEngine — IndexedDB-backed persistence engine with in-memory fallback.
 *
 * Provides:
 *  1. A key-value store for Zustand persist (state object store)
 *  2. A blob store for image binary data (blobs object store)
 *  3. A Zustand persist-compatible storage adapter
 *  4. Debounced writes to avoid excessive IndexedDB transactions
 *
 * Falls back to an in-memory Map when IndexedDB is unavailable (jsdom,
 * private browsing modes, etc.).
 */

// ── In-memory fallback (used when IndexedDB is not available) ────────────────

class MemoryStore {
  private state = new Map<string, string>()
  private blobs = new Map<string, Blob>()

  getState(key: string): string | null {
    return this.state.get(key) ?? null
  }
  setState(key: string, value: string): void {
    this.state.set(key, value)
  }
  removeState(key: string): void {
    this.state.delete(key)
  }

  getBlob(key: string): Blob | null {
    return this.blobs.get(key) ?? null
  }
  putBlob(key: string, blob: Blob): void {
    this.blobs.set(key, blob)
  }
  deleteBlob(key: string): void {
    this.blobs.delete(key)
  }
  getAllBlobKeys(): string[] {
    return Array.from(this.blobs.keys())
  }
}

// ── SyncEngine ───────────────────────────────────────────────────────────────

type WriteRequest = { type: 'state'; key: string; value: string } | { type: 'blob'; key: string; blob: Blob }

export class SyncEngine {
  private static instance: SyncEngine | null = null

  private db: IDBDatabase | null = null
  private dbReady: Promise<void>
  private memory: MemoryStore | null = null
  private useMemory: boolean

  /** Queue of pending writes flushed on a debounce timer */
  private writeQueue: WriteRequest[] = []
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly DEBOUNCE_MS = 100

  private constructor() {
    this.useMemory = typeof indexedDB === 'undefined' || !indexedDB
    if (this.useMemory) {
      this.memory = new MemoryStore()
      this.dbReady = Promise.resolve()
    } else {
      this.dbReady = this.openDB()
    }
  }

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine()
    }
    return SyncEngine.instance
  }

  // ── Database lifecycle ───────────────────────────────────────────────────

  private openDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('image-prepare-sync', 1)

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('state')) {
            db.createObjectStore('state')
          }
          if (!db.objectStoreNames.contains('blobs')) {
            db.createObjectStore('blobs')
          }
        }

        request.onsuccess = (event: Event) => {
          this.db = (event.target as IDBOpenDBRequest).result
          // Handle connection close (e.g., browser storage clear)
          this.db.onclose = () => {
            this.db = null
            this.dbReady = this.openDB()
          }
          this.db.onversionchange = () => {
            this.db?.close()
            this.db = null
            this.dbReady = this.openDB()
          }
          resolve()
        }

        request.onerror = (event: Event) => {
          const error = (event.target as IDBOpenDBRequest).error
          // If IndexedDB fails (private browsing, quota, etc.), fall back to memory
          console.warn('[SyncEngine] IndexedDB open failed, falling back to in-memory:', error)
          this.useMemory = true
          if (!this.memory) this.memory = new MemoryStore()
          resolve()
        }
      } catch (err) {
        console.warn('[SyncEngine] IndexedDB not available, falling back to in-memory:', err)
        this.useMemory = true
        if (!this.memory) this.memory = new MemoryStore()
        resolve()
      }
    })
  }

  /** Wait for the engine to be fully initialized. */
  async ready(): Promise<void> {
    await this.dbReady
  }

  // ── State store (for Zustand persist) ─────────────────────────────────────

  async getState(key: string): Promise<string | null> {
    await this.dbReady
    if (this.useMemory) return this.memory!.getState(key)
    return this.transaction('state', 'readonly', (store) => store.get(key))
  }

  async setState(key: string, value: string): Promise<void> {
    await this.dbReady
    if (this.useMemory) {
      this.memory!.setState(key, value)
      return
    }
    return this.transaction('state', 'readwrite', (store) => store.put(value, key))
  }

  async removeState(key: string): Promise<void> {
    await this.dbReady
    if (this.useMemory) {
      this.memory!.removeState(key)
      return
    }
    return this.transaction('state', 'readwrite', (store) => store.delete(key))
  }

  // ── Blob store (for image binary data) ───────────────────────────────────

  async putBlob(key: string, blob: Blob): Promise<void> {
    await this.dbReady
    if (this.useMemory) {
      this.memory!.putBlob(key, blob)
      return
    }
    return this.transaction('blobs', 'readwrite', (store) => store.put(blob, key))
  }

  async getBlob(key: string): Promise<Blob | null> {
    await this.dbReady
    if (this.useMemory) return this.memory!.getBlob(key)
    return this.transaction('blobs', 'readonly', (store) => store.get(key))
  }

  async deleteBlob(key: string): Promise<void> {
    await this.dbReady
    if (this.useMemory) {
      this.memory!.deleteBlob(key)
      return
    }
    return this.transaction('blobs', 'readwrite', (store) => store.delete(key))
  }

  async getAllBlobKeys(): Promise<string[]> {
    await this.dbReady
    if (this.useMemory) return this.memory!.getAllBlobKeys()
    return this.transaction('blobs', 'readonly', (store) => store.getAllKeys())
  }

  // ── Debounced batch writes ──────────────────────────────────────────────

  /**
   * Enqueue a state write. Multiple writes within DEBOUNCE_MS are batched
   * into a single IndexedDB transaction for efficiency.
   */
  enqueueStateWrite(key: string, value: string): void {
    if (this.useMemory) {
      this.memory!.setState(key, value)
      return
    }

    // Replace any existing write for the same key
    this.writeQueue = this.writeQueue.filter(
      (w) => !(w.type === 'state' && w.key === key),
    )
    this.writeQueue.push({ type: 'state', key, value })
    this.scheduleFlush()
  }

  /**
   * Enqueue a blob write.
   */
  enqueueBlobWrite(key: string, blob: Blob): void {
    if (this.useMemory) {
      this.memory!.putBlob(key, blob)
      return
    }

    this.writeQueue = this.writeQueue.filter(
      (w) => !(w.type === 'blob' && w.key === key),
    )
    this.writeQueue.push({ type: 'blob', key, blob })
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flushWrites(), this.DEBOUNCE_MS)
  }

  private async flushWrites(): Promise<void> {
    const queue = [...this.writeQueue]
    this.writeQueue = []

    if (queue.length === 0) return
    if (this.useMemory) return

    try {
      await this.dbReady
      const tx = this.db!.transaction(['state', 'blobs'], 'readwrite')

      for (const item of queue) {
        if (item.type === 'state') {
          tx.objectStore('state').put(item.value, item.key)
        } else {
          tx.objectStore('blobs').put(item.blob, item.key)
        }
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = (event) => {
          console.error('[SyncEngine] Batch write failed:', (event.target as IDBRequest).error)
          reject((event.target as IDBRequest).error)
        }
      })
    } catch (err) {
      console.error('[SyncEngine] Flush failed:', err)
    }
  }

  // ── Storage adapter for Zustand persist ──────────────────────────────────

  /**
   * Returns a Zustand persist-compatible storage adapter.
   * This adapter is used with `createJSONStorage()` in the persist middleware.
   */
  createZustandStorage(): {
    getItem: (name: string) => Promise<string | null>
    setItem: (name: string, value: string) => Promise<void>
    removeItem: (name: string) => Promise<void>
  } {
    return {
      getItem: (name: string) => this.getState(name),
      setItem: (name: string, value: string) => {
        // Use debounced write for better performance
        this.enqueueStateWrite(name, value)
        return Promise.resolve()
      },
      removeItem: (name: string) => this.removeState(name),
    }
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  private async transaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const request = operation(store)

        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
      } catch (err) {
        reject(err)
      }
    })
  }

  /** Clear all persisted data. Useful for testing or user-initiated reset. */
  async clearAll(): Promise<void> {
    await this.dbReady
    if (this.useMemory) {
      this.memory = new MemoryStore()
      return
    }

    const tx = this.db!.transaction(['state', 'blobs'], 'readwrite')
    tx.objectStore('state').clear()
    tx.objectStore('blobs').clear()
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/** Singleton instance */
export const syncEngine = SyncEngine.getInstance()

/**
 * Images store — manages loaded image files with blob URLs.
 *
 * Features:
 *  - Original images stored as blobs in IndexedDB (via SyncEngine)
 *  - Processed images stored on the backend (filesystem)
 *  - Metadata for both persists across sessions via Zustand persist
 *  - On app load, recreates File objects and blob URLs for originals
 *  - Processed images load from the backend download URL
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { usePipelineStore } from './pipeline'
import { syncEngine } from './sync-engine'

const API_BASE = 'http://localhost:55558'

// ── Types ────────────────────────────────────────────────────────────────────

export type ImageEntry = {
  id: string
  file: File
  src: string
  name: string
  type: string
  size: number
  /** Key used to retrieve blob from IndexedDB */
  blobKey: string
}

/**
 * Processed images are stored on the backend.  The entry carries
 * a ``downloadUrl`` that can be used both for ``<img>`` display
 * and for programmatic download.
 */
export type ProcessedImageEntry = {
  id: string
  originalId: string
  originalName: string
  name: string
  type: string
  size: number
  /** Full URL to download the processed image from the backend */
  downloadUrl: string
  processedAt: number
}

/**
 * Persisted subset of ImageEntry — excludes the non-serializable `file`
 * and ephemeral `src` fields. These are reconstructed on hydration.
 */
type PersistedImageEntry = {
  id: string
  name: string
  type: string
  size: number
  blobKey: string
}

/**
 * Persisted subset of ProcessedImageEntry — all fields are serializable,
 * so no reconstruction is needed on hydration.
 */
type PersistedProcessedImageEntry = {
  id: string
  originalId: string
  originalName: string
  name: string
  type: string
  size: number
  downloadUrl: string
  processedAt: number
}

type ProcessingState = 'idle' | 'processing' | 'success' | 'error'

type ImageState = {
  images: ImageEntry[]
  processedImages: ProcessedImageEntry[]
  /** ID of the image currently being processed, or null */
  processingId: string | null
  processingState: ProcessingState
  processingError: string | null

  addImages: (files: File[]) => Promise<void>
  removeImage: (id: string) => Promise<void>
  removeProcessedImage: (id: string) => Promise<void>
  clearOriginalImages: () => Promise<void>
  clearProcessedImages: () => Promise<void>
  processImage: (id: string) => void
  processAllImages: () => Promise<void>
  clearImages: () => Promise<void>
  /** Adds a processed image entry from the queue system (called by QueueStore) */
  addProcessedImageFromQueue: (entry: ProcessedImageEntry) => void
  /** Clears processing status back to idle */
  clearProcessingStatus: () => void
  /**
   * Recreates File objects and blob URLs from persisted blobs.
   * Called once after store hydration on app startup.
   */
  hydrateBlobs: () => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function blobKeyForId(id: string): string {
  return `image-blob-${id}`
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useImagesStore = create<ImageState>()(
  persist(
    (set, get) => ({
      images: [],
      processedImages: [],
      processingId: null,
      processingState: 'idle',
      processingError: null,

      addImages: async (files: File[]) => {
        const newEntries: ImageEntry[] = []

        try {
          for (const file of files) {
            const id = crypto.randomUUID()
            const key = blobKeyForId(id)
            // Save blob to IndexedDB
            await syncEngine.putBlob(key, file)

            newEntries.push({
              id,
              file,
              src: URL.createObjectURL(file),
              name: file.name,
              type: file.type,
              size: file.size,
              blobKey: key,
            })
          }

          set((state) => ({
            images: [...state.images, ...newEntries],
          }))
        } catch (err) {
          // Clean up any blobs that were saved before the error
          for (const entry of newEntries) {
            URL.revokeObjectURL(entry.src)
            try {
              await syncEngine.deleteBlob(entry.blobKey)
            } catch {
              // Ignore cleanup errors
            }
          }
          console.error('[images] Failed to add images:', err)
        }
      },

      removeImage: async (id: string) => {
        const { images } = get()
        const entry = images.find((img) => img.id === id)
        if (entry) {
          URL.revokeObjectURL(entry.src)
          try {
            await syncEngine.deleteBlob(entry.blobKey)
          } catch (err) {
            console.error('[images] Failed to delete blob:', err)
          }
        }
        set((state) => ({
          images: state.images.filter((img) => img.id !== id),
        }))
      },

      removeProcessedImage: async (id: string) => {
        // Notify the backend to delete the file on disk
        try {
          const response = await fetch(`${API_BASE}/api/images/${id}`, {
            method: 'DELETE',
          })
          if (!response.ok && response.status !== 404) {
            console.warn(
              `[images] Backend delete returned ${response.status}`,
            )
          }
        } catch (err) {
          console.error('[images] Failed to delete processed image:', err)
        }

        set((state) => ({
          processedImages: state.processedImages.filter(
            (img) => img.id !== id,
          ),
        }))
      },

      clearOriginalImages: async () => {
        const { images } = get()
        for (const img of images) {
          URL.revokeObjectURL(img.src)
          try {
            await syncEngine.deleteBlob(img.blobKey)
          } catch {
            // Ignore cleanup errors
          }
        }
        set({
          images: [],
          processingId: null,
          processingState: 'idle',
          processingError: null,
        })
      },

      clearProcessedImages: async () => {
        const { processedImages } = get()

        // Fire all backend deletes in parallel
        await Promise.allSettled(
          processedImages.map((img) =>
            fetch(`${API_BASE}/api/images/${img.id}`, {
              method: 'DELETE',
            }),
          ),
        )

        set({ processedImages: [] })
      },

      processImage: async (id: string) => {
        const { images } = get()
        const entry = images.find((img) => img.id === id)
        if (!entry) return

        // ── Read pipeline from the pipeline store ────────────────────────
        const pipelineSteps = usePipelineStore.getState().steps

        if (pipelineSteps.length === 0) {
          set({
            processingState: 'error',
            processingError:
              'No pipeline steps configured. Add steps first.',
            processingId: id,
          })
          return
        }

        // Require at least one output formatter step
        const hasOutputFormatter = pipelineSteps.some(
          (ps) => ps.step.variant === 'output_formatter',
        )
        if (!hasOutputFormatter) {
          set({
            processingState: 'error',
            processingError:
              'Pipeline needs an output step. Add one before processing.',
            processingId: id,
          })
          return
        }

        // ── Build the pipeline payload ───────────────────────────────────
        const pipelinePayload = pipelineSteps.map((ps) => ({
          step_id: ps.step.id,
          config: ps.config,
        }))

        set({
          processingId: id,
          processingState: 'processing',
          processingError: null,
        })

        try {
          const formData = new FormData()
          formData.append('image', entry.file)
          formData.append('pipeline', JSON.stringify(pipelinePayload))

          const response = await fetch(`${API_BASE}/api/images/process`, {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorBody = await response.text()
            let detail = `Server error: ${response.status}`
            try {
              const parsed = JSON.parse(errorBody)
              if (parsed.detail) detail = parsed.detail
            } catch {
              // Use raw text if not JSON
              if (errorBody) detail = errorBody
            }
            throw new Error(detail)
          }

          // ── Parse the result metadata ──────────────────────────────────
          const data: {
            resultId: string
            name: string
            type: string
            size: number
            downloadUrl: string
          } = await response.json()

          const resultId = data.resultId
          const downloadUrl = `${API_BASE}${data.downloadUrl}`

          const processedEntry: ProcessedImageEntry = {
            id: resultId,
            originalId: entry.id,
            originalName: entry.name,
            name: data.name,
            type: data.type,
            size: data.size,
            downloadUrl,
            processedAt: Date.now(),
          }

          set((state) => ({
            processedImages: [...state.processedImages, processedEntry],
          }))

          set({
            processingState: 'success',
            processingError: null,
          })
        } catch (err) {
          set({
            processingState: 'error',
            processingError:
              err instanceof Error
                ? err.message
                : 'Unknown processing error',
          })
        }
      },

      processAllImages: async () => {
        const { images } = get()
        if (images.length === 0) return

        const pipelineSteps = usePipelineStore.getState().steps
        if (pipelineSteps.length === 0) {
          set({
            processingState: 'error',
            processingError:
              'No pipeline steps configured. Add steps first.',
            processingId: null,
          })
          return
        }

        const hasOutputFormatter = pipelineSteps.some(
          (ps) => ps.step.variant === 'output_formatter',
        )
        if (!hasOutputFormatter) {
          set({
            processingState: 'error',
            processingError:
              'Pipeline needs an output step. Add one before processing.',
            processingId: null,
          })
          return
        }

        const pipelinePayload = pipelineSteps.map((ps) => ({
          step_id: ps.step.id,
          config: ps.config,
        }))

        set({
          processingState: 'processing',
          processingId: null,
          processingError: null,
        })

        const errors: string[] = []
        const newProcessed: ProcessedImageEntry[] = []

        for (const entry of images) {
          try {
            const formData = new FormData()
            formData.append('image', entry.file)
            formData.append('pipeline', JSON.stringify(pipelinePayload))

            const response = await fetch(`${API_BASE}/api/images/process`, {
              method: 'POST',
              body: formData,
            })

            if (!response.ok) {
              const errorBody = await response.text()
              let detail = `Server error: ${response.status}`
              try {
                const parsed = JSON.parse(errorBody)
                if (parsed.detail) detail = parsed.detail
              } catch {
                if (errorBody) detail = errorBody
              }
              throw new Error(`${entry.name}: ${detail}`)
            }

            const data: {
              resultId: string
              name: string
              type: string
              size: number
              downloadUrl: string
            } = await response.json()

            const downloadUrl = `${API_BASE}${data.downloadUrl}`

            newProcessed.push({
              id: data.resultId,
              originalId: entry.id,
              originalName: entry.name,
              name: data.name,
              type: data.type,
              size: data.size,
              downloadUrl,
              processedAt: Date.now(),
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            errors.push(`${entry.name}: ${msg}`)
          }
        }

        set((state) => ({
          processedImages: [...state.processedImages, ...newProcessed],
          processingState:
            errors.length === 0 ? 'success' : 'error',
          processingError:
            errors.length > 0
              ? `Processed ${newProcessed.length}/${images.length}. Errors: ${errors.join('; ')}`
              : null,
          processingId: null,
        }))
      },

      clearImages: async () => {
        const { images, processedImages } = get()

        // Revoke original-image blob URLs and delete from IndexedDB
        for (const img of images) {
          URL.revokeObjectURL(img.src)
          try {
            await syncEngine.deleteBlob(img.blobKey)
          } catch {
            // Ignore cleanup errors
          }
        }

        // Delete processed images from backend
        await Promise.allSettled(
          processedImages.map((img) =>
            fetch(`${API_BASE}/api/images/${img.id}`, {
              method: 'DELETE',
            }),
          ),
        )

        set({
          images: [],
          processedImages: [],
          processingId: null,
          processingState: 'idle',
          processingError: null,
        })
      },

      addProcessedImageFromQueue: (entry: ProcessedImageEntry) => {
        set((state) => ({
          processedImages: [...state.processedImages, entry],
        }))
      },

      clearProcessingStatus: () => {
        set({
          processingId: null,
          processingState: 'idle',
          processingError: null,
        })
      },

      hydrateBlobs: async () => {
        const { images, processedImages } = get()

        // Hydrate original images from IndexedDB blobs
        if (images.length > 0) {
          const hydrated: ImageEntry[] = []

          for (const img of images) {
            const blob = await syncEngine.getBlob(img.blobKey)
            if (blob) {
              const file = new File([blob], img.name, { type: img.type })
              const src = URL.createObjectURL(file)
              hydrated.push({
                id: img.id,
                file,
                src,
                name: img.name,
                type: img.type,
                size: img.size,
                blobKey: img.blobKey,
              })
            } else {
              console.warn(
                `[images] Blob not found for image ${img.id}, skipping`,
              )
            }
          }

          set({ images: hydrated })
        }

        // Processed images are served from the backend downloadUrl,
        // so no blob hydration is needed.  However, we filter out
        // any stale entries from previous schema versions that might
        // still be in persisted storage (e.g. entries that carried
        // a 'blobKey' instead of 'downloadUrl').
        const migratedProcessed = processedImages.filter(
          (img): img is ProcessedImageEntry => 'downloadUrl' in img,
        )
        if (migratedProcessed.length !== processedImages.length) {
          set({ processedImages: migratedProcessed })
        }

        // Also clean up orphaned blobs in the background
        cleanupOrphanedBlobs()
      },
    }),
    {
      name: 'images-store',
      storage: createJSONStorage(() => syncEngine.createZustandStorage()),
      // Persist only the metadata that can be serialized to JSON
      partialize: (state) => ({
        images: state.images.map(
          (img): PersistedImageEntry => ({
            id: img.id,
            name: img.name,
            type: img.type,
            size: img.size,
            blobKey: img.blobKey,
          }),
        ),
        processedImages: state.processedImages.map(
          (img): PersistedProcessedImageEntry => ({
            id: img.id,
            originalId: img.originalId,
            originalName: img.originalName,
            name: img.name,
            type: img.type,
            size: img.size,
            downloadUrl: img.downloadUrl,
            processedAt: img.processedAt,
          }),
        ),
      }),
      // After persist hydration, auto-trigger blob re-creation for originals
      onRehydrateStorage: () => {
        return (state) => {
          if (
            state?.images?.length > 0 ||
            state?.processedImages?.length > 0
          ) {
            // Use setTimeout to avoid blocking the persist lifecycle
            setTimeout(() => {
              useImagesStore.getState().hydrateBlobs()
            }, 0)
          }
        }
      },
    },
  ),
)

/**
 * Clean up blob entries in IndexedDB that don't have a corresponding
 * image in the store. This handles edge cases where blobs were saved
 * but the store state was lost.
 */
async function cleanupOrphanedBlobs(): Promise<void> {
  try {
    const { images } = useImagesStore.getState()
    const validKeys = new Set([
      ...images.map((img) => img.blobKey),
      // Processed images no longer store blobs in IndexedDB,
      // so we only clean up 'image-blob-' keys.
    ])
    const allBlobKeys = await syncEngine.getAllBlobKeys()

    for (const key of allBlobKeys) {
      if (
        key.startsWith('image-blob-') &&
        !validKeys.has(key as string)
      ) {
        await syncEngine.deleteBlob(key as string)
      }
    }
  } catch (err) {
    console.warn('[images] Orphan cleanup failed:', err)
  }
}

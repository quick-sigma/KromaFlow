/**
 * Images store — manages loaded image files with blob URLs.
 *
 * Features:
 *  - Auto-saves image binary data to IndexedDB (via SyncEngine)
 *  - Persists image metadata across sessions via Zustand persist
 *  - On app load, recreates File objects and blob URLs from stored blobs
 *  - Processing sends the image + current pipeline definition to the backend
 *  - Processed results are stored alongside originals in a separate gallery
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

export type ProcessedImageEntry = {
  id: string
  originalId: string
  originalName: string
  src: string
  name: string
  type: string
  size: number
  blobKey: string
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
 * Persisted subset of ProcessedImageEntry — excludes the ephemeral `src`.
 */
type PersistedProcessedImageEntry = {
  id: string
  originalId: string
  originalName: string
  name: string
  type: string
  size: number
  blobKey: string
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

function processedBlobKeyForId(id: string): string {
  return `processed-blob-${id}`
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
        const { processedImages } = get()
        const entry = processedImages.find((img) => img.id === id)
        if (entry) {
          URL.revokeObjectURL(entry.src)
          try {
            await syncEngine.deleteBlob(entry.blobKey)
          } catch (err) {
            console.error('[images] Failed to delete processed blob:', err)
          }
        }
        set((state) => ({
          processedImages: state.processedImages.filter((img) => img.id !== id),
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
        set({ images: [], processingId: null, processingState: 'idle', processingError: null })
      },

      clearProcessedImages: async () => {
        const { processedImages } = get()
        for (const img of processedImages) {
          URL.revokeObjectURL(img.src)
          try {
            await syncEngine.deleteBlob(img.blobKey)
          } catch {
            // Ignore cleanup errors
          }
        }
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
            processingError: 'No pipeline steps configured. Add steps first.',
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

          // ── Get the result blob ─────────────────────────────────────────
          const blob = await response.blob()

          // ── Store the processed result ──────────────────────────────────
          const resultId = crypto.randomUUID()
          const resultKey = processedBlobKeyForId(resultId)
          await syncEngine.putBlob(resultKey, blob)

          const resultSrc = URL.createObjectURL(blob)
          const baseName = entry.name.replace(/\.[^.]+$/, '')
          const ext = entry.name.includes('.')
            ? (entry.name.split('.').pop() as string)
            : 'png'

          const processedEntry: ProcessedImageEntry = {
            id: resultId,
            originalId: entry.id,
            originalName: entry.name,
            src: resultSrc,
            name: `${baseName}-processed.${ext}`,
            type: blob.type || 'image/png',
            size: blob.size,
            blobKey: resultKey,
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
              err instanceof Error ? err.message : 'Unknown processing error',
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
            processingError: 'No pipeline steps configured. Add steps first.',
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

            const blob = await response.blob()
            const resultId = crypto.randomUUID()
            const resultKey = processedBlobKeyForId(resultId)
            await syncEngine.putBlob(resultKey, blob)

            const resultSrc = URL.createObjectURL(blob)
            const baseName = entry.name.replace(/\.[^.]+$/, '')
            const ext = entry.name.includes('.')
              ? (entry.name.split('.').pop() as string)
              : 'png'

            newProcessed.push({
              id: resultId,
              originalId: entry.id,
              originalName: entry.name,
              src: resultSrc,
              name: `${baseName}-processed.${ext}`,
              type: blob.type || 'image/png',
              size: blob.size,
              blobKey: resultKey,
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
        for (const img of [...images, ...processedImages]) {
          URL.revokeObjectURL(img.src)
          try {
            await syncEngine.deleteBlob(img.blobKey)
          } catch {
            // Ignore cleanup errors
          }
        }
        set({
          images: [],
          processedImages: [],
          processingId: null,
          processingState: 'idle',
          processingError: null,
        })
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

        // Hydrate original images
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

        // Hydrate processed images
        if (processedImages.length > 0) {
          const hydratedProcessed: ProcessedImageEntry[] = []

          for (const img of processedImages) {
            const blob = await syncEngine.getBlob(img.blobKey)
            if (blob) {
              const src = URL.createObjectURL(blob)
              hydratedProcessed.push({
                ...img,
                src,
              })
            } else {
              console.warn(
                `[images] Blob not found for processed image ${img.id}, skipping`,
              )
            }
          }

          set({ processedImages: hydratedProcessed })
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
            blobKey: img.blobKey,
            processedAt: img.processedAt,
          }),
        ),
      }),
      // After persist hydration, auto-trigger blob re-creation
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
    const { images, processedImages } = useImagesStore.getState()
    const validKeys = new Set([
      ...images.map((img) => img.blobKey),
      ...processedImages.map((img) => img.blobKey),
    ])
    const allBlobKeys = await syncEngine.getAllBlobKeys()

    for (const key of allBlobKeys) {
      if (
        (key.startsWith('image-blob-') || key.startsWith('processed-blob-')) &&
        !validKeys.has(key as string)
      ) {
        await syncEngine.deleteBlob(key as string)
      }
    }
  } catch (err) {
    console.warn('[images] Orphan cleanup failed:', err)
  }
}

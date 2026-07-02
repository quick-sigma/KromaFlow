/**
 * Images store — manages loaded image files with blob URLs.
 *
 * Features:
 *  - Auto-saves image binary data to IndexedDB (via SyncEngine)
 *  - Persists image metadata across sessions via Zustand persist
 *  - On app load, recreates File objects and blob URLs from stored blobs
 *  - Processing sends the image + current pipeline definition to the backend
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

type ProcessingState = 'idle' | 'processing' | 'success' | 'error'

type ImageState = {
  images: ImageEntry[]
  /** ID of the image currently being processed, or null */
  processingId: string | null
  processingState: ProcessingState
  processingError: string | null

  addImages: (files: File[]) => Promise<void>
  removeImage: (id: string) => Promise<void>
  processImage: (id: string) => void
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

// ── Store ────────────────────────────────────────────────────────────────────

export const useImagesStore = create<ImageState>()(
  persist(
    (set, get) => ({
      images: [],
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

          // ── Download the processed image ────────────────────────────────
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          // Preserve original name but note it's processed
          const ext = entry.name.includes('.')
            ? entry.name.split('.').pop()
            : 'png'
          const baseName = entry.name.replace(/\.[^.]+$/, '')
          a.download = `${baseName}-processed.${ext}`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

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

      clearImages: async () => {
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

      clearProcessingStatus: () => {
        set({
          processingId: null,
          processingState: 'idle',
          processingError: null,
        })
      },

      hydrateBlobs: async () => {
        const { images } = get()
        if (images.length === 0) return

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
            // Blob not found (may have been cleaned up) — skip this entry
            console.warn(`[images] Blob not found for image ${img.id}, skipping`)
          }
        }

        // Also clean up orphaned blobs in the background
        cleanupOrphanedBlobs()

        set({ images: hydrated })
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
      }),
      // After persist hydration, auto-trigger blob re-creation
      onRehydrateStorage: () => {
        return (state) => {
          if (state?.images && state.images.length > 0) {
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
    const validKeys = new Set(images.map((img) => img.blobKey))
    const allBlobKeys = await syncEngine.getAllBlobKeys()

    for (const key of allBlobKeys) {
      if (key.startsWith('image-blob-') && !validKeys.has(key as string)) {
        await syncEngine.deleteBlob(key as string)
      }
    }
  } catch (err) {
    console.warn('[images] Orphan cleanup failed:', err)
  }
}



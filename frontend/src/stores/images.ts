/**
 * Images store — manages loaded image files with blob URLs.
 *
 * Processing sends the image + current pipeline definition to the backend.
 */

import { create } from 'zustand'
import { usePipelineStore } from './pipeline'

const API_BASE = 'http://localhost:55558'

export type ImageEntry = {
  id: string
  file: File
  src: string
  name: string
}

type ProcessingState = 'idle' | 'processing' | 'success' | 'error'

type ImageState = {
  images: ImageEntry[]
  /** ID of the image currently being processed, or null */
  processingId: string | null
  processingState: ProcessingState
  processingError: string | null
  addImages: (files: File[]) => void
  removeImage: (id: string) => void
  processImage: (id: string) => void
  clearImages: () => void
  /** Clears processing status back to idle */
  clearProcessingStatus: () => void
}

export const useImagesStore = create<ImageState>((set, get) => ({
  images: [],
  processingId: null,
  processingState: 'idle',
  processingError: null,

  addImages: (files: File[]) => {
    const newEntries: ImageEntry[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      src: URL.createObjectURL(file),
      name: file.name,
    }))

    set((state) => ({
      images: [...state.images, ...newEntries],
    }))
  },

  removeImage: (id: string) => {
    const { images } = get()
    const entry = images.find((img) => img.id === id)
    if (entry) {
      URL.revokeObjectURL(entry.src)
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

  clearImages: () => {
    const { images } = get()
    for (const img of images) {
      URL.revokeObjectURL(img.src)
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
}))

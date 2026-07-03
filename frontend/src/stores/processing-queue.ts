/**
 * Processing Queue Store — manages the image processing queue, WebSocket
 * connection, and per-image state transitions.
 *
 * The backend processes images one at a time.  Each image transitions
 * through: idle → enqueued → processing → completed / failed.
 *
 * The store:
 *  1. Connects to the backend WebSocket to receive real-time updates.
 *  2. Provides `enqueue` / `enqueueAll` methods that POST to the queue
 *     endpoint and then track the job via WebSocket messages.
 *  3. Exposes per-image status and overall queue progress for the UI.
 */

import { create } from 'zustand'
import { usePipelineStore } from './pipeline'
import { useImagesStore, type ProcessedImageEntry } from './images'

const API_BASE = 'http://localhost:55558'
const WS_URL = 'ws://localhost:55558/ws'

// ── Types ────────────────────────────────────────────────────────────────────

export type QueueStatus = 'idle' | 'enqueued' | 'processing' | 'completed' | 'failed'

export type QueueEntry = {
  /** ID of the original image in the images store */
  imageId: string
  /** Job ID returned by the backend */
  jobId: string | null
  status: QueueStatus
  progress: number
  error: string | null
  /** Populated when the job completes */
  resultId: string | null
  resultName: string | null
}

export type OverallStats = {
  totalEnqueued: number
  totalCompleted: number
  totalFailed: number
  pendingCount: number
  currentJobId: string | null
}

type QueueState = {
  /** Per-image queue state keyed by image ID */
  entries: Record<string, QueueEntry>
  /** Overall queue statistics */
  stats: OverallStats
  /** Whether the WebSocket connection is established */
  connected: boolean
  /** Global progress percentage (0–100) */
  globalProgress: number

  /** Enqueue a single image for processing */
  enqueueImage: (imageId: string) => Promise<void>
  /** Enqueue all unprocessed images */
  enqueueAllImages: () => Promise<void>
  /** Reset a completed/failed entry back to idle (for reprocess) */
  resetEntry: (imageId: string) => void
  /** Connect to the backend WebSocket */
  connectWebSocket: () => void
  /** Disconnect from the backend WebSocket */
  disconnectWebSocket: () => void
}

// ── WebSocket management ─────────────────────────────────────────────────────

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsUrl = WS_URL

/**
 * Create a processing queue store instance.
 * The store is a singleton — use `useQueueStore` throughout the app.
 */
export const useQueueStore = create<QueueState>()((set, get) => ({
  entries: {},
  stats: {
    totalEnqueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    pendingCount: 0,
    currentJobId: null,
  },
  connected: false,
  globalProgress: 0,

  // ── Enqueue ──────────────────────────────────────────────────────────

  enqueueImage: async (imageId: string) => {
    const { images } = useImagesStore.getState()
    const entry = images.find((img) => img.id === imageId)
    if (!entry) return

    // Validate pipeline
    const pipelineSteps = usePipelineStore.getState().steps
    if (pipelineSteps.length === 0) {
      useImagesStore.getState().clearProcessingStatus()
      return
    }
    if (!pipelineSteps.some((ps) => ps.step.variant === 'output_formatter')) {
      useImagesStore.getState().clearProcessingStatus()
      return
    }

    // Mark as enqueued locally
    set((state) => ({
      entries: {
        ...state.entries,
        [imageId]: {
          imageId,
          jobId: null,
          status: 'enqueued',
          progress: 0,
          error: null,
          resultId: null,
          resultName: null,
        },
      },
    }))

    try {
      const pipelinePayload = pipelineSteps.map((ps) => ({
        step_id: ps.step.id,
        config: ps.config,
      }))

      const formData = new FormData()
      formData.append('image', entry.file)
      formData.append('pipeline', JSON.stringify(pipelinePayload))

      const response = await fetch(`${API_BASE}/api/queue/enqueue`, {
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
        throw new Error(detail)
      }

      const data = await response.json() as { jobId: string; status: string }

      // Update with job ID
      set((state) => ({
        entries: {
          ...state.entries,
          [imageId]: {
            ...state.entries[imageId],
            jobId: data.jobId,
          },
        },
      }))
    } catch (err) {
      // Mark as failed if enqueue request fails
      set((state) => ({
        entries: {
          ...state.entries,
          [imageId]: {
            imageId,
            jobId: null,
            status: 'failed',
            progress: 0,
            error: err instanceof Error ? err.message : 'Failed to enqueue',
            resultId: null,
            resultName: null,
          },
        },
      }))
    }
  },

  enqueueAllImages: async () => {
    const { images } = useImagesStore.getState()
    for (const img of images) {
      const state = get().entries[img.id]
      // Skip already-enqueued or already-processed images
      if (state && (state.status === 'enqueued' || state.status === 'processing' || state.status === 'completed')) {
        continue
      }
      await get().enqueueImage(img.id)
    }
  },

  resetEntry: (imageId: string) => {
    set((state) => {
      const newEntries = { ...state.entries }
      delete newEntries[imageId]
      return { entries: newEntries }
    })
  },

  // ── WebSocket ────────────────────────────────────────────────────────

  connectWebSocket: () => {
    // Guard: WebSocket may not be available in test environments
    if (typeof WebSocket === 'undefined') {
      return
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        set({ connected: true })
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data) as {
            type: string
            job?: {
              jobId: string
              originalName: string
              status: string
              progress: number
              error: string | null
              resultId: string | null
              resultName: string | null
            }
            stats?: {
              totalEnqueued: number
              totalCompleted: number
              totalFailed: number
              pendingCount: number
              currentJobId: string | null
            }
            jobs?: Array<{
              jobId: string
              originalName: string
              status: string
              progress: number
              error: string | null
              resultId: string | null
              resultName: string | null
            }>
          }

          const state = get()

          switch (message.type) {
            case 'state_sync': {
              // Full state sync on initial connection
              const entries: Record<string, QueueEntry> = {}
              if (message.jobs) {
                for (const job of message.jobs) {
                  // Find the matching image in our store
                  const imgEntry = findImageByOriginalName(job.originalName)
                  if (imgEntry) {
                    entries[imgEntry.id] = {
                      imageId: imgEntry.id,
                      jobId: job.jobId,
                      status: job.status as QueueStatus,
                      progress: job.progress,
                      error: job.error,
                      resultId: job.resultId,
                      resultName: job.resultName,
                    }
                  }
                }
              }
              set({
                entries: { ...state.entries, ...entries },
                stats: message.stats ?? state.stats,
                connected: true,
              })
              break
            }

            case 'job_enqueued':
            case 'job_processing':
            case 'job_update': {
              if (message.job) {
                const imgEntry = findImageByOriginalName(message.job.originalName)
                if (imgEntry) {
                  set((s) => ({
                    entries: {
                      ...s.entries,
                      [imgEntry.id]: {
                        imageId: imgEntry.id,
                        jobId: message.job!.jobId,
                        status: message.job!.status as QueueStatus,
                        progress: message.job!.progress,
                        error: message.job!.error,
                        resultId: message.job!.resultId,
                        resultName: message.job!.resultName,
                      },
                    },
                    stats: message.stats ?? s.stats,
                  }))
                }
              }
              break
            }

            case 'job_completed': {
              if (message.job) {
                const imgEntry = findImageByOriginalName(message.job.originalName)
                if (imgEntry) {
                  // Add to processed images
                  const downloadUrl = `${API_BASE}/api/images/${message.job.resultId}/download`
                  const processedEntry: ProcessedImageEntry = {
                    id: message.job.resultId!,
                    originalId: imgEntry.id,
                    originalName: imgEntry.name,
                    name: message.job.resultName ?? imgEntry.name,
                    type: '', // Will be inferred from the download
                    size: 0,
                    downloadUrl,
                    thumbnailUrl: (message.job as Record<string, unknown>).primaryImageUrl
                      ? `${API_BASE}${(message.job as Record<string, unknown>).primaryImageUrl}`
                      : undefined,
                    processedAt: Date.now(),
                  }

                  useImagesStore.getState().addProcessedImageFromQueue(processedEntry)

                  set((s) => ({
                    entries: {
                      ...s.entries,
                      [imgEntry.id]: {
                        imageId: imgEntry.id,
                        jobId: message.job!.jobId,
                        status: 'completed',
                        progress: 100,
                        error: null,
                        resultId: message.job!.resultId,
                        resultName: message.job!.resultName,
                      },
                    },
                    stats: message.stats ?? s.stats,
                  }))
                }
              }
              break
            }

            case 'job_failed': {
              if (message.job) {
                const imgEntry = findImageByOriginalName(message.job.originalName)
                if (imgEntry) {
                  set((s) => ({
                    entries: {
                      ...s.entries,
                      [imgEntry.id]: {
                        imageId: imgEntry.id,
                        jobId: message.job!.jobId,
                        status: 'failed',
                        progress: message.job!.progress,
                        error: message.job!.error,
                        resultId: null,
                        resultName: null,
                      },
                    },
                    stats: message.stats ?? s.stats,
                  }))
                }
              }
              break
            }
          }

          // Recompute global progress
          set({ globalProgress: computeGlobalProgress(get()) })

        } catch (err) {
          console.error('[QueueStore] Failed to parse WebSocket message:', err)
        }
      }

      ws.onclose = () => {
        set({ connected: false })
        // Auto-reconnect after 3 seconds
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => {
          get().connectWebSocket()
        }, 3000)
      }

      ws.onerror = () => {
        // onclose will fire after onerror, so we let onclose handle reconnection
      }
    } catch (err) {
      console.error('[QueueStore] Failed to create WebSocket:', err)
      // Retry after 5 seconds
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        get().connectWebSocket()
      }, 5000)
    }
  },

  disconnectWebSocket: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    set({ connected: false })
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find an original image entry by its original filename.
 * This matches what the backend sends in WebSocket messages.
 */
function findImageByOriginalName(name: string): { id: string; name: string } | null {
  const { images } = useImagesStore.getState()
  return images.find((img) => img.name === name) ?? null
}

/**
 * Compute overall queue progress as a percentage (0–100).
 *
 * Formula: for total T jobs, with C completed, F failed, and P in progress
 * (with their individual progress), the global progress weights completed/failed
 * as 100% and averages all others.
 */
function computeGlobalProgress(state: QueueState): number {
  const entries = Object.values(state.entries)
  if (entries.length === 0) return 0

  const completed = entries.filter((e) => e.status === 'completed' || e.status === 'failed')
  const inProgress = entries.filter((e) => e.status === 'processing' || e.status === 'enqueued')

  const completedWeight = completed.length * 100
  const progressWeight = inProgress.reduce((sum, e) => sum + e.progress, 0)

  return Math.round((completedWeight + progressWeight) / entries.length)
}

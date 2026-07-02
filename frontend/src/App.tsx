import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import FileInput from './components/FileInput'
import MiniatureList from './components/MiniatureList'
import PipelineEditor from './components/PipelineEditor'
import { useImagesStore } from './stores/images'
import { usePipelineStore } from './stores/pipeline'
import { useQueueStore } from './stores/processing-queue'
import { syncEngine } from './stores/sync-engine'

/**
 * Hydration gate — waits for all Zustand persist stores to rehydrate
 * and for image blobs to be reconstructed before rendering the main UI.
 *
 * This ensures that on page refresh the user sees the exact same state
 * they left off with — images, pipeline, and step cache all restored.
 */
function useHydrationGate() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      // Ensure SyncEngine is initialized (in case of race conditions)
      await syncEngine.ready()

      // Force rehydration for all persisted stores
      await Promise.all([
        usePipelineStore.persist.rehydrate(),
        useImagesStore.persist.rehydrate(),
      ])

      if (cancelled) return

      // Recreate File objects and blob URLs from IndexedDB blobs
      await useImagesStore.getState().hydrateBlobs()

      if (!cancelled) {
        setReady(true)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  return ready
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <div
        className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"
        role="status"
      />
      <p className="text-gray-400 text-sm">Restoring session…</p>
    </div>
  )
}

function App() {
  const ready = useHydrationGate()
  const { t } = useTranslation()
  const addImages = useImagesStore((state) => state.addImages)

  // Queue WebSocket + progress
  const connectWebSocket = useQueueStore((state) => state.connectWebSocket)
  const disconnectWebSocket = useQueueStore((state) => state.disconnectWebSocket)
  const stats = useQueueStore((state) => state.stats)
  const globalProgress = useQueueStore((state) => state.globalProgress)
  const entries = useQueueStore((state) => state.entries)

  useEffect(() => {
    if (ready) {
      connectWebSocket()
    }
    return () => {
      disconnectWebSocket()
    }
  }, [ready, connectWebSocket, disconnectWebSocket])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    addImages(Array.from(files))
    event.target.value = ''
  }

  if (!ready) {
    return <LoadingScreen />
  }

  // Compute total jobs and completed jobs for the global progress bar
  const entryValues = Object.values(entries)
  const totalJobs = entryValues.length
  const completedJobs = entryValues.filter(
    (e) => e.status === 'completed' || e.status === 'failed',
  ).length
  const hasActiveJobs = totalJobs > 0

  return (
    <div className="min-h-screen flex bg-gray-900 text-white">
      <PipelineEditor />

      {/* ── Image area with processing bar at the bottom ──────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 flex flex-col gap-10 p-6 overflow-y-auto">
          <FileInput onChange={handleFileChange} />
          <MiniatureList />
        </div>

        {/* ── Global processing bar (sticky bottom inside container) ─ */}
        {hasActiveJobs && (
          <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700/50 px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-sm text-gray-300 font-medium whitespace-nowrap">
                  {t('queue.globalProgress')}
                </span>
              </div>

              <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${globalProgress}%` }}
                />
              </div>

              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                {completedJobs}/{totalJobs}
                {stats.totalFailed > 0 && (
                  <span className="text-red-400 ml-1">
                    ({stats.totalFailed} {t('queue.failed').toLowerCase()})
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

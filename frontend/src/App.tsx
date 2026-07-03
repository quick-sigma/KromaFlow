import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import FileInput from './components/FileInput'
import MiniatureList from './components/MiniatureList'
import Navbar from './components/Navbar'
import PipelineEditor from './components/PipelineEditor'
import SettingsDialog from './components/SettingsDialog'
import { useImagesStore } from './stores/images'
import { usePipelineStore } from './stores/pipeline'
import { useQueueStore } from './stores/processing-queue'
import { useSettingsStore } from './stores/settings'
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
    <div
      className="min-h-screen flex flex-col items-center justify-center text-white"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin mb-4"
        style={{
          borderColor: 'var(--brand-primary)',
          borderTopColor: 'transparent',
        }}
        role="status"
      />
      <p style={{ color: 'var(--text-muted)' }} className="text-sm">Restoring session…</p>
    </div>
  )
}

function App() {
  const ready = useHydrationGate()
  const { t } = useTranslation()
  const addImages = useImagesStore((state) => state.addImages)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

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

  // Sync persisted settings to the backend after hydration
  const syncToBackend = useSettingsStore((s) => s.syncToBackend)
  const checkBackendStatus = useSettingsStore((s) => s.checkBackendStatus)
  useEffect(() => {
    if (ready) {
      syncToBackend()
    } else {
      // Even before hydration, check if the backend has a token
      checkBackendStatus()
    }
  }, [ready, syncToBackend, checkBackendStatus])

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
    <div
      className="min-h-screen flex flex-col text-white overflow-hidden"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      <Navbar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 min-h-0">
        <PipelineEditor />

        {/* ── Image area with processing bar at the bottom ──────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">
            <FileInput onChange={handleFileChange} />
            <MiniatureList />
          </div>

          {/* ── Global processing bar (sticky bottom inside container) ─ */}
          {hasActiveJobs && (
            <div
              className="sticky bottom-0 px-6 py-3"
              style={{
                backgroundColor: 'var(--bg-main)',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  />
                  <span
                    className="whitespace-nowrap"
                    style={{
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.9rem',
                    }}
                  >
                    {t('queue.globalProgress')}
                  </span>
                </div>

                <div className="flex-1 rounded-full h-3 overflow-hidden"
                  style={{ backgroundColor: 'rgba(199, 211, 191, 0.1)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${globalProgress}%`,
                      background: 'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-accent) 100%)',
                      boxShadow: '0 0 8px rgba(102,44,145,0.4), 0 0 16px rgba(242,95,92,0.2)',
                    }}
                  />
                </div>

                <span
                  className="text-xs whitespace-nowrap shrink-0"
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 700,
                  }}
                >
                  {completedJobs}/{totalJobs}
                  {stats.totalFailed > 0 && (
                    <span className="ml-1" style={{ color: 'var(--brand-accent)' }}>
                      ({stats.totalFailed} {t('queue.failed').toLowerCase()})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Settings dialog ────────────────────────────────────────── */}
      {isSettingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}

export default App

import { useState, useEffect } from 'react'
import FileInput from './components/FileInput'
import MiniatureList from './components/MiniatureList'
import PipelineEditor from './components/PipelineEditor'
import { useImagesStore } from './stores/images'
import { usePipelineStore } from './stores/pipeline'
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
  const addImages = useImagesStore((state) => state.addImages)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    addImages(Array.from(files))
    event.target.value = ''
  }

  if (!ready) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen flex bg-gray-900 text-white">
      {/* ── Pipeline Editor sidebar ─────────────────────────────── */}
      <PipelineEditor />

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-8 p-8">
        <FileInput onChange={handleFileChange} />
        <MiniatureList />
      </div>
    </div>
  )
}

export default App

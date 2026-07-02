/**
 * Pipeline store — shares the current pipeline steps between
 * PipelineEditor (which builds the pipeline) and images.ts
 * (which sends the pipeline to the backend when processing).
 *
 * Uses Zustand persist middleware to automatically sync the current
 * pipeline state to IndexedDB (via SyncEngine). Changes are debounced
 * and persisted — if the window is refreshed, the pipeline is restored.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { syncEngine } from './sync-engine'

export type PipelineStep = {
  step: {
    id: string
    name: string
    variant: 'processor' | 'output_formatter'
  }
  config: Record<string, unknown>
}

type PipelineState = {
  steps: PipelineStep[]
  setSteps: (steps: PipelineStep[]) => void
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set) => ({
      steps: [],
      setSteps: (steps) => set({ steps }),
    }),
    {
      name: 'pipeline-store',
      storage: createJSONStorage(() => syncEngine.createZustandStorage()),
      // Only persist the steps array (not the setter functions)
      partialize: (state) => ({
        steps: state.steps,
      }),
    },
  ),
)

/**
 * Pipeline store — shares the current pipeline steps between
 * PipelineEditor (which builds the pipeline) and images.ts
 * (which sends the pipeline to the backend when processing).
 */

import { create } from 'zustand'

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

export const usePipelineStore = create<PipelineState>((set) => ({
  steps: [],
  setSteps: (steps) => set({ steps }),
}))

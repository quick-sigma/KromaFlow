/**
 * Zustand store for pipeline steps with persisted cache.
 *
 * Fetches step metadata from GET /api/steps. Caches the result in
 * IndexedDB (via SyncEngine) with a configurable TTL so the user
 * sees cached steps immediately on refresh instead of a loading state.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { syncEngine } from './sync-engine'

// ── Types ────────────────────────────────────────────────────────────────────

export type StepVariant = 'processor' | 'output_formatter' | 'distribution'

export type StepInfo = {
  id: string
  name: string
  description: string
  version: string
  variant: StepVariant
  config_schema: Record<string, unknown>
  is_base_node?: boolean
  /** If true, this step can appear multiple times in the pipeline. */
  repeatable?: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:55558'
const STEPS_ENDPOINT = `${API_BASE_URL}/api/steps`

/** Cache TTL in milliseconds (default: 5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000

// ── Store ────────────────────────────────────────────────────────────────────

type StepsState = {
  /** List of available pipeline steps. */
  steps: StepInfo[]
  /** Whether a fetch is in progress. */
  isLoading: boolean
  /** Error message, if any. */
  error: string | null
  /** Timestamp of the last successful fetch (ms since epoch). */
  lastFetchedAt: number | null

  /** Fetch steps from the API. Use force=true to bypass cache. */
  loadSteps: (force?: boolean) => Promise<void>
}

export const useStepsStore = create<StepsState>()(
  persist(
    (set, get) => ({
      steps: [],
      isLoading: false,
      error: null,
      lastFetchedAt: null,

      loadSteps: async (force = false) => {
        const state = get()

        // Use cached data if it's still fresh
        if (
          !force &&
          state.lastFetchedAt !== null &&
          state.steps.length > 0 &&
          Date.now() - state.lastFetchedAt < CACHE_TTL_MS
        ) {
          return
        }

        set({ isLoading: true, error: null })

        try {
          const res = await fetch(STEPS_ENDPOINT)

          if (!res.ok) {
            // If API fails but we have cached data, use it
            if (state.steps.length > 0) {
              set({ isLoading: false })
              return
            }
            throw new Error(`API responded with status ${res.status}`)
          }

          const data: unknown = await res.json()

          if (!Array.isArray(data)) {
            throw new Error('Unexpected response format: expected an array')
          }

          // Basic validation of each item
          const steps = data.filter(
            (item): item is StepInfo =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as StepInfo).id === 'string' &&
              typeof (item as StepInfo).name === 'string' &&
              typeof (item as StepInfo).description === 'string' &&
              typeof (item as StepInfo).version === 'string',
          )

          set({ steps, isLoading: false, error: null, lastFetchedAt: Date.now() })
        } catch (err: unknown) {
          // If we have cached steps, don't show an error — use cache
          if (state.steps.length > 0) {
            set({ isLoading: false })
            return
          }

          const message =
            err instanceof Error ? err.message : 'Failed to load steps'
          set({ isLoading: false, error: message })
        }
      },
    }),
    {
      name: 'steps-store',
      storage: createJSONStorage(() => syncEngine.createZustandStorage()),
      // Only persist steps and lastFetchedAt (not loading/error states)
      partialize: (state) => ({
        steps: state.steps,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
)

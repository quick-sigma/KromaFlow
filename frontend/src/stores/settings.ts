/**
 * Settings store — manages app-wide settings such as the Hugging Face token.
 *
 * The token is persisted to localStorage so it survives page refreshes,
 * and it is sent to the backend on every change so the backend can use it
 * for model downloads (gated models, faster downloads).
 *
 * On app startup the store re-sends the persisted token to the backend
 * to restore it in the backend's in-memory settings.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const API_BASE = 'http://localhost:55558'

// ── Types ────────────────────────────────────────────────────────────────────

export type SettingsState = {
  /** The stored Hugging Face token (or empty string if none). */
  hfToken: string
  /** Whether the backend confirmed a token is configured. */
  tokenConfigured: boolean
  /** Whether a sync with the backend is in progress. */
  syncing: boolean
  /** Last sync error message, or null. */
  syncError: string | null

  /** Set the HF token, persisting locally and sending to the backend. */
  setHfToken: (token: string) => Promise<void>
  /** Clear the HF token both locally and on the backend. */
  clearHfToken: () => Promise<void>
  /** Sync the persisted token to the backend (call on app startup). */
  syncToBackend: () => Promise<void>
  /** Check whether the backend has a token configured. */
  checkBackendStatus: () => Promise<void>
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      hfToken: '',
      tokenConfigured: false,
      syncing: false,
      syncError: null,

      setHfToken: async (token: string) => {
        set({ syncing: true, syncError: null })
        try {
          const response = await fetch(`${API_BASE}/api/settings/hf-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })

          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Server error: ${response.status}`)
          }

          const data = (await response.json()) as { hfTokenConfigured: boolean }

          set({
            hfToken: token,
            tokenConfigured: data.hfTokenConfigured,
            syncing: false,
            syncError: null,
          })
        } catch (err) {
          // Still save locally even if backend is unreachable
          set({
            hfToken: token,
            tokenConfigured: token.length > 0,
            syncing: false,
            syncError: err instanceof Error ? err.message : 'Failed to sync token',
          })
        }
      },

      clearHfToken: async () => {
        set({ syncing: true, syncError: null })
        try {
          const response = await fetch(`${API_BASE}/api/settings/hf-token`, {
            method: 'DELETE',
          })

          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Server error: ${response.status}`)
          }

          set({
            hfToken: '',
            tokenConfigured: false,
            syncing: false,
            syncError: null,
          })
        } catch (err) {
          // Clear locally even if backend is unreachable
          set({
            hfToken: '',
            tokenConfigured: false,
            syncing: false,
            syncError: err instanceof Error ? err.message : 'Failed to clear token',
          })
        }
      },

      syncToBackend: async () => {
        const { hfToken } = get()
        if (!hfToken) {
          // No token to sync, but check backend status
          await get().checkBackendStatus()
          return
        }

        set({ syncing: true })
        try {
          const response = await fetch(`${API_BASE}/api/settings/hf-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: hfToken }),
          })

          if (!response.ok) {
            // Backend might not be running — just log and keep local state
            console.warn('[settings] Backend sync failed:', response.status)
            set({ syncing: false })
            return
          }

          const data = (await response.json()) as { hfTokenConfigured: boolean }
          set({ tokenConfigured: data.hfTokenConfigured, syncing: false })
        } catch (err) {
          console.warn('[settings] Backend sync failed:', err)
          set({ syncing: false })
        }
      },

      checkBackendStatus: async () => {
        try {
          const response = await fetch(`${API_BASE}/api/settings`)
          if (!response.ok) return
          const data = (await response.json()) as { hfTokenConfigured: boolean }
          set({ tokenConfigured: data.hfTokenConfigured })
        } catch {
          // Backend not available — that's fine
        }
      },
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist the hfToken — everything else is ephemeral
      partialize: (state) => ({
        hfToken: state.hfToken,
      }),
    },
  ),
)

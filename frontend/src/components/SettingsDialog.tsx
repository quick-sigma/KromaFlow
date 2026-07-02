/**
 * SettingsDialog — top-level modal for configuring app-wide settings.
 *
 * Currently supports:
 *  - Hugging Face token configuration (masked input with visibility toggle)
 *
 * The token is sent to the backend on save and persisted to localStorage
 * so it survives page refreshes (re-synced on app startup).
 *
 * Cyber-Amethyst themed following the SavePipelineDialog pattern.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiEye, FiEyeOff, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi'
import { useSettingsStore } from '../stores/settings'

// ── Props ────────────────────────────────────────────────────────────────────

type SettingsDialogProps = {
  /** Called when the dialog is dismissed. */
  onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { t } = useTranslation()

  // ── Store ──────────────────────────────────────────────────────────────
  const storeHfToken = useSettingsStore((s) => s.hfToken)
  const syncing = useSettingsStore((s) => s.syncing)
  const syncError = useSettingsStore((s) => s.syncError)
  const setHfToken = useSettingsStore((s) => s.setHfToken)
  const clearHfToken = useSettingsStore((s) => s.clearHfToken)

  // ── Local state ────────────────────────────────────────────────────────
  const [token, setToken] = useState(storeHfToken)
  const [showToken, setShowToken] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the input on mount
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  // ── Save handler ───────────────────────────────────────────────────────
  async function handleSave() {
    const trimmed = token.trim()
    if (trimmed === storeHfToken) {
      // No change — just close
      onClose()
      return
    }
    await setHfToken(trimmed)
    setSaved(true)
    // Show success briefly, then close
    setTimeout(() => onClose(), 1200)
  }

  // ── Clear handler ──────────────────────────────────────────────────────
  async function handleClear() {
    if (!storeHfToken && !token) return
    setToken('')
    await clearHfToken()
    setSaved(true)
    setTimeout(() => onClose(), 1200)
  }

  // Submit on Enter
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  const hasChanged = token !== storeHfToken
  const isValid = token === '' || token.startsWith('hf_')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-label={t('settingsDialog.title')}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          animation: 'settingsDialogIn 150ms ease-out',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <h2
            className="text-lg truncate flex items-center gap-2"
            style={{
              color: 'var(--text-main)',
              fontFamily: 'var(--font-heading)',
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              style={{ color: 'var(--brand-primary)' }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {t('settingsDialog.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="transition-colors cursor-pointer ml-3 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            aria-label={t('settingsDialog.close')}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="p-5 space-y-4">
          {/* ── Hugging Face Token ───────────────────────────────── */}
          <div>
            <label className="block">
              <span
                className="text-sm block mb-2"
                style={{
                  color: 'var(--text-main)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t('settingsDialog.hfTokenLabel')}
              </span>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('settingsDialog.hfTokenPlaceholder')}
                  className="w-full rounded-lg px-3 py-2 pr-10 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-ui)',
                  }}
                  aria-label={t('settingsDialog.hfTokenLabel')}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-main)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)'
                  }}
                  aria-label={
                    showToken
                      ? t('settingsDialog.hideToken')
                      : t('settingsDialog.showToken')
                  }
                >
                  {showToken ? (
                    <FiEyeOff className="w-4 h-4" />
                  ) : (
                    <FiEye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </label>

            {/* ── Validation hint ───────────────────────────────── */}
            {token.length > 0 && !token.startsWith('hf_') && (
              <p
                className="text-xs mt-1.5 flex items-center gap-1"
                style={{ color: 'var(--brand-accent)' }}
              >
                <FiAlertCircle className="w-3 h-3 shrink-0" />
                {t('settingsDialog.hfTokenInvalidHint')}
              </p>
            )}

            {/* ── Token status indicator ────────────────────────── */}
            <p
              className="text-xs mt-1.5 flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{
                  backgroundColor:
                    storeHfToken && token === storeHfToken
                      ? '#22c55e'
                      : 'var(--border-subtle)',
                }}
              />
              {storeHfToken
                ? t('settingsDialog.tokenConfigured')
                : t('settingsDialog.tokenNotConfigured')}
            </p>
          </div>

          {/* ── Info text ───────────────────────────────────────── */}
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('settingsDialog.hfTokenInfo')}
          </p>

          {/* ── Sync feedback ───────────────────────────────────── */}
          {syncing && (
            <p
              className="text-xs flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <span
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'var(--brand-primary)',
                  borderTopColor: 'transparent',
                }}
              />
              {t('settingsDialog.syncing')}
            </p>
          )}

          {syncError && !syncing && (
            <p
              className="text-xs flex items-center gap-1"
              style={{ color: 'var(--brand-accent)' }}
            >
              <FiAlertCircle className="w-3 h-3 shrink-0" />
              {syncError}
            </p>
          )}

          {saved && !syncing && !syncError && (
            <p
              className="text-xs flex items-center gap-1"
              style={{ color: '#22c55e' }}
            >
              <FiCheck className="w-3 h-3 shrink-0" />
              {t('settingsDialog.saved')}
            </p>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div
          className="flex justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg transition cursor-pointer"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)'
              e.currentTarget.style.backgroundColor = 'var(--bg-card)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {t('settingsDialog.cancel')}
          </button>

          {storeHfToken && (
            <button
              type="button"
              onClick={handleClear}
              disabled={syncing}
              className="px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-40"
              style={{
                color: 'var(--brand-accent)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: '0.8rem',
                border: '1px solid var(--brand-accent)',
              }}
              onMouseEnter={(e) => {
                if (!syncing) {
                  e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {t('settingsDialog.clear')}
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={syncing || (!hasChanged && !syncError) || (!isValid && token.length > 0)}
            className="px-4 py-2 rounded-lg text-white transition cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--brand-primary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              if (!syncing) {
                e.currentTarget.style.filter = 'brightness(1.15)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none'
            }}
          >
            {t('settingsDialog.save')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes settingsDialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

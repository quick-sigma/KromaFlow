/**
 * Floating search bar — a Notion-style command palette for selecting pipeline steps.
 *
 * Features:
 * - Overlay with backdrop
 * - Auto-focused search input
 * - Real-time filtering by name / description
 * - Displays version, name, and description per result
 * - Animated loading bar when steps are being fetched
 * - Groups results by variant (processor / output_formatter)
 * - Close on Escape or backdrop click
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStepsStore, type StepInfo, type StepVariant } from '../stores/steps'

// ── Constants ────────────────────────────────────────────────────────────────

const LOADING_BAR_KEYFRAMES = `
@keyframes loading-bar {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(100%); }
  100% { transform: translateX(400%); }
}
`

// ── Styles (injected once) ───────────────────────────────────────────────────

let styleInjected = false
function injectStyles(): void {
  if (styleInjected) return
  const style = document.createElement('style')
  style.textContent = LOADING_BAR_KEYFRAMES
  document.head.appendChild(style)
  styleInjected = true
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchesQuery(step: StepInfo, query: string): boolean {
  const q = query.toLowerCase()
  return (
    step.name.toLowerCase().includes(q) ||
    step.description.toLowerCase().includes(q) ||
    step.id.toLowerCase().includes(q)
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

type StepSearchProps = {
  /** Called when the user selects a step. */
  onSelect: (step: StepInfo) => void
  /** Called when the user dismisses the search (Escape / click outside). */
  onClose: () => void
  /**
   * Variants to exclude from the results list.
   * Used to prevent adding a second output formatter.
   */
  excludeVariants?: StepVariant[]
  /**
   * Step IDs to exclude from the results list.
   * Used to prevent adding the same step twice.
   */
  excludeStepIds?: string[]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepSearch({
  onSelect,
  onClose,
  excludeVariants = [],
  excludeStepIds = [],
}: StepSearchProps) {
  const { t } = useTranslation()
  const { steps, isLoading, error, loadSteps } = useStepsStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'processor' | 'output_formatter'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  // Inject loading-bar animation keyframes once
  useEffect(() => {
    injectStyles()
  }, [])

  // Fetch steps when the search opens (only if not cached)
  useEffect(() => {
    loadSteps()
  }, [loadSteps])

  // Auto-focus the input on mount
  useEffect(() => {
    // Small delay so the modal transition doesn't fight focus
    const id = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Filter results — apply variant and step ID exclusion
  const visibleSteps = useMemo(() => {
    const variantExclude = new Set(excludeVariants)
    const idExclude = new Set(excludeStepIds)
    return steps.filter(
      (s) => !variantExclude.has(s.variant) && !idExclude.has(s.id),
    )
  }, [steps, excludeVariants, excludeStepIds])

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleSteps
    return visibleSteps.filter((s) => matchesQuery(s, query))
  }, [visibleSteps, query])

  // Filter by variant based on pill selection
  const filteredByVariant = useMemo(() => {
    if (filter === 'all') return filtered
    return filtered.filter((s) => s.variant === filter)
  }, [filtered, filter])

  function handleSelect(step: StepInfo) {
    onSelect(step)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-label="Search pipeline steps"
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden animate-[fadeIn_150ms_ease-out]"
        style={{
          animation: 'stepSearchFadeIn 150ms ease-out',
        }}
      >
        {/* ── Loading bar ────────────────────────────────────────────── */}
        <div className="h-1 bg-gray-700">
          {isLoading && (
            <div
              className="h-full w-1/4 bg-blue-500 rounded-full"
              style={{
                animation: 'loading-bar 1.2s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* ── Search input ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <svg
            className="w-5 h-5 text-gray-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('stepSearch.placeholder')}
            className="flex-1 bg-transparent text-white placeholder-gray-500 text-lg outline-none"
            aria-label="Search pipeline steps"
          />
        </div>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="px-4 py-3 text-sm text-red-400 bg-red-900/20">
            {error}
          </div>
        )}

        {/* ── Pill switch filter ───────────────────────────────────── */}
        <div
          className="flex justify-center px-4 py-2.5 border-b border-gray-700"
          role="radiogroup"
          aria-label={t('stepSearch.filterLabel')}
        >
          <div className="inline-flex bg-gray-700 rounded-full p-0.5 gap-0">
            {(
              [
                { value: 'all' as const, label: t('stepSearch.filterAll') },
                { value: 'processor' as const, label: t('stepSearch.filterProcessors') },
                { value: 'output_formatter' as const, label: t('stepSearch.filterOutput') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={filter === opt.value}
                onClick={() => setFilter(opt.value)}
                className={`
                  px-5 py-1.5 text-sm font-medium rounded-full transition-all duration-150 cursor-pointer
                  ${filter === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────────── */}
        <div className="max-h-80 overflow-y-auto">
          {/* Notice when steps are excluded */}
          {(excludeVariants.length > 0 || excludeStepIds.length > 0) && (
            <div className="px-4 py-2 text-xs text-amber-400 bg-amber-900/20 border-b border-gray-700/50">
              {t('stepSearch.exclusionNotice')}
            </div>
          )}

          {!isLoading && filteredByVariant.length === 0 && query.trim() && (
            <div className="px-4 py-8 text-center text-gray-500">
              {t('stepSearch.noMatch', { query })}
            </div>
          )}

          {!isLoading && filteredByVariant.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center text-gray-500">
              {filter === 'all' && visibleSteps.length === 0 && steps.length === 0
                ? t('stepSearch.noSteps')
                : t('stepSearch.typeToSearch')}
            </div>
          )}

          {filteredByVariant.map((step) => (
            <StepResultItem
              key={step.id}
              step={step}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      {/* Inline fade-in animation keyframes */}
      <style>{`
        @keyframes stepSearchFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StepResultItem({
  step,
  onSelect,
}: {
  step: StepInfo
  onSelect: (step: StepInfo) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(step)}
      className="w-full text-left px-4 py-3 hover:bg-gray-700/60 transition-colors cursor-pointer border-b border-gray-700/50 last:border-b-0 group"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-white font-medium truncate">
          {step.name}
        </span>
        <span className="shrink-0 text-xs font-mono bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
          v{step.version}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-gray-400 line-clamp-2">
        {step.description}
      </p>
    </button>
  )
}

/**
 * Floating search bar — a Notion-style command palette for selecting pipeline steps.
 *
 * Cyber-Amethyst themed with proper typography.
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

  // Filter results — apply variant and step ID exclusion.
  // Repeatable steps are never excluded by ID (they can appear multiple times).
  const visibleSteps = useMemo(() => {
    const variantExclude = new Set(excludeVariants)
    const idExclude = new Set(excludeStepIds)
    return steps.filter(
      (s) =>
        !variantExclude.has(s.variant) &&
        (s.repeatable || !idExclude.has(s.id)),
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-label="Search pipeline steps"
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          animation: 'stepSearchFadeIn 150ms ease-out',
        }}
      >
        {/* ── Loading bar ────────────────────────────────────────────── */}
        <div className="h-1" style={{ backgroundColor: 'var(--bg-card)' }}>
          {isLoading && (
            <div
              className="h-full w-1/4 rounded-full"
              style={{
                backgroundColor: 'var(--brand-primary)',
                animation: 'loading-bar 1.2s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* ── Search input ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <svg
            className="w-5 h-5 shrink-0"
            style={{ color: 'var(--text-muted)' }}
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
            className="flex-1 bg-transparent text-lg outline-none"
            style={{ color: 'var(--text-main)', fontFamily: 'var(--font-ui)' }}
            aria-label="Search pipeline steps"
          />
        </div>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="px-4 py-3 text-sm"
            style={{ color: 'var(--brand-accent)', backgroundColor: 'rgba(242,95,92,0.1)' }}>
            {error}
          </div>
        )}

        {/* ── Pill switch filter ───────────────────────────────────── */}
        <div
          className="flex justify-center px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="radiogroup"
          aria-label={t('stepSearch.filterLabel')}
        >
          <div
            className="inline-flex rounded-full p-0.5 gap-0"
            style={{ backgroundColor: 'var(--bg-card)' }}>
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
                className="px-5 py-1.5 text-sm font-medium rounded-full transition-all duration-150 cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)',
                  backgroundColor: filter === opt.value ? 'var(--brand-primary)' : 'transparent',
                  color: filter === opt.value ? '#ffffff' : 'var(--text-muted)',
                  boxShadow: filter === opt.value ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                }}
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
            <div className="px-4 py-2 text-xs border-b"
              style={{
                color: '#eab308',
                backgroundColor: 'rgba(234,179,8,0.1)',
                borderColor: 'var(--border-subtle)',
              }}>
              {t('stepSearch.exclusionNotice')}
            </div>
          )}

          {!isLoading && filteredByVariant.length === 0 && query.trim() && (
            <div className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
              {t('stepSearch.noMatch', { query })}
            </div>
          )}

          {!isLoading && filteredByVariant.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
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
      className="w-full text-left px-4 py-3 transition-colors cursor-pointer border-b last:border-b-0 group"
      style={{
        borderColor: 'var(--border-subtle)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-card)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium truncate"
          style={{
            color: 'var(--text-main)',
            fontFamily: 'var(--font-heading)',
            fontSize: '0.95rem',
          }}>
          {step.name}
        </span>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
          style={{
            fontFamily: 'var(--font-ui)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-muted)',
          }}>
          v{step.version}
        </span>
      </div>
      <p className="mt-0.5 text-sm line-clamp-2"
        style={{
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
        }}>
        {step.description}
      </p>
      {/* Step variant label */}
      <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wider"
        style={{
          color: step.variant === 'output_formatter' ? 'var(--text-muted)' : 'var(--brand-primary)',
          fontFamily: 'var(--font-ui)',
        }}>
        {step.variant === 'output_formatter' ? 'Output' : 'Processor'}
      </span>
    </button>
  )
}

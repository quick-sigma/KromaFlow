/**
 * Pipeline Editor column.
 *
 * Enforces the same pipeline rules as the backend:
 * 1. At least one Processor step.
 * 2. Exactly one OutputFormatter step (no duplicates).
 * 3. The OutputFormatter must always be the last step.
 *
 * Displays a column with an "Add New Step" button (primary variant) that
 * opens a Notion-style floating search bar to browse available steps from
 * the API. Each step in the pipeline can be deleted or configured.
 *
 * Supports saving/loading pipelines via localStorage.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiChevronDown, FiPlus, FiGlobe } from 'react-icons/fi'
import Button from './Button'
import StepSearch from './StepSearch'
import StepConfigDialog from './StepConfigDialog'
import SavePipelineDialog from './SavePipelineDialog'
import PipelineFlowGraph from './PipelineFlowGraph'
import { usePipelineStore } from '../stores/pipeline'
import { useQueueStore } from '../stores/processing-queue'
import type { StepInfo, StepVariant } from '../stores/steps'

// ── Local types ──────────────────────────────────────────────────────────────

export type PipelineStep = {
  step: StepInfo
  config: Record<string, unknown>
}

type SavedPipeline = {
  name: string
  steps: PipelineStep[]
  savedAt: string
}

const STORAGE_KEY = 'pipeline-editor-saved'

// ── Default config from schema ────────────────────────────────────────────────

function buildDefaultConfig(schema: Record<string, unknown>): Record<string, unknown> {
  const defs = schema.$defs as Record<string, unknown> | undefined
  const properties = schema.properties as Record<string, unknown> | undefined
  if (!properties) return {}

  const config: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(properties)) {
    config[key] = resolveDefault(prop, defs)
  }
  return config
}

function resolveDefault(
  schema: unknown,
  defs?: Record<string, unknown>,
): unknown {
  if (typeof schema !== 'object' || schema === null) return null

  const s = schema as Record<string, unknown>

  // anyOf with null → get the non-null default
  if (Array.isArray(s.anyOf)) {
    const nonNull = s.anyOf.find(
      (alt: unknown) =>
        typeof alt === 'object' &&
        alt !== null &&
        (alt as Record<string, unknown>).type !== 'null',
    )
    if (nonNull) {
      return resolveDefault(nonNull, defs)
    }
  }

  if (s.default !== undefined) return s.default

  // Resolve $ref
  if (s.$ref && defs) {
    const defKey = (s.$ref as string).replace('#/$defs/', '')
    const def = defs[defKey] as Record<string, unknown> | undefined
    if (def) return resolveDefault(def, defs)
  }

  // Object with properties → build nested defaults
  if (s.type === 'object' && s.properties) {
    const nested: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      nested[k] = resolveDefault(v, defs)
    }
    return nested
  }

  return null
}

// ── Load / save helpers ───────────────────────────────────────────────────────

function loadSavedPipelines(): SavedPipeline[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedPipeline[]
  } catch {
    return []
  }
}

function persistSavedPipelines(pipelines: SavedPipeline[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pipelines))
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PipelineEditor() {
  const { t, i18n } = useTranslation()
  const [isSearchOpen, setSearchOpen] = useState(false)

  // Initialise local state from the persisted global pipeline store.
  // By the time this component mounts the hydration gate in App.tsx has
  // already restored all store state from IndexedDB, so we read the
  // persisted steps directly here.
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(() => {
    return usePipelineStore.getState().steps
  })
  const [configuringIndex, setConfiguringIndex] = useState<number | null>(null)

  // ── Pipeline save / load state ──────────────────────────────────────
  const [pipelineName, setPipelineName] = useState('')
  const [savedPipelines, setSavedPipelines] = useState<SavedPipeline[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isSaveModalOpen, setSaveModalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load saved pipelines from localStorage on mount
  useEffect(() => {
    setSavedPipelines(loadSavedPipelines())
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  // Check if there's already an output formatter in the pipeline
  const hasFormatter = useMemo(
    () => pipelineSteps.some((ps) => ps.step.variant === 'output_formatter'),
    [pipelineSteps],
  )

  // ── Add step ──────────────────────────────────────────────────────
  function handleSelect(step: StepInfo) {
    const defaultConfig = buildDefaultConfig(
      step.config_schema as Record<string, unknown>,
    )

    setPipelineSteps((prev) => {
      // Block: no duplicate step IDs (same step twice)
      if (prev.some((ps) => ps.step.id === step.id)) {
        return prev
      }

      // Block: no duplicate output formatters
      if (
        step.variant === 'output_formatter' &&
        prev.some((ps) => ps.step.variant === 'output_formatter')
      ) {
        return prev
      }

      const entry: PipelineStep = { step, config: defaultConfig }

      // Output formatter → always goes at the end
      if (step.variant === 'output_formatter') {
        return [...prev, entry]
      }

      // Processor → insert before the existing output formatter
      const formatterIndex = prev.findIndex(
        (ps) => ps.step.variant === 'output_formatter',
      )
      if (formatterIndex !== -1) {
        const copy = [...prev]
        copy.splice(formatterIndex, 0, entry)
        return copy
      }

      // No output formatter yet → simple append
      return [...prev, entry]
    })
  }

  // ── Delete step ────────────────────────────────────────────────────
  function handleDelete(index: number) {
    setPipelineSteps((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Configure step ─────────────────────────────────────────────────
  function handleOpenConfig(index: number) {
    setConfiguringIndex(index)
  }

  function handleSaveConfig(config: Record<string, unknown>) {
    if (configuringIndex === null) return
    setPipelineSteps((prev) =>
      prev.map((ps, i) =>
        i === configuringIndex ? { ...ps, config } : ps,
      ),
    )
    setConfiguringIndex(null)
  }

  // ── Save pipeline ──────────────────────────────────────────────────
  function handleSavePipeline() {
    if (pipelineSteps.length === 0) return
    setSaveModalOpen(true)
  }

  function handleSavePipelineConfirm(name: string) {
    setSaveModalOpen(false)

    let finalName = name.trim()
    if (!finalName) {
      // Auto-generate a unique name
      const base = t('pipelineEditor.untitledPipeline')
      const existing = savedPipelines.filter((s) =>
        s.name.startsWith(base),
      )
      finalName =
        existing.length === 0 ? base : `${base} ${existing.length + 1}`
    }

    const saved: SavedPipeline = {
      name: finalName,
      steps: pipelineSteps,
      savedAt: new Date().toISOString(),
    }

    const updated = [
      ...savedPipelines.filter((s) => s.name !== finalName),
      saved,
    ]
    persistSavedPipelines(updated)
    setSavedPipelines(updated)
    setPipelineName(finalName)
    setDropdownOpen(false)
  }

  // ── Load pipeline ──────────────────────────────────────────────────
  function handleLoadPipeline(name: string) {
    const saved = savedPipelines.find((s) => s.name === name)
    if (!saved) return

    setPipelineSteps(saved.steps)
    setPipelineName(saved.name)
    setDropdownOpen(false)
  }

  // ── Delete saved pipeline ──────────────────────────────────────────
  function handleDeleteSavedPipeline(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = savedPipelines.filter((s) => s.name !== name)
    persistSavedPipelines(updated)
    setSavedPipelines(updated)
  }

  // ── Exclude from search — no duplicate variants or IDs ──────────────
  const excludeVariants: StepVariant[] = useMemo(
    () => (hasFormatter ? ['output_formatter'] : []),
    [hasFormatter],
  )

  const excludeStepIds: string[] = useMemo(
    () => pipelineSteps.map((ps) => ps.step.id),
    [pipelineSteps],
  )

  // ── Disable editing while processing ──────────────────────────────
  const isProcessing = useQueueStore((s) =>
    Object.values(s.entries).some(
      (e) => e.status === 'enqueued' || e.status === 'processing',
    ),
  )

  const configuringStep =
    configuringIndex !== null ? pipelineSteps[configuringIndex] : null

  // ── Sync pipeline steps to global store for image processing ─────
  const setPipelineStoreSteps = usePipelineStore((s) => s.setSteps)
  useEffect(() => {
    setPipelineStoreSteps(pipelineSteps)
  }, [pipelineSteps, setPipelineStoreSteps])

  return (
    <div
      className="w-80 shrink-0 flex flex-col max-h-screen"
      style={{
        backgroundColor: 'var(--bg-main)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-sm uppercase tracking-wider"
          style={{
            color: 'var(--text-main)',
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            letterSpacing: '0.05em',
          }}>
          {t('pipelineEditor.header')}
        </h2>
        <button
          type="button"
          onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors cursor-pointer text-xs"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
          aria-label="Switch language"
        >
          <FiGlobe className="w-3.5 h-3.5" />
          <span>{i18n.language === 'en' ? 'EN' : 'ES'}</span>
        </button>
      </div>

      {/* ── Pipeline dropdown ─────────────────────────────────────── */}
      <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer
                       focus-within:border-[var(--brand-primary)] hover:border-[var(--brand-primary)]"
            style={{
              backgroundColor: 'rgba(21, 21, 21, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              borderRadius: '8px',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.9rem',
              fontWeight: 400,
            }}
          >
            <span className="truncate">
              {pipelineName || t('pipelineEditor.loadPipeline')}
            </span>
            <FiChevronDown
              className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-20 rounded-lg shadow-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {savedPipelines.length === 0 ? (
                <div className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {t('pipelineEditor.noSavedPipelines')}
                </div>
              ) : (
                savedPipelines.map((sp) => (
                  <div
                    key={sp.name}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => handleLoadPipeline(sp.name)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <span className="truncate">{sp.name}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedPipeline(sp.name, e)}
                      className="shrink-0 p-0.5 rounded transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--brand-accent)'
                        e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                      aria-label={t('pipelineEditor.confirmDelete', {
                        name: sp.name,
                      })}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Pipeline flow graph ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {pipelineSteps.length === 0 && (
          <p className="text-sm text-center py-8 px-3" style={{ color: 'var(--text-muted)' }}>
            {t('pipelineEditor.emptyState')}
          </p>
        )}
        <PipelineFlowGraph
          steps={pipelineSteps}
          onDelete={handleDelete}
          onConfigure={handleOpenConfig}
        />
      </div>

      {/* ── Bottom buttons: Add Step + Save ───────────────────────── */}
      <div className="px-6 py-4 pb-6 border-t grid grid-cols-2 gap-3"
        style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="relative group/tooltip">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setSearchOpen(true)}
            className="w-full px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
            style={{
              border: '1.5px solid var(--brand-primary)',
              color: 'var(--brand-primary)',
              background: 'transparent',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) {
                e.currentTarget.style.background = 'var(--brand-primary)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (!isProcessing) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--brand-primary)'
              }
            }}
          >
            <FiPlus className="w-4 h-4" />
            {t('pipelineEditor.addStep')}
          </button>
          {isProcessing && (
            <div
              role="tooltip"
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                         px-3 py-1.5 text-white text-xs rounded-lg
                         shadow-lg whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100
                         transition-opacity pointer-events-none z-50"
              style={{ backgroundColor: 'var(--bg-main)' }}
            >
              <div
                className="absolute top-full left-1/2 -translate-x-1/2
                            border-4 border-transparent"
                style={{ borderTopColor: 'var(--bg-main)' }}
              />
              {t('queue.pipelineDisabledTooltip')}
            </div>
          )}
          {!isProcessing && !hasFormatter && (
            <div
              role="tooltip"
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                         px-3 py-1.5 text-white text-xs rounded-lg
                         shadow-lg whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100
                         transition-opacity pointer-events-none z-50"
              style={{ backgroundColor: 'var(--bg-main)' }}
            >
              <div
                className="absolute top-full left-1/2 -translate-x-1/2
                            border-4 border-transparent"
                style={{ borderTopColor: 'var(--bg-main)' }}
              />
              {t('pipelineEditor.missingOutputTooltip')}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={pipelineSteps.length === 0 || isProcessing}
          onClick={handleSavePipeline}
          className="w-full px-4 py-2 rounded-lg text-white transition-all duration-200 cursor-pointer
                     disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--brand-primary)',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.9rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => {
            if (!(pipelineSteps.length === 0 || isProcessing)) {
              e.currentTarget.style.filter = 'brightness(1.15)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none'
          }}
        >
          {t('pipelineEditor.save')}
        </button>
      </div>

      {/* ── Floating search overlay ───────────────────────────────── */}
      {isSearchOpen && (
        <StepSearch
          onSelect={handleSelect}
          onClose={() => setSearchOpen(false)}
          excludeVariants={excludeVariants}
          excludeStepIds={excludeStepIds}
        />
      )}

      {/* ── Configuration dialog ──────────────────────────────────── */}
      {configuringStep && (
        <StepConfigDialog
          step={configuringStep.step}
          initialConfig={configuringStep.config}
          onSave={handleSaveConfig}
          onClose={() => setConfiguringIndex(null)}
        />
      )}

      {/* ── Save pipeline dialog ─────────────────────────────────── */}
      {isSaveModalOpen && (
        <SavePipelineDialog
          currentName={pipelineName}
          onSave={handleSavePipelineConfirm}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </div>
  )
}

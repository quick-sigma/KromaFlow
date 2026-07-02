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
import { FiChevronDown } from 'react-icons/fi'
import Button from './Button'
import StepSearch from './StepSearch'
import StepConfigDialog from './StepConfigDialog'
import PipelineFlowGraph from './PipelineFlowGraph'
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
  const { t } = useTranslation()
  const [isSearchOpen, setSearchOpen] = useState(false)
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])
  const [configuringIndex, setConfiguringIndex] = useState<number | null>(null)

  // ── Pipeline save / load state ──────────────────────────────────────
  const [pipelineName, setPipelineName] = useState('')
  const [savedPipelines, setSavedPipelines] = useState<SavedPipeline[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
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

    let name = pipelineName.trim()
    if (!name) {
      // Auto-generate a unique name
      const base = t('pipelineEditor.untitledPipeline')
      const existing = savedPipelines.filter((s) =>
        s.name.startsWith(base),
      )
      name = existing.length === 0 ? base : `${base} ${existing.length + 1}`
    }

    const saved: SavedPipeline = {
      name,
      steps: pipelineSteps,
      savedAt: new Date().toISOString(),
    }

    const updated = [
      ...savedPipelines.filter((s) => s.name !== name),
      saved,
    ]
    persistSavedPipelines(updated)
    setSavedPipelines(updated)
    setPipelineName(name)
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

  const configuringStep =
    configuringIndex !== null ? pipelineSteps[configuringIndex] : null

  return (
    <div className="w-80 shrink-0 bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t('pipelineEditor.header')}
        </h2>
      </div>

      {/* ── Pipeline dropdown ─────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-gray-700">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-gray-700/50 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
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
            <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
              {savedPipelines.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  {t('pipelineEditor.noSavedPipelines')}
                </div>
              ) : (
                savedPipelines.map((sp) => (
                  <div
                    key={sp.name}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => handleLoadPipeline(sp.name)}
                  >
                    <span className="truncate">{sp.name}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedPipeline(sp.name, e)}
                      className="shrink-0 p-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
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
          <p className="text-sm text-gray-500 text-center py-8 px-3">
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
      <div className="p-3 border-t border-gray-700 grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          onClick={() => setSearchOpen(true)}
        >
          {t('pipelineEditor.addStep')}
        </Button>
        <Button
          variant="primary"
          disabled={pipelineSteps.length === 0}
          onClick={handleSavePipeline}
        >
          {t('pipelineEditor.save')}
        </Button>
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
    </div>
  )
}

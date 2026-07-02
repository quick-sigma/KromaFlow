/**
 * PipelineFlowGraph — a beautiful vertical graph representation of the pipeline.
 *
 * Layering (bottom to top):
 *   Layer 1 — Connector lines between nodes
 *   Layer 3 — Node cards (on top of everything)
 *
 * The output node is terminal — it has no connector after it.
 */

import { useMemo } from 'react'

import { useTranslation } from 'react-i18next'
import {
  FiCpu,
  FiFileText,
  FiTrash2,
  FiSettings,
} from 'react-icons/fi'
import type { StepInfo } from '../stores/steps'
import type { PipelineStep } from './PipelineEditor'

// ── Props ────────────────────────────────────────────────────────────────────

type PipelineFlowGraphProps = {
  steps: PipelineStep[]
  onDelete: (index: number) => void
  onConfigure: (index: number) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PipelineFlowGraph({
  steps,
  onDelete,
  onConfigure,
}: PipelineFlowGraphProps) {
  if (steps.length === 0) return null

  return (
    <div className="py-6">
      {steps.map((ps, index) => {
        const isLast = index === steps.length - 1
        const isFormatter = ps.step.variant === 'output_formatter'

        return (
          <div key={`${ps.step.id}-${index}`}>
            {/* ── Layer 3: Node card (top) ──────────────────── */}
            <div className="relative z-10">
              <FlowNode
                step={ps.step}
                index={index}
                isFormatter={isFormatter}
                onDelete={() => onDelete(index)}
                onConfigure={() => onConfigure(index)}
              />
            </div>

            {/* ── Layer 1: Connector line (bottom) ──────────── */}
            {/* Only between nodes, never after the last one */}
            {!isLast && (
              <div className="relative z-0 flex justify-center py-2">
                <div className="w-0.5 h-10 bg-gradient-to-b from-blue-500/40 to-blue-500/10 rounded-full" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── FlowNode ─────────────────────────────────────────────────────────────────

function FlowNode({
  step,
  index,
  isFormatter,
  onDelete,
  onConfigure,
}: {
  step: StepInfo
  index: number
  isFormatter: boolean
  onDelete: () => void
  onConfigure: () => void
}) {
  const { t } = useTranslation()

  const accentBorder = isFormatter
    ? 'border-l-emerald-500'
    : 'border-l-blue-500'

  const accentBg = isFormatter
    ? 'bg-emerald-500/10'
    : 'bg-blue-500/10'

  const iconBg = isFormatter
    ? 'bg-emerald-500/20 text-emerald-400'
    : 'bg-blue-500/20 text-blue-400'

  const stepLabel = isFormatter
    ? 'Output'
    : `Step ${index + 1}`

  const hasConfigOptions = useMemo(() => {
    const properties = (step.config_schema as Record<string, unknown>)?.properties as Record<string, unknown> | undefined
    return properties ? Object.keys(properties).length > 0 : false
  }, [step.config_schema])

  return (
    <div
      className={`
        bg-gray-800/80 rounded-xl border border-gray-700
        border-l-4 ${accentBorder}
        px-4 py-3 mx-2
        transition-shadow duration-300
        hover:shadow-lg hover:shadow-${isFormatter ? 'emerald' : 'blue'}-500/5
      `}
    >
      {/* Step number / type badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Icon */}
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${accentBg}`}
          >
            {isFormatter ? (
              <FiFileText className="w-3.5 h-3.5" />
            ) : (
              <FiCpu className="w-3.5 h-3.5" />
            )}
          </div>

          {/* Name */}
          <span className="text-sm font-semibold text-white truncate">
            {step.name}
          </span>
        </div>

        {/* Badge */}
        <span
          className={`
            shrink-0 text-[10px] font-mono font-medium
            px-1.5 py-0.5 rounded-full
            ${isFormatter
              ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
              : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
            }
          `}
        >
          {stepLabel}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-1.5">
        {step.description}
      </p>

      {/* Actions row — always visible (no hover dependency for mobile) */}
      <div className="flex items-center justify-end gap-1">
        {/* Configure — disabled when step has no configurable options */}
        {hasConfigOptions ? (
          <button
            type="button"
            onClick={onConfigure}
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
            aria-label={t('stepConfig.configure', { name: step.name })}
          >
            <FiSettings className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span
            className="p-1.5 rounded-lg text-gray-600 cursor-not-allowed"
            aria-label={`${step.name} has no configuration options`}
          >
            <FiSettings className="w-3.5 h-3.5 opacity-40" />
          </span>
        )}

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          aria-label={`${t('miniatureOptions.remove')} ${step.name}`}
        >
          <FiTrash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

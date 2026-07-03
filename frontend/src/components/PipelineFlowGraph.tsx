/**
 * PipelineFlowGraph — a beautiful vertical graph representation of the pipeline.
 *
 * Cyber-Amethyst themed step cards with drag-and-drop reordering via
 * Framer Motion's Reorder component.
 *
 * Constraints enforced by the parent PipelineEditor:
 *   - The base node (if present) is always first.
 *   - The output formatter (if present) is always last.
 *   - Processor nodes can be freely reordered in between.
 *
 * Layering (bottom to top):
 *   Layer 1 — Connector lines between nodes
 *   Layer 3 — Node cards (on top of everything)
 */

import { useMemo } from 'react'
import { Reorder } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  FiCpu,
  FiFileText,
  FiShare2,
  FiTrash2,
  FiSettings,
  FiMove,
  FiLock,
} from 'react-icons/fi'
import type { StepInfo } from '../stores/steps'
import type { PipelineStep } from './PipelineEditor'

// ── Props ────────────────────────────────────────────────────────────────────

type PipelineFlowGraphProps = {
  steps: PipelineStep[]
  onDelete: (index: number) => void
  onConfigure: (index: number) => void
  /** Called by Reorder.Group when the user drops a dragged item. */
  onReorder: (steps: PipelineStep[]) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PipelineFlowGraph({
  steps,
  onDelete,
  onConfigure,
  onReorder,
}: PipelineFlowGraphProps) {
  if (steps.length === 0) return null

  return (
    <div className="py-4">
      <Reorder.Group
        axis="y"
        values={steps}
        onReorder={onReorder}
        as="div"
        style={{ padding: 0, margin: 0 }}
      >
        {steps.map((ps, index) => {
          const isLast = index === steps.length - 1
          const isFormatter = ps.step.variant === 'output_formatter'
          const isDistribution = ps.step.variant === 'distribution'
          const isActive = index === 0 && !isFormatter && !isDistribution
          const canDrag = !ps.step.is_base_node && !isFormatter && !isDistribution

          return (
            <Reorder.Item
              key={ps.step.id}
              value={ps}
              as="div"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                position: 'relative',
              }}
              whileDrag={{
                scale: 1.02,
                boxShadow: '0 8px 30px rgba(102, 44, 145, 0.35)',
                borderRadius: '10px',
                zIndex: 50,
              }}
            >
              {/* ── Node card ──────────────────────────────────── */}
              <FlowNode
                step={ps.step}
                index={index}
                isFormatter={isFormatter}
                isDistribution={isDistribution}
                isActive={isActive}
                canDrag={canDrag}
                onDelete={() => onDelete(index)}
                onConfigure={() => onConfigure(index)}
              />

              {/* ── Connector line (between nodes) ─────────────── */}
              {!isLast && (
                <div className="flex justify-center py-2">
                  <div className="w-0.5 h-8 bg-gradient-to-b from-[var(--brand-primary)]/40 to-[var(--brand-primary)]/10 rounded-full" />
                </div>
              )}
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
    </div>
  )
}

// ── FlowNode ─────────────────────────────────────────────────────────────────

function FlowNode({
  step,
  index,
  isFormatter,
  isDistribution,
  isActive,
  canDrag,
  onDelete,
  onConfigure,
}: {
  step: StepInfo
  index: number
  isFormatter: boolean
  isDistribution: boolean
  isActive: boolean
  canDrag: boolean
  onDelete: () => void
  onConfigure: () => void
}) {
  const { t } = useTranslation()

  const iconBg = isFormatter
    ? 'bg-[var(--brand-primary)]/20 text-[var(--text-muted)]'
    : isDistribution
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]'

  const stepLabel = isFormatter
    ? 'Output'
    : isDistribution
      ? 'Distribution'
      : step.is_base_node
        ? 'Base'
        : `Step ${index + 1}`

  const hasConfigOptions = useMemo(() => {
    const properties = (step.config_schema as Record<string, unknown>)?.properties as Record<string, unknown> | undefined
    return properties ? Object.keys(properties).length > 0 : false
  }, [step.config_schema])

  return (
    <div
      data-active={isActive ? 'true' : 'false'}
      className={`
        group relative
        bg-[var(--bg-card)] backdrop-blur-sm rounded-[10px]
        px-4 py-3 mx-2
        flex items-start gap-3
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
        ${
          isActive
            ? 'shadow-[0_0_15px_rgba(102,44,145,0.3)]'
            : 'hover:shadow-[0_0_10px_rgba(102,44,145,0.15)]'
        }
        transition-shadow duration-300
      `}
    >
      {/* ── Drag handle / lock indicator ──────────────────────── */}
      <div className="flex items-center justify-center w-5 h-full pt-1 shrink-0 select-none">
        {canDrag ? (
          <FiMove className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-70 transition-opacity duration-200" />
        ) : (
          <FiLock className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-40" />
        )}
      </div>

      {/* ── Active indicator bar ──────────────────────────────── */}
      {isActive && (
        <div
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
          style={{
            backgroundColor: 'var(--brand-primary)',
          }}
        />
      )}

      {/* ── Card body ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Step number / type badge */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {/* Icon */}
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
            >
              {isFormatter ? (
                <FiFileText className="w-3.5 h-3.5" />
              ) : isDistribution ? (
                <FiShare2 className="w-3.5 h-3.5" />
              ) : (
                <FiCpu className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Name — Varela heading */}
            <span
              className="truncate"
              style={{
                color: 'var(--text-main)',
                fontFamily: 'var(--font-heading)',
                fontSize: '0.95rem',
              }}
            >
              {step.name}
            </span>
          </div>

          {/* Badge */}
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full ${
              isFormatter
                ? 'bg-transparent border text-[var(--text-muted)]'
                : isDistribution
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-white bg-[var(--brand-primary)]'
            }`}
            style={{
              borderColor: isFormatter ? 'var(--text-muted)' : undefined,
              fontFamily: 'var(--font-ui)',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {stepLabel}
          </span>
        </div>

        {/* Description */}
        <p
          className="line-clamp-2 mb-1.5"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            lineHeight: 1.4,
          }}
        >
          {step.description}
        </p>

        {/* Actions row */}
        <div className="flex items-center justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity duration-200">
          {/* Configure */}
          {hasConfigOptions ? (
            <button
              type="button"
              onClick={onConfigure}
              className="p-1.5 rounded-lg transition-colors cursor-pointer hover:text-[var(--text-muted)]"
              style={{ color: 'var(--text-muted)' }}
              aria-label={t('stepConfig.configure', { name: step.name })}
            >
              <FiSettings className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span
              className="p-1.5 rounded-lg cursor-not-allowed opacity-40"
              style={{ color: 'var(--text-muted)' }}
              aria-label={`${step.name} has no configuration options`}
            >
              <FiSettings className="w-3.5 h-3.5" />
            </span>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors cursor-pointer hover:text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/10"
            style={{ color: 'var(--text-muted)' }}
            aria-label={`${t('miniatureOptions.remove')} ${step.name}`}
          >
            <FiTrash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

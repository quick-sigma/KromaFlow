import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiTrash2 } from 'react-icons/fi'
import Miniature from './Miniature'
import type { QueueStatus } from '../stores/processing-queue'

type MiniatureImageWithOptionsProps = {
  src: string
  alt: string
  fileName?: string
  fileSize?: string
  /** Image dimensions as "W×H" string (e.g. "1920×1080") */
  dimensions?: string
  onRemove: () => void
  onProcess: () => void
  /** Whether the pipeline has an output formatter step */
  hasOutputFormatter?: boolean
  /** Called when the image thumbnail is clicked */
  onView?: () => void
  /** Current queue status of this image */
  queueStatus?: QueueStatus
  /** Processing progress (0–100) */
  progress?: number
}

/**
 * Horizontal file row for an image in the "To Process" queue.
 * Handles idle, completed, and failed states.
 */
export default function MiniatureImageWithOptions({
  src,
  alt,
  fileName,
  fileSize,
  dimensions: initialDimensions,
  onRemove,
  onProcess,
  hasOutputFormatter = true,
  onView,
  queueStatus = 'idle',
  progress = 0,
}: MiniatureImageWithOptionsProps) {
  const { t } = useTranslation()
  const canProcess = hasOutputFormatter
  // Detect dimensions from the image if not already provided
  const [autoDimensions, setAutoDimensions] = useState<string | undefined>(initialDimensions)
  const dimensions = initialDimensions || autoDimensions
  const handleDimensions = useCallback((w: number, h: number) => {
    if (!initialDimensions) setAutoDimensions(`${w}×${h}`)
  }, [initialDimensions])

  // ── Render based on queue status ────────────────────────────────────

  if (queueStatus === 'completed') {
    return (
      <div className="flex items-center justify-between p-3 mb-2 rounded-lg"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        {/* Left: thumbnail + meta */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Miniature
            src={src}
            alt={alt}
            onDimensions={handleDimensions}
            onClick={onView}
            className={onView ? 'cursor-pointer' : ''}
            tabIndex={onView ? 0 : undefined}
            onKeyDown={
              onView
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onView()
                    }
                  }
                : undefined
            }
          />
          <div className="min-w-0">
            <p className="truncate"
              style={{
                color: 'var(--text-main)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}>
              {fileName || alt}
            </p>
            {(fileSize || dimensions) && (
              <p className="mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                {[dimensions, fileSize].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            type="button"
            onClick={onRemove}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--brand-accent)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label={t('miniatureOptions.remove')}
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-3 py-1.5 text-white rounded-md transition-all duration-200 cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed"

            style={{
              backgroundColor: 'var(--brand-primary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              if (canProcess) e.currentTarget.style.filter = 'brightness(1.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none'
            }}
          >
            {t('queue.reprocess')}
          </button>
        </div>
      </div>
    )
  }

  if (queueStatus === 'failed') {
    return (
      <div className="flex items-center justify-between p-3 mb-2 rounded-lg"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        {/* Left: thumbnail + meta */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Miniature
            src={src}
            alt={alt}
            onDimensions={handleDimensions}
            onClick={onView}
            className={onView ? 'cursor-pointer opacity-60' : 'opacity-60'}
            tabIndex={onView ? 0 : undefined}
            onKeyDown={
              onView
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onView()
                    }
                  }
                : undefined
            }
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>
              {fileName || alt}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: 'var(--brand-accent)' }}>
                {t('queue.failed')}
              </span>
              {dimensions && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {dimensions}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            type="button"
            onClick={onRemove}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--brand-accent)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label={t('miniatureOptions.remove')}
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-3 py-1.5 text-white rounded-md transition-all duration-200 cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--brand-primary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              if (canProcess) e.currentTarget.style.filter = 'brightness(1.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none'
            }}
          >
            {t('queue.reprocess')}
          </button>
        </div>
      </div>
    )
  }

  // ── Default: idle state with Remove + Process buttons ──────────────
  return (
    <div className="flex items-center justify-between p-3 mb-2 rounded-lg"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {/* Left: thumbnail + meta */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Miniature
          src={src}
          alt={alt}
          onDimensions={handleDimensions}
          onClick={onView}
          className={onView ? 'cursor-pointer' : ''}
          tabIndex={onView ? 0 : undefined}
          onKeyDown={
            onView
              ? (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onView()
                  }
                }
              : undefined
          }
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>
            {fileName || alt}
          </p>
          {(fileSize || dimensions) && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {[dimensions, fileSize].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <button
          type="button"
          onClick={onRemove}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--brand-accent)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          aria-label={t('miniatureOptions.remove')}
        >
          <FiTrash2 className="w-4 h-4" />
        </button>
        <div className="relative group/tooltip">
          <button
            type="button"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-3 py-1.5 text-white rounded-md transition-all duration-200 cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--brand-primary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              if (canProcess) e.currentTarget.style.filter = 'brightness(1.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none'
            }}
          >
            {t('miniatureOptions.process')}
          </button>
          {!canProcess && (
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
              {t('miniatureOptions.processDisabledTooltip')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

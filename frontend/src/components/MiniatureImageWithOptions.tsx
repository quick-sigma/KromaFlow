import { useTranslation } from 'react-i18next'
import Button from './Button'
import Miniature from './Miniature'
import type { QueueStatus } from '../stores/processing-queue'

type MiniatureImageWithOptionsProps = {
  src: string
  alt: string
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

export default function MiniatureImageWithOptions({
  src,
  alt,
  onRemove,
  onProcess,
  hasOutputFormatter = true,
  onView,
  queueStatus = 'idle',
  progress = 0,
}: MiniatureImageWithOptionsProps) {
  const { t } = useTranslation()
  const canProcess = hasOutputFormatter

  // ── Render based on queue status ────────────────────────────────────

  if (queueStatus === 'enqueued') {
    return (
      <div className="flex flex-col items-center gap-2 shrink-0 snap-start">
        <Miniature
          src={src}
          alt={alt}
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
        <div className="flex gap-1.5 items-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-600/20 border border-yellow-600/40 rounded-lg">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            <span className="text-xs text-yellow-400 font-medium">
              {t('queue.enqueued')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (queueStatus === 'processing') {
    return (
      <div className="flex flex-col items-center gap-2 shrink-0 snap-start">
        <Miniature
          src={src}
          alt={alt}
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
        <div className="flex flex-col gap-1 w-full px-1">
          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
          <span className="text-xs text-blue-400 font-medium text-center">
            {t('queue.processing')} {progress}%
          </span>
        </div>
      </div>
    )
  }

  if (queueStatus === 'completed') {
    return (
      <div className="flex flex-col items-center gap-2 shrink-0 snap-start">
        <Miniature
          src={src}
          alt={alt}
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
        <div className="flex gap-1.5">
          <Button variant="danger" onClick={onRemove} className="px-2.5 py-1 text-xs">
            {t('miniatureOptions.remove')}
          </Button>
          <Button
            variant="primary"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-2.5 py-1 text-xs"
          >
            {t('queue.reprocess')}
          </Button>
        </div>
      </div>
    )
  }

  if (queueStatus === 'failed') {
    return (
      <div className="flex flex-col items-center gap-2 shrink-0 snap-start">
        <Miniature
          src={src}
          alt={alt}
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
        <div className="flex gap-1.5">
          <Button variant="danger" onClick={onRemove} className="px-2.5 py-1 text-xs">
            {t('miniatureOptions.remove')}
          </Button>
          <Button
            variant="primary"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-2.5 py-1 text-xs"
          >
            {t('queue.reprocess')}
          </Button>
        </div>
        {queueStatus === 'failed' && (
          <span className="text-xs text-red-400 truncate max-w-[10rem] text-center">
            {t('queue.failed')}
          </span>
        )}
      </div>
    )
  }

  // ── Default: idle state with Remove + Process buttons ──────────────
  return (
    <div className="flex flex-col items-center gap-2 shrink-0 snap-start">
      <Miniature
        src={src}
        alt={alt}
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
      <div className="flex gap-1.5">
        <Button variant="danger" onClick={onRemove} className="px-2.5 py-1 text-xs">
          {t('miniatureOptions.remove')}
        </Button>
        <div className="relative group/tooltip">
          <Button
            variant="primary"
            disabled={!canProcess}
            onClick={onProcess}
            className="px-2.5 py-1 text-xs"
          >
            {t('miniatureOptions.process')}
          </Button>
          {!canProcess && (
            <div
              role="tooltip"
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                         px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg
                         shadow-lg whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100
                         transition-opacity pointer-events-none z-50"
            >
              <div
                className="absolute top-full left-1/2 -translate-x-1/2
                            border-4 border-transparent border-t-gray-900"
              />
              {t('miniatureOptions.processDisabledTooltip')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

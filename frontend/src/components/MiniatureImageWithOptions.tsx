import { useTranslation } from 'react-i18next'
import Button from './Button'
import Miniature from './Miniature'

type MiniatureImageWithOptionsProps = {
  src: string
  alt: string
  onRemove: () => void
  onProcess: () => void
  /** Whether the pipeline has an output formatter step */
  hasOutputFormatter?: boolean
  /** Called when the image thumbnail is clicked */
  onView?: () => void
}

export default function MiniatureImageWithOptions({
  src,
  alt,
  onRemove,
  onProcess,
  hasOutputFormatter = true,
  onView,
}: MiniatureImageWithOptionsProps) {
  const { t } = useTranslation()

  const canProcess = hasOutputFormatter

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
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

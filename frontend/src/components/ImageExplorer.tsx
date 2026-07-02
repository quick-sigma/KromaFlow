import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export type ImageExplorerImage = {
  id: string
  src: string
  name: string
}

type ImageExplorerProps = {
  images: ImageExplorerImage[]
  initialIndex: number
  onClose: () => void
}

export default function ImageExplorer({
  images,
  initialIndex,
  onClose,
}: ImageExplorerProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  const hasMultiple = images.length > 1

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  const current = images[currentIndex]

  // ── Keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        goNext()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current?.name ?? 'Image explorer'}
    >
      {/* ── Close button ─────────────────────────────────────────── */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10
                   text-white/80 hover:text-white text-3xl leading-none
                   rounded-full hover:bg-white/10 transition-colors"
        aria-label={t('imageExplorer.close')}
      >
        &times;
      </button>

      {/* ── Previous button ──────────────────────────────────────── */}
      {hasMultiple && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center
                     w-12 h-12 text-white/80 hover:text-white text-5xl leading-none
                     rounded-full hover:bg-white/10 transition-colors"
          aria-label={t('imageExplorer.previous')}
        >
          &#8249;
        </button>
      )}

      {/* ── Image ────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-center max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.src}
          alt={current.name}
          className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
          draggable={false}
        />
      </div>

      {/* ── Next button ──────────────────────────────────────────── */}
      {hasMultiple && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center
                     w-12 h-12 text-white/80 hover:text-white text-5xl leading-none
                     rounded-full hover:bg-white/10 transition-colors"
          aria-label={t('imageExplorer.next')}
        >
          &#8250;
        </button>
      )}

      {/* ── Caption ──────────────────────────────────────────────── */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2
                   text-white/80 text-sm bg-black/60 px-4 py-1.5 rounded-full
                   select-none pointer-events-none whitespace-nowrap"
      >
        {current.name}
        {hasMultiple && (
          <span className="ml-2 text-white/50">
            {currentIndex + 1}/{images.length}
          </span>
        )}
      </div>
    </div>
  )
}

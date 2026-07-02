import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiOutlineTrash } from 'react-icons/hi'
import { useImagesStore, type ProcessedImageEntry } from '../stores/images'
import { usePipelineStore } from '../stores/pipeline'
import MiniatureImageWithOptions from './MiniatureImageWithOptions'
import ImageExplorer from './ImageExplorer'
import Miniature from './Miniature'
import Button from './Button'

/**
 * Gallery shelf layout — a section header with a decorative line
 * and a flex-wrap grid of items beneath it.
 */
function GalleryShelf({
  title,
  count,
  clearLabel,
  onClearAll,
  children,
}: {
  title: string
  count: number
  clearLabel?: string
  onClearAll?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="w-full max-w-5xl">
      {/* ── Shelf header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
          {title}
          <span className="ml-2 text-gray-600 font-normal">({count})</span>
        </h2>

        {onClearAll && (
          <button
            onClick={onClearAll}
            className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer p-0.5"
            aria-label={clearLabel}
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}

        <div className="h-px flex-1 bg-gradient-to-r from-gray-700 to-transparent" />
      </div>

      {/* ── Shelf body ────────────────────────────────────────────── */}
      <div className="bg-gray-800/20 rounded-xl p-5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] border border-gray-700/30">
        <div className="flex flex-wrap gap-5">{children}</div>
      </div>
    </section>
  )
}

export default function MiniatureList() {
  const { t } = useTranslation()
  const images = useImagesStore((state) => state.images)
  const processedImages = useImagesStore((state) => state.processedImages)
  const removeImage = useImagesStore((state) => state.removeImage)
  const removeProcessedImage = useImagesStore(
    (state) => state.removeProcessedImage,
  )
  const clearOriginalImages = useImagesStore(
    (state) => state.clearOriginalImages,
  )
  const clearProcessedImages = useImagesStore(
    (state) => state.clearProcessedImages,
  )
  const processImage = useImagesStore((state) => state.processImage)
  const pipelineSteps = usePipelineStore((state) => state.steps)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [selectedProcessedId, setSelectedProcessedId] =
    useState<string | null>(null)

  const hasOutputFormatter = pipelineSteps.some(
    (s) => s.step.variant === 'output_formatter',
  )

  const hasImages = images.length > 0 || processedImages.length > 0

  if (!hasImages) {
    return (
      <p className="text-gray-500 text-center text-lg">
        {t('miniatureList.noImages')}
      </p>
    )
  }

  // Determine which image is selected for the explorer
  const allViewable = [
    ...images.map((img) => ({ ...img, group: 'original' as const })),
    ...processedImages.map((img) => ({ ...img, group: 'processed' as const })),
  ]

  const selectedViewableId = selectedImageId ?? selectedProcessedId
  const selectedIndex = selectedViewableId
    ? allViewable.findIndex((img) => img.id === selectedViewableId)
    : -1

  function handleCloseExplorer() {
    setSelectedImageId(null)
    setSelectedProcessedId(null)
  }

  return (
    <div className="w-full flex flex-col items-center gap-8">
      {/* ── To Process gallery ────────────────────────────────────── */}
      {images.length > 0 && (
        <GalleryShelf
          title={t('miniatureList.toProcess')}
          count={images.length}
          onClearAll={clearOriginalImages}
          clearLabel={t('miniatureList.clearToProcess')}
        >
          {images.map((entry) => (
            <MiniatureImageWithOptions
              key={entry.id}
              src={entry.src}
              alt={entry.name}
              onRemove={() => removeImage(entry.id)}
              onProcess={() => processImage(entry.id)}
              hasOutputFormatter={hasOutputFormatter}
              onView={() => setSelectedImageId(entry.id)}
            />
          ))}
        </GalleryShelf>
      )}

      {/* ── Processed gallery ─────────────────────────────────────── */}
      {processedImages.length > 0 && (
        <GalleryShelf
          title={t('miniatureList.processed')}
          count={processedImages.length}
          onClearAll={clearProcessedImages}
          clearLabel={t('miniatureList.clearProcessed')}
        >
          {processedImages.map((entry) => (
            <ProcessedImageCard
              key={entry.id}
              entry={entry}
              onRemove={() => removeProcessedImage(entry.id)}
              onView={() => setSelectedProcessedId(entry.id)}
            />
          ))}
        </GalleryShelf>
      )}

      {/* ── Image Explorer overlay ────────────────────────────────── */}
      {selectedIndex !== -1 && (
        <ImageExplorer
          images={allViewable.map((img) => ({
            id: img.id,
            src: img.src,
            name: img.name,
          }))}
          initialIndex={selectedIndex}
          onClose={handleCloseExplorer}
        />
      )}
    </div>
  )
}

/**
 * A compact card for a processed image — no Process button,
 * just a thumbnail, name, and Remove button.
 */
function ProcessedImageCard({
  entry,
  onRemove,
  onView,
}: {
  entry: ProcessedImageEntry
  onRemove: () => void
  onView: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,
          jsx-a11y/no-static-element-interactions */}
      <Miniature
        src={entry.src}
        alt={entry.name}
        onClick={onView}
        className="cursor-pointer"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onView()
          }
        }}
      />
      <span className="text-xs text-gray-400 truncate max-w-[12rem] text-center">
        {entry.name}
      </span>
      <Button variant="danger" onClick={onRemove}>
        {t('miniatureOptions.remove')}
      </Button>
    </div>
  )
}

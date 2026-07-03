import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiOutlineTrash } from 'react-icons/hi'
import { FiTrash2, FiDownload } from 'react-icons/fi'
import JSZip from 'jszip'
import { useImagesStore, type ProcessedImageEntry } from '../stores/images'
import { usePipelineStore } from '../stores/pipeline'
import { useQueueStore } from '../stores/processing-queue'
import Miniature from './Miniature'
import MiniatureImageWithOptions from './MiniatureImageWithOptions'
import ImageExplorer from './ImageExplorer'
import type { QueueStatus } from '../stores/processing-queue'

/**
 * FileRow — a horizontal file item row used in both
 * "To Process" and "Processed" sections.
 */
function FileRow({
  thumbnailSrc,
  fileName,
  fileSize,
  statusBadge,
  actions,
}: {
  thumbnailSrc: string
  fileName: string
  fileSize?: string
  statusBadge?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between p-3 mb-2 rounded-lg transition-colors"
      style={{
        backgroundColor: 'var(--bg-card)',
      }}
    >
      {/* Left: thumbnail + meta */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img
          src={thumbnailSrc}
          alt={fileName}
          className="w-[70px] h-[70px] rounded object-contain shrink-0"
          style={{ maxWidth: '70px' }}
        />
        <div className="min-w-0">
          <p
            className="truncate"
            style={{
              color: 'var(--text-main)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {fileName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {fileSize && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {fileSize}
              </span>
            )}
            {statusBadge}
          </div>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {actions}
      </div>
    </div>
  )
}

/**
 * Queue section — vertical stack of file rows with a header.
 */
function QueueSection({
  title,
  count,
  clearLabel,
  onClearAll,
  headerActions,
  children,
}: {
  title: string
  count: number
  clearLabel?: string
  onClearAll?: () => void
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="w-full max-w-5xl">
      {/* ── Section header ────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-4"
      >
        <h2
          className="uppercase"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-heading)',
            fontSize: '0.9rem',
            letterSpacing: '0.06em',
          }}
        >
          {title}
          <span className="ml-2" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            ({count})
          </span>
        </h2>

        <div className="flex items-center gap-2">
          {headerActions}

          {onClearAll && (
            <>
              <div
                className="w-px h-4"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              />
              <button
                onClick={onClearAll}
                className="p-1.5 rounded transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--brand-accent)'
                  e.currentTarget.style.backgroundColor = 'rgba(242,95,92,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                aria-label={clearLabel}
              >
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Queue container ───────────────────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {children}
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
  const pipelineSteps = usePipelineStore((state) => state.steps)

  // Queue store
  const queueEntries = useQueueStore((state) => state.entries)
  const enqueueImage = useQueueStore((state) => state.enqueueImage)
  const enqueueAllImages = useQueueStore((state) => state.enqueueAllImages)
  const resetEntry = useQueueStore((state) => state.resetEntry)
  const connected = useQueueStore((state) => state.connected)

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [selectedProcessedId, setSelectedProcessedId] =
    useState<string | null>(null)

  const hasOutputFormatter = pipelineSteps.some(
    (s) => s.step.variant === 'output_formatter',
  )

  // Determine if any image is currently being processed or queued
  const isQueueing = Object.values(queueEntries).some(
    (e) => e.status === 'enqueued' || e.status === 'processing',
  )

  const [isDownloading, setIsDownloading] = useState(false)

  const hasImages = images.length > 0 || processedImages.length > 0

  if (!hasImages) {
    return (
      <p className="text-center text-lg" style={{ color: 'var(--text-muted)' }}>
        {t('miniatureList.noImages')}
      </p>
    )
  }

  // Determine which image is selected for the explorer.
  const allViewable: ({ id: string; src: string; name: string; group: 'original' | 'processed' })[] = [
    ...images.map((img) => ({ id: img.id, src: img.src, name: img.name, group: 'original' as const })),
    ...processedImages.map((img) => ({ id: img.id, src: img.thumbnailUrl ?? img.downloadUrl, name: img.name, group: 'processed' as const })),
  ]

  const selectedViewableId = selectedImageId ?? selectedProcessedId
  const selectedIndex = selectedViewableId
    ? allViewable.findIndex((img) => img.id === selectedViewableId)
    : -1

  function handleCloseExplorer() {
    setSelectedImageId(null)
    setSelectedProcessedId(null)
  }

  function handleProcessImage(imageId: string) {
    resetEntry(imageId)
    enqueueImage(imageId)
  }

  function handleReprocessImage(imageId: string) {
    resetEntry(imageId)
    enqueueImage(imageId)
  }

  // ── Helper to format file size ──────────────────────────────────
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Download All handler ──────────────────────────────────────────
  async function handleDownloadAll() {
    setIsDownloading(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder('processed')!

      // Fetch every processed image blob in parallel
      const blobs = await Promise.allSettled(
        processedImages.map(async (entry) => {
          const res = await fetch(entry.downloadUrl)
          if (!res.ok) throw new Error(`${entry.name}: HTTP ${res.status}`)
          const blob = await res.blob()
          return { name: entry.name, blob }
        }),
      )

      // Add successful fetches to the zip
      for (const result of blobs) {
        if (result.status === 'fulfilled') {
          folder.file(result.value.name, result.value.blob)
        } else {
          console.warn('[MiniatureList] Skipped download:', result.reason)
        }
      }

      if (Object.keys(folder.files).length === 0) {
        throw new Error('No files could be downloaded')
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'processed-images.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      console.error('[MiniatureList] Download All failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── To Process gallery ──────────────────────────────────── */}
        {images.length > 0 && (
          <QueueSection
            title={t('miniatureList.toProcess')}
            count={images.length}
            onClearAll={clearOriginalImages}
            clearLabel={t('miniatureList.clearToProcess')}
            headerActions={
              <button
                onClick={enqueueAllImages}
                disabled={isQueueing || !connected}
                className="px-4 py-2 text-white rounded-md transition-all duration-200 cursor-pointer
                           disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
                onMouseEnter={(e) => {
                  if (!isQueueing && connected) {
                    e.currentTarget.style.filter = 'brightness(1.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'none'
                }}
              >
                {isQueueing
                  ? t('queue.enqueuing')
                  : t('miniatureOptions.processAll')}
              </button>
            }
          >
            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1 space-y-0">
              {images.map((entry) => {
                const qEntry = queueEntries[entry.id]
                const qStatus = qEntry?.status ?? 'idle'
                const progress = qEntry?.progress ?? 0

                return (
                  <div key={entry.id}>
                    {qStatus === 'enqueued' ? (
                      <FileRow
                        thumbnailSrc={entry.src}
                        fileName={entry.name}
                        fileSize={entry.size ? formatSize(entry.size) : undefined}
                        statusBadge={
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: 'rgba(234,179,8,0.15)',
                              color: '#eab308',
                              border: '1px solid rgba(234,179,8,0.3)',
                            }}
                          >
                            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                            {t('queue.enqueued')}
                          </span>
                        }
                        actions={
                          <button
                            type="button"
                            onClick={() => removeImage(entry.id)}
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
                        }
                      />
                    ) : qStatus === 'processing' ? (
                      <FileRow
                        thumbnailSrc={entry.src}
                        fileName={entry.name}
                        fileSize={entry.size ? formatSize(entry.size) : undefined}
                        statusBadge={
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${Math.max(0, Math.min(100, progress))}%`,
                                  background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))',
                                }}
                              />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--brand-primary)' }}>
                              {t('queue.processing')} {progress}%
                            </span>
                          </div>
                        }
                        actions={<span />}
                      />
                    ) : (
                      <MiniatureImageWithOptions
                        key={entry.id}
                        src={entry.src}
                        alt={entry.name}
                        fileName={entry.name}
                        fileSize={entry.size ? formatSize(entry.size) : undefined}
                        onRemove={() => removeImage(entry.id)}
                        onProcess={() => handleProcessImage(entry.id)}
                        hasOutputFormatter={hasOutputFormatter}
                        onView={() => setSelectedImageId(entry.id)}
                        queueStatus={qStatus}
                        progress={progress}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </QueueSection>
        )}

        {/* ── Processed gallery ───────────────────────────────────── */}
        {processedImages.length > 0 && (
          <QueueSection
            title={t('miniatureList.processed')}
            count={processedImages.length}
            onClearAll={clearProcessedImages}
            clearLabel={t('miniatureList.clearProcessed')}
            headerActions={
              <button
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className="px-4 py-2 text-white rounded-md transition-all duration-200 cursor-pointer
                           disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
                onMouseEnter={(e) => {
                  if (!isDownloading) {
                    e.currentTarget.style.filter = 'brightness(1.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'none'
                }}
              >
                <span className="flex items-center gap-1.5">
                  <FiDownload className="w-3.5 h-3.5" />
                  {isDownloading
                    ? t('miniatureOptions.downloading')
                    : t('miniatureOptions.downloadAll')}
                </span>
              </button>
            }
          >
            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1 space-y-0">
              {processedImages.map((entry) => (
                <ProcessedImageCard
                  key={entry.id}
                  entry={entry}
                  onRemove={() => removeProcessedImage(entry.id)}
                  onView={() => setSelectedProcessedId(entry.id)}
                />
              ))}
            </div>
          </QueueSection>
        )}
      </div>

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
 * A compact horizontal row for a processed image — thumbnail, name,
 * Download, and Remove buttons.
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
  const [dimensions, setDimensions] = useState<string | null>(null)

  async function handleDownload() {
    try {
      const response = await fetch(entry.downloadUrl)
      if (!response.ok)
        throw new Error(`Download failed: ${response.status}`)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      console.error('[MiniatureList] Download failed:', err)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDimensions = useCallback((w: number, h: number) => {
    setDimensions(`${w}×${h}`)
  }, [])

  return (
    <div
      className="flex items-center justify-between p-3 mb-2 rounded-lg transition-colors"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {/* Left: thumbnail + meta */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Miniature
          src={entry.thumbnailUrl ?? entry.downloadUrl}
          alt={entry.name}
          onDimensions={handleDimensions}
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
        <div className="min-w-0">
          <p
            className="truncate"
            style={{
              color: 'var(--text-main)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {entry.name}
          </p>
          <p className="mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
            {[dimensions, entry.size ? formatSize(entry.size) : ''].filter(Boolean).join(' · ')}
          </p>
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
          onClick={handleDownload}
          className="px-3 py-1.5 text-white rounded-md transition-all duration-200 cursor-pointer"
          style={{
            backgroundColor: 'var(--brand-primary)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: '0.8rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none'
          }}
        >
          <span className="flex items-center gap-1.5">
            <FiDownload className="w-3.5 h-3.5" />
            {t('miniatureOptions.download')}
          </span>
        </button>
      </div>
    </div>
  )
}

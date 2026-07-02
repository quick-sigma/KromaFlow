import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImagesStore } from '../stores/images'
import { usePipelineStore } from '../stores/pipeline'
import MiniatureImageWithOptions from './MiniatureImageWithOptions'
import ImageExplorer from './ImageExplorer'

export default function MiniatureList() {
  const { t } = useTranslation()
  const images = useImagesStore((state) => state.images)
  const removeImage = useImagesStore((state) => state.removeImage)
  const processImage = useImagesStore((state) => state.processImage)
  const pipelineSteps = usePipelineStore((state) => state.steps)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  const hasOutputFormatter = pipelineSteps.some(
    (s) => s.step.variant === 'output_formatter',
  )

  if (images.length === 0) {
    return (
      <p className="text-gray-400 text-lg">{t('miniatureList.noImages')}</p>
    )
  }

  const selectedIndex = selectedImageId
    ? images.findIndex((img) => img.id === selectedImageId)
    : -1

  return (
    <>
      <div className="flex flex-wrap gap-6 justify-center">
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
      </div>

      {selectedIndex !== -1 && (
        <ImageExplorer
          images={images.map((img) => ({
            id: img.id,
            src: img.src,
            name: img.name,
          }))}
          initialIndex={selectedIndex}
          onClose={() => setSelectedImageId(null)}
        />
      )}
    </>
  )
}

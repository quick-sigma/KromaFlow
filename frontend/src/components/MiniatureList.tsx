import { useTranslation } from 'react-i18next'
import { useImagesStore } from '../stores/images'
import MiniatureImageWithOptions from './MiniatureImageWithOptions'

export default function MiniatureList() {
  const { t } = useTranslation()
  const images = useImagesStore((state) => state.images)
  const removeImage = useImagesStore((state) => state.removeImage)
  const processImage = useImagesStore((state) => state.processImage)

  if (images.length === 0) {
    return (
      <p className="text-gray-400 text-lg">{t('miniatureList.noImages')}</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-6 justify-center">
      {images.map((entry) => (
        <MiniatureImageWithOptions
          key={entry.id}
          src={entry.src}
          alt={entry.name}
          onRemove={() => removeImage(entry.id)}
          onProcess={() => processImage(entry.id)}
        />
      ))}
    </div>
  )
}

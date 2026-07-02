import { useTranslation } from 'react-i18next'
import Button from './Button'
import Miniature from './Miniature'

type MiniatureImageWithOptionsProps = {
  src: string
  alt: string
  onRemove: () => void
  onProcess: () => void
}

export default function MiniatureImageWithOptions({
  src,
  alt,
  onRemove,
  onProcess,
}: MiniatureImageWithOptionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3">
      <Miniature src={src} alt={alt} />
      <div className="flex gap-2">
        <Button variant="danger" onClick={onRemove}>
          {t('miniatureOptions.remove')}
        </Button>
        <Button variant="primary" onClick={onProcess}>
          {t('miniatureOptions.process')}
        </Button>
      </div>
    </div>
  )
}

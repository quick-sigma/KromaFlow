import { useRef, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

const IMAGE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
].join(',')

type FileInputProps = {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
} & Omit<ComponentProps<'input'>, 'type' | 'accept' | 'multiple' | 'onChange'>

export default function FileInput({ onChange, ...props }: FileInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        data-testid="file-input"
        onChange={onChange}
        className="hidden"
        {...props}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition cursor-pointer"
      >
        {t('fileInput.loadImages')}
      </button>
    </div>
  )
}

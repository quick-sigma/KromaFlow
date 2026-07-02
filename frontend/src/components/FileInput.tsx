import { useRef, useState, useEffect, type ComponentProps } from 'react'
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

const IMAGE_MIME_TYPES = new Set(IMAGE_ACCEPT.split(','))

type FileInputProps = {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
} & Omit<ComponentProps<'input'>, 'type' | 'accept' | 'multiple' | 'onChange'>

export default function FileInput({ onChange, ...props }: FileInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let dragCounter = 0

    function handleDragEnter(e: Event) {
      const dt = (e as DragEvent).dataTransfer
      if (dt?.types.includes('Files')) {
        dragCounter++
        setIsDragging(true)
      }
    }

    function handleDragOver(e: Event) {
      e.preventDefault()
    }

    function handleDragLeave() {
      dragCounter--
      if (dragCounter <= 0) {
        dragCounter = 0
        setIsDragging(false)
      }
    }

    function handleDrop(e: Event) {
      e.preventDefault()
      dragCounter = 0
      setIsDragging(false)

      const dt = (e as DragEvent).dataTransfer
      if (!dt?.files.length) return

      const imageFiles = Array.from(dt.files).filter((f) =>
        IMAGE_MIME_TYPES.has(f.type),
      )
      if (!imageFiles.length) return

      const nativeInput = inputRef.current
      if (nativeInput) {
        const fileList = {
          length: imageFiles.length,
          item(index: number) {
            return imageFiles[index] ?? null
          },
          [Symbol.iterator]() {
            return imageFiles[Symbol.iterator]()
          },
        } as unknown as FileList
        for (let i = 0; i < imageFiles.length; i++) {
          Object.defineProperty(fileList, i, {
            value: imageFiles[i],
            enumerable: true,
          })
        }
        Object.defineProperty(nativeInput, 'files', {
          value: fileList,
          writable: true,
        })
        nativeInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange?.(e)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        data-testid="file-input"
        onChange={handleChange}
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

      {isDragging && (
        <div
          data-testid="drop-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/80 backdrop-blur-sm"
        >
          <p className="text-2xl font-bold text-white">
            {t('fileInput.loadImages')}
          </p>
        </div>
      )}
    </div>
  )
}

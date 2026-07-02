import { useRef, useState, useEffect, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { HiUpload } from 'react-icons/hi'

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
    <div className="w-full max-w-xl mx-auto">
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

      {/* ── Dropzone ─────────────────────────────────────────────── */}
      <div
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={0}
        data-testid="file-dropzone"
        className={`
          relative w-full border-2 border-dashed rounded-xl p-10
          flex flex-col items-center justify-center gap-3
          cursor-pointer select-none
          transition-all duration-200
          ${
            isDragging
              ? 'border-blue-400 bg-blue-900/20 shadow-[inset_0_0_30px_rgba(59,130,246,0.15)]'
              : 'border-gray-600 hover:border-gray-500 bg-gray-800/20 shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)] hover:bg-gray-800/30'
          }
        `}
      >
        <HiUpload
          className={`text-5xl transition-colors duration-200 ${
            isDragging ? 'text-blue-400' : 'text-gray-500'
          }`}
        />
        <p className="text-gray-300 text-lg font-medium">
          {t('fileInput.loadOrDrag')}
        </p>
        <p className="text-gray-500 text-sm">
          {t('fileInput.supportedFormats')}
        </p>
      </div>

      {/* ── Full-screen drag overlay ─────────────────────────────── */}
      {isDragging && (
        <div
          data-testid="drop-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4">
            <HiUpload className="text-6xl text-white/80" />
            <p className="text-2xl font-bold text-white">
              {t('fileInput.loadOrDrag')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

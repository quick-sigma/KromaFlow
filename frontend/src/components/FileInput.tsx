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
          relative w-full border-2 border-dashed rounded-xl py-8
          flex flex-col items-center justify-center gap-3
          cursor-pointer select-none
          transition-all duration-200
          ${
            isDragging
              ? 'shadow-[inset_0_0_30px_rgba(102,44,145,0.15)]'
              : 'hover:shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)]'
          }
        `}
        style={{
          borderColor: isDragging ? 'var(--brand-primary)' : 'var(--border-subtle)',
          backgroundColor: isDragging ? 'rgba(102,44,145,0.08)' : 'transparent',
        }}
      >
        <HiUpload
          className="text-5xl transition-colors duration-200"
          style={{ color: isDragging ? 'var(--brand-accent)' : 'var(--brand-accent)' }}
        />
        <p style={{
            color: 'var(--text-main)',
            fontFamily: 'var(--font-heading)',
            fontSize: '1.35rem',
            fontWeight: 400,
          }}>
          {t('fileInput.loadOrDrag')}
        </p>
        <p style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
          }}>
          {t('fileInput.supportedFormats')}
        </p>
      </div>

      {/* ── Full-screen drag overlay ─────────────────────────────── */}
      {isDragging && (
        <div
          data-testid="drop-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(102, 44, 145, 0.8)' }}
        >
          <div className="flex flex-col items-center gap-4">
            <HiUpload className="text-6xl" style={{ color: 'var(--brand-accent)' }} />
            <p className="text-2xl font-bold text-white">
              {t('fileInput.loadOrDrag')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

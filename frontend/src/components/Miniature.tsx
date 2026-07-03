import { useCallback, useRef, useState, type ComponentProps } from 'react'

type MiniatureProps = {
  src: string
  alt: string
  /** Optional callback fired once the image dimensions are known */
  onDimensions?: (w: number, h: number) => void
} & Omit<ComponentProps<'img'>, 'src' | 'alt'>

export default function Miniature({
  src,
  alt,
  className = '',
  onDimensions,
  ...props
}: MiniatureProps) {
  const [dimensions, setDimensions] = useState<string | null>(null)
  const reported = useRef(false)

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w > 0 && h > 0) {
        setDimensions(`${w}×${h}`)
        if (onDimensions && !reported.current) {
          reported.current = true
          onDimensions(w, h)
        }
      }
    },
    [onDimensions],
  )

  return (
    <img
      src={src}
      alt={alt}
      onLoad={handleLoad}
      title={dimensions ?? alt}
      className={`w-[70px] h-[70px] rounded object-contain shrink-0 ${className}`}
      style={{ border: '1px solid var(--border-subtle)' }}
      {...props}
    />
  )
}

import { type ComponentProps } from 'react'

type MiniatureProps = {
  src: string
  alt: string
} & Omit<ComponentProps<'img'>, 'src' | 'alt'>

export default function Miniature({
  src,
  alt,
  className = '',
  ...props
}: MiniatureProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={`max-w-48 max-h-48 rounded-lg border border-gray-600 object-contain ${className}`}
      {...props}
    />
  )
}

import { type ComponentProps } from 'react'

type ButtonVariant = 'primary' | 'danger'

type ButtonProps = {
  variant?: ButtonVariant
} & ComponentProps<'button'>

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed',
  danger:
    'bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 disabled:cursor-not-allowed',
}

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-lg text-white font-medium transition ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

import { type ComponentProps } from 'react'

type ButtonVariant = 'primary' | 'danger'

type ButtonProps = {
  variant?: ButtonVariant
} & ComponentProps<'button'>

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary hover:brightness-110 disabled:bg-brand-primary/40 disabled:cursor-not-allowed',
  danger:
    'bg-brand-accent hover:brightness-110 disabled:bg-brand-accent/40 disabled:cursor-not-allowed',
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
      className={`px-4 py-2 rounded-lg text-white transition ${variantStyles[variant]} ${className}`}
      style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '0.8rem' }}
      {...props}
    >
      {children}
    </button>
  )
}

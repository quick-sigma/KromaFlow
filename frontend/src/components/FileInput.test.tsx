import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import FileInput from './FileInput'

const acceptedFormats = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
]

describe('FileInput', () => {
  it('renders the load images button in English by default', () => {
    render(<FileInput />)
    expect(screen.getByText('Load Images')).toBeInTheDocument()
  })

  it('renders a file input element', () => {
    render(<FileInput />)
    expect(screen.getByTestId('file-input')).toBeInTheDocument()
  })

  it('accepts image formats (PNG, JPEG, AVIF, etc)', () => {
    render(<FileInput />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const acceptValue = input.accept

    for (const format of acceptedFormats) {
      expect(acceptValue).toContain(format)
    }
  })

  it('allows multiple file selection', () => {
    render(<FileInput />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    expect(input.multiple).toBe(true)
  })

  it('shows Spanish text when language is set to es', async () => {
    await act(async () => {
      await i18n.changeLanguage('es')
    })
    render(<FileInput />)
    expect(screen.getByText('Cargar Archivos')).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('calls onChange when files are selected', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<FileInput onChange={handleChange} />)
    const input = screen.getByTestId('file-input')

    const file = new File([''], 'test.png', { type: 'image/png' })
    await user.upload(input, file)

    expect(handleChange).toHaveBeenCalledOnce()
    expect(handleChange).toHaveBeenCalledWith(expect.any(Object))
  })

  it('forwards additional props to the input element', () => {
    render(<FileInput id="my-image-input" className="custom-class" />)
    const input = screen.getByTestId('file-input')
    expect(input).toHaveAttribute('id', 'my-image-input')
  })
})

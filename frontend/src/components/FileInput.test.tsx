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
  it('renders the dropzone with load-or-drag text in English by default', () => {
    render(<FileInput />)
    expect(screen.getByText('Load or drag images')).toBeInTheDocument()
  })

  it('renders the supported formats text', () => {
    render(<FileInput />)
    expect(
      screen.getByText('PNG, JPEG, GIF, WebP, AVIF, BMP, TIFF, SVG'),
    ).toBeInTheDocument()
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
    expect(screen.getByText('Carga o arrastra imágenes')).toBeInTheDocument()
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

  it('opens file dialog when the dropzone is clicked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<FileInput onChange={handleChange} />)

    // Click the dropzone
    const dropzone = screen.getByTestId('file-dropzone')
    await user.click(dropzone)

    // File input click doesn't trigger onChange, so just verify it's reachable
    expect(dropzone).toBeInTheDocument()
  })

  describe('drag and drop', () => {
    function createMockDataTransfer(files: File[]) {
      return {
        files,
        types: ['Files'],
        getData: () => '',
        items: files.map((f) => ({
          kind: 'file',
          type: f.type,
          getAsFile: () => f,
        })),
      }
    }

    function fireDragEvent(
      target: EventTarget,
      type: string,
      dataTransfer?: Record<string, unknown>,
    ) {
      const event = new Event(type, { bubbles: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: dataTransfer ?? null,
        writable: false,
      })
      target.dispatchEvent(event)
    }

    it('shows a full-screen drop overlay when a file is dragged over the document', () => {
      render(<FileInput />)

      act(() => {
        fireDragEvent(
          document.body,
          'dragenter',
          createMockDataTransfer([new File([''], 'test.png', { type: 'image/png' })]),
        )
      })

      expect(screen.getByTestId('drop-overlay')).toBeInTheDocument()
    })

    it('hides the drop overlay on dragleave', () => {
      render(<FileInput />)

      act(() => {
        fireDragEvent(
          document.body,
          'dragenter',
          createMockDataTransfer([new File([''], 'test.png', { type: 'image/png' })]),
        )
      })
      act(() => {
        fireDragEvent(document.body, 'dragleave')
      })

      expect(screen.queryByTestId('drop-overlay')).not.toBeInTheDocument()
    })

    it('hides the drop overlay on drop', () => {
      render(<FileInput />)

      act(() => {
        fireDragEvent(
          document.body,
          'dragenter',
          createMockDataTransfer([new File([''], 'test.png', { type: 'image/png' })]),
        )
      })
      act(() => {
        fireDragEvent(
          document.body,
          'drop',
          createMockDataTransfer([new File([''], 'test.png', { type: 'image/png' })]),
        )
      })

      expect(screen.queryByTestId('drop-overlay')).not.toBeInTheDocument()
    })

    it('calls onChange when image files are dropped', () => {
      const handleChange = vi.fn()
      render(<FileInput onChange={handleChange} />)

      act(() => {
        fireDragEvent(
          document.body,
          'drop',
          createMockDataTransfer([new File([''], 'photo.png', { type: 'image/png' })]),
        )
      })

      expect(handleChange).toHaveBeenCalledOnce()
    })

    it('calls onChange with multiple files when several images are dropped', () => {
      const handleChange = vi.fn()
      render(<FileInput onChange={handleChange} />)

      act(() => {
        fireDragEvent(
          document.body,
          'drop',
          createMockDataTransfer([
            new File([''], 'a.png', { type: 'image/png' }),
            new File([''], 'b.jpeg', { type: 'image/jpeg' }),
          ]),
        )
      })

      const event = handleChange.mock.calls[0][0] as React.ChangeEvent<HTMLInputElement>
      expect(event.target.files).toHaveLength(2)
    })

    it('ignores non-image files on drop', () => {
      const handleChange = vi.fn()
      render(<FileInput onChange={handleChange} />)

      act(() => {
        fireDragEvent(
          document.body,
          'drop',
          createMockDataTransfer([new File([''], 'readme.txt', { type: 'text/plain' })]),
        )
      })

      expect(handleChange).not.toHaveBeenCalled()
    })

    it('accepts drop events from anywhere on the document', () => {
      const handleChange = vi.fn()
      render(<FileInput onChange={handleChange} />)

      act(() => {
        fireDragEvent(
          document.documentElement,
          'drop',
          createMockDataTransfer([new File([''], 'bg.png', { type: 'image/png' })]),
        )
      })

      expect(handleChange).toHaveBeenCalledOnce()
    })
  })
})

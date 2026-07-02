import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import MiniatureImageWithOptions from './MiniatureImageWithOptions'
import { act } from 'react'

describe('MiniatureImageWithOptions', () => {
  const testSrc = 'blob:http://localhost/test-image'

  it('renders the miniature with the given src', () => {
    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
      />,
    )
    const img = screen.getByRole('img', { name: 'Preview' })
    expect(img).toHaveAttribute('src', testSrc)
  })

  it('renders a Remove button with danger variant', () => {
    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
      />,
    )
    const removeButton = screen.getByRole('button', { name: 'Remove' })
    expect(removeButton).toBeInTheDocument()
    expect(removeButton.className).toContain('bg-red-600')
  })

  it('renders a Process button with primary variant', () => {
    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
      />,
    )
    const processButton = screen.getByRole('button', { name: 'Process' })
    expect(processButton).toBeInTheDocument()
    expect(processButton.className).toContain('bg-blue-600')
  })

  it('calls onRemove when the Remove button is clicked', async () => {
    const user = userEvent.setup()
    const handleRemove = vi.fn()
    const handleProcess = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={handleRemove}
        onProcess={handleProcess}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(handleRemove).toHaveBeenCalledOnce()
    expect(handleProcess).not.toHaveBeenCalled()
  })

  it('calls onProcess when the Process button is clicked', async () => {
    const user = userEvent.setup()
    const handleRemove = vi.fn()
    const handleProcess = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={handleRemove}
        onProcess={handleProcess}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Process' }))
    expect(handleProcess).toHaveBeenCalledOnce()
    expect(handleRemove).not.toHaveBeenCalled()
  })

  it('disables the Process button and shows tooltip when hasOutputFormatter is false', async () => {
    const user = userEvent.setup()
    const handleRemove = vi.fn()
    const handleProcess = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={handleRemove}
        onProcess={handleProcess}
        hasOutputFormatter={false}
      />,
    )

    const processButton = screen.getByRole('button', { name: 'Process' })
    expect(processButton).toBeDisabled()

    // Tooltip should be in the DOM
    expect(
      screen.getByRole('tooltip', {
        name: 'Add an output step to your pipeline before processing images',
      }),
    ).toBeInTheDocument()

    // Clicking the disabled button should not call onProcess
    await user.click(processButton)
    expect(handleProcess).not.toHaveBeenCalled()
  })

  it('enables the Process button when hasOutputFormatter is true', () => {
    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
        hasOutputFormatter={true}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Process' }),
    ).toBeEnabled()
  })

  it('calls onView when the miniature image is clicked', async () => {
    const user = userEvent.setup()
    const handleView = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
        onView={handleView}
      />,
    )

    const img = screen.getByRole('img', { name: 'Preview' })
    await user.click(img)
    expect(handleView).toHaveBeenCalledOnce()
  })

  it('does not call onView when onView is not provided and image is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
      />,
    )

    const img = screen.getByRole('img', { name: 'Preview' })
    await user.click(img)
    // Just checking no error occurs — the click should be a no-op
    expect(img).toBeInTheDocument()
  })

  it('calls onView when Enter key is pressed on the image', async () => {
    const user = userEvent.setup()
    const handleView = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
        onView={handleView}
      />,
    )

    const img = screen.getByRole('img', { name: 'Preview' })
    img.focus()
    await user.keyboard('{Enter}')
    expect(handleView).toHaveBeenCalledOnce()
  })

  it('calls onView when Space key is pressed on the image', async () => {
    const user = userEvent.setup()
    const handleView = vi.fn()

    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Preview"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
        onView={handleView}
      />,
    )

    const img = screen.getByRole('img', { name: 'Preview' })
    img.focus()
    await user.keyboard(' ')
    expect(handleView).toHaveBeenCalledOnce()
  })

  it('shows Spanish text when language is set to es', async () => {
    await act(async () => {
      await i18n.changeLanguage('es')
    })
    render(
      <MiniatureImageWithOptions
        src={testSrc}
        alt="Vista previa"
        onRemove={vi.fn()}
        onProcess={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })
})

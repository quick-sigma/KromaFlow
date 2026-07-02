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

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageExplorer, { type ImageExplorerImage } from './ImageExplorer'

const images: ImageExplorerImage[] = [
  { id: '1', src: 'blob:http://localhost/img1', name: 'sunset.png' },
  { id: '2', src: 'blob:http://localhost/img2', name: 'portrait.jpeg' },
  { id: '3', src: 'blob:http://localhost/img3', name: 'vacation.png' },
]

function renderImageExplorer(initialIndex = 0) {
  const onClose = vi.fn()
  const result = render(
    <ImageExplorer
      images={images}
      initialIndex={initialIndex}
      onClose={onClose}
    />,
  )
  return { onClose, ...result }
}

describe('ImageExplorer', () => {
  it('renders the image at the given initial index', () => {
    renderImageExplorer(0)
    const img = screen.getByRole('img', { name: 'sunset.png' })
    expect(img).toHaveAttribute('src', 'blob:http://localhost/img1')
  })

  it('renders a close button', () => {
    renderImageExplorer()
    expect(
      screen.getByRole('button', { name: 'Close image explorer' }),
    ).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderImageExplorer()

    await user.click(
      screen.getByRole('button', { name: 'Close image explorer' }),
    )

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the Escape key is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderImageExplorer()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking the backdrop', async () => {
    const user = userEvent.setup()
    const { onClose } = renderImageExplorer()

    // Click on the dialog backdrop (not on the image or buttons)
    const dialog = screen.getByRole('dialog')
    await user.click(dialog)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when clicking the image itself', async () => {
    const user = userEvent.setup()
    const { onClose } = renderImageExplorer()

    const img = screen.getByRole('img', { name: 'sunset.png' })
    await user.click(img)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the image name in the caption', () => {
    renderImageExplorer(1)
    expect(screen.getByText('portrait.jpeg')).toBeInTheDocument()
  })

  it('shows image counter in the caption when there are multiple images', () => {
    renderImageExplorer(0)
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('shows previous and next navigation buttons when there are multiple images', () => {
    renderImageExplorer()
    expect(
      screen.getByRole('button', { name: 'Previous image' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Next image' }),
    ).toBeInTheDocument()
  })

  it('does not show navigation buttons when there is only one image', () => {
    render(
      <ImageExplorer
        images={[images[0]]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Previous image' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Next image' }),
    ).not.toBeInTheDocument()
  })

  it('does not show counter when there is only one image', () => {
    render(
      <ImageExplorer
        images={[images[0]]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })

  it('navigates to the next image when the next button is clicked', async () => {
    const user = userEvent.setup()
    renderImageExplorer(1) // Start on portrait.jpeg (index 1)

    await user.click(screen.getByRole('button', { name: 'Next image' }))

    // Should now show vacation.png (index 2)
    const img = screen.getByRole('img', { name: 'vacation.png' })
    expect(img).toBeInTheDocument()
  })

  it('navigates to the previous image when the prev button is clicked', async () => {
    const user = userEvent.setup()
    renderImageExplorer(1) // Start on portrait.jpeg (index 1)

    await user.click(screen.getByRole('button', { name: 'Previous image' }))

    // Should now show sunset.png (index 0)
    const img = screen.getByRole('img', { name: 'sunset.png' })
    expect(img).toBeInTheDocument()
  })

  it('wraps around when going next from the last image', async () => {
    const user = userEvent.setup()
    renderImageExplorer(2) // Start on vacation.png (last index)

    await user.click(screen.getByRole('button', { name: 'Next image' }))

    // Should wrap to sunset.png (index 0)
    const img = screen.getByRole('img', { name: 'sunset.png' })
    expect(img).toBeInTheDocument()
  })

  it('wraps around when going prev from the first image', async () => {
    const user = userEvent.setup()
    renderImageExplorer(0) // Start on sunset.png (first)

    await user.click(screen.getByRole('button', { name: 'Previous image' }))

    // Should wrap to vacation.png (last index 2)
    const img = screen.getByRole('img', { name: 'vacation.png' })
    expect(img).toBeInTheDocument()
  })

  it('navigates with ArrowRight key', async () => {
    const user = userEvent.setup()
    renderImageExplorer(0)

    await user.keyboard('{ArrowRight}')

    const img = screen.getByRole('img', { name: 'portrait.jpeg' })
    expect(img).toBeInTheDocument()
  })

  it('navigates with ArrowLeft key', async () => {
    const user = userEvent.setup()
    renderImageExplorer(1)

    await user.keyboard('{ArrowLeft}')

    const img = screen.getByRole('img', { name: 'sunset.png' })
    expect(img).toBeInTheDocument()
  })

  it('sets aria-modal on the dialog', () => {
    renderImageExplorer()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
})

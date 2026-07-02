import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImagesStore } from '../stores/images'
import MiniatureList from './MiniatureList'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [], processedImages: [] })
})

describe('MiniatureList', () => {
  it('shows an empty state message when there are no images', () => {
    render(<MiniatureList />)
    expect(screen.getByText('No images loaded')).toBeInTheDocument()
  })

  it('shows the "To Process" section with images', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('sunset.png'),
    ])

    render(<MiniatureList />)

    expect(screen.getByText('To Process')).toBeInTheDocument()
    expect(screen.getByText('(1)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'sunset.png' })).toBeInTheDocument()
  })

  it('does not show "To Process" and "Processed" sections when empty', () => {
    render(<MiniatureList />)

    expect(screen.queryByText('To Process')).not.toBeInTheDocument()
    expect(screen.queryByText('Processed')).not.toBeInTheDocument()
  })

  it('renders all original images in the "To Process" section', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('sunset.png'),
      createMockFile('portrait.jpeg', 'image/jpeg'),
    ])

    render(<MiniatureList />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('shows the "Processed" section when there are processed images', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          src: 'blob:http://localhost/processed',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)

    expect(screen.getByText('Processed')).toBeInTheDocument()
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })

  it('shows both "To Process" and "Processed" sections when both exist', async () => {
    // Add original images
    await useImagesStore.getState().addImages([
      createMockFile('original.png'),
    ])

    // Add processed image
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'original.png',
          src: 'blob:http://localhost/processed',
          name: 'original-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)

    expect(screen.getByText('To Process')).toBeInTheDocument()
    expect(screen.getByText('Processed')).toBeInTheDocument()
  })

  it('opens the ImageExplorer when an image thumbnail is clicked', async () => {
    const user = userEvent.setup()
    await useImagesStore.getState().addImages([
      createMockFile('explore-me.png'),
    ])

    render(<MiniatureList />)

    // Click the image thumbnail
    const img = screen.getByRole('img', { name: 'explore-me.png' })
    await user.click(img)

    // ImageExplorer should be open with the image in fullscreen
    expect(
      screen.getByRole('dialog', { name: 'explore-me.png' }),
    ).toBeInTheDocument()
  })

  it('closes the ImageExplorer when the close button is clicked', async () => {
    const user = userEvent.setup()
    await useImagesStore.getState().addImages([
      createMockFile('close-me.png'),
    ])

    render(<MiniatureList />)

    // Open explorer
    const img = screen.getByRole('img', { name: 'close-me.png' })
    await user.click(img)

    // Close it
    await user.click(
      screen.getByRole('button', { name: 'Close image explorer' }),
    )

    expect(
      screen.queryByRole('dialog', { name: 'close-me.png' }),
    ).not.toBeInTheDocument()
  })

  it('removes an image when its Remove button is clicked', async () => {
    const user = userEvent.setup()
    await useImagesStore.getState().addImages([
      createMockFile('keep.png'),
      createMockFile('delete.png'),
    ])

    render(<MiniatureList />)
    expect(screen.getAllByRole('img')).toHaveLength(2)

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    await user.click(removeButtons[1])

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('alt', 'keep.png')
  })

  // ── Clear-all buttons ────────────────────────────────────────────

  it('shows a clear-all button in the To Process section', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('a.png'),
      createMockFile('b.png'),
    ])
    render(<MiniatureList />)

    expect(
      screen.getByRole('button', { name: 'Clear all images to process' }),
    ).toBeInTheDocument()
  })

  it('shows a clear-all button in the Processed section', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          src: 'blob:http://localhost/p1',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })
    render(<MiniatureList />)

    expect(
      screen.getByRole('button', { name: 'Clear all processed images' }),
    ).toBeInTheDocument()
  })

  it('clears all original images when the To Process trash icon is clicked', async () => {
    const user = userEvent.setup()
    await useImagesStore.getState().addImages([
      createMockFile('one.png'),
      createMockFile('two.png'),
    ])

    render(<MiniatureList />)
    expect(screen.getAllByRole('img')).toHaveLength(2)

    await user.click(
      screen.getByRole('button', { name: 'Clear all images to process' }),
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      screen.getByText('No images loaded'),
    ).toBeInTheDocument()
  })

  // ── Process All button ──────────────────────────────────────────

  it('shows a Process All button in the To Process section', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('a.png'),
      createMockFile('b.png'),
    ])
    render(<MiniatureList />)

    expect(
      screen.getByRole('button', { name: 'Process All' }),
    ).toBeInTheDocument()
  })

  it('shows the Process All button as disabled while processing', async () => {
    useImagesStore.setState({ processingState: 'processing' })
    await useImagesStore.getState().addImages([
      createMockFile('a.png'),
    ])
    render(<MiniatureList />)

    const btn = screen.getByRole('button', { name: /processing/i })
    expect(btn).toBeDisabled()
  })

  it('does not show a Process All button when there are no images', () => {
    render(<MiniatureList />)
    expect(
      screen.queryByRole('button', { name: 'Process All' }),
    ).not.toBeInTheDocument()
  })

  it('does not show a Process All button when there are only processed images', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          src: 'blob:http://localhost/p1',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })
    render(<MiniatureList />)
    expect(
      screen.queryByRole('button', { name: 'Process All' }),
    ).not.toBeInTheDocument()
  })

  it('clears all processed images when the Processed trash icon is clicked', async () => {
    const user = userEvent.setup()
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          src: 'blob:http://localhost/p1',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
        {
          id: 'p2',
          originalId: 'orig2',
          originalName: 'other.png',
          src: 'blob:http://localhost/p2',
          name: 'other-processed.png',
          type: 'image/png',
          size: 200,
          blobKey: 'processed-blob-p2',
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)
    expect(screen.getByText('Processed')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Clear all processed images' }),
    )

    expect(screen.queryByText('Processed')).not.toBeInTheDocument()
    expect(
      screen.getByText('No images loaded'),
    ).toBeInTheDocument()
  })
})

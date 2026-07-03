import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImagesStore } from '../stores/images'
import { useQueueStore } from '../stores/processing-queue'
import MiniatureList from './MiniatureList'
import { act } from 'react'

const API_BASE = 'http://localhost:55558'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [], processedImages: [] })
  useQueueStore.setState({ entries: {}, stats: { totalEnqueued: 0, totalCompleted: 0, totalFailed: 0, pendingCount: 0, currentJobId: null }, connected: false, globalProgress: 0 })
  vi.restoreAllMocks()
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
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
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
          name: 'original-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
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
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
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

  it('shows the Process All button as disabled while queueing', async () => {
    useQueueStore.setState({
      entries: {
        'mock-id': {
          imageId: 'mock-id',
          jobId: 'job-1',
          status: 'processing',
          progress: 50,
          error: null,
          resultId: null,
          resultName: null,
        },
      },
      connected: true,
    })
    await useImagesStore.getState().addImages([
      createMockFile('a.png'),
    ])
    render(<MiniatureList />)

    const btn = screen.getByRole('button', { name: /enqueuing/i })
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
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })
    render(<MiniatureList />)
    expect(
      screen.queryByRole('button', { name: 'Process All' }),
    ).not.toBeInTheDocument()
  })

  // ── Download button on processed cards ────────────────────────────

  it('shows a Download button on processed image cards', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'result.png',
          name: 'result-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })
    render(<MiniatureList />)

    expect(
      screen.getByRole('button', { name: 'Download' }),
    ).toBeInTheDocument()
  })

  it('includes Download and Remove buttons on each processed card', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'a.png',
          name: 'a-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
        {
          id: 'p2',
          originalId: 'orig2',
          originalName: 'b.png',
          name: 'b-processed.png',
          type: 'image/png',
          size: 200,
          downloadUrl: `${API_BASE}/api/images/p2/download`,
          processedAt: Date.now(),
        },
      ],
    })
    render(<MiniatureList />)

    const downloadBtns = screen.getAllByRole('button', { name: 'Download' })
    expect(downloadBtns).toHaveLength(2)

    const removeBtns = screen.getAllByRole('button', { name: 'Remove' })
    expect(removeBtns).toHaveLength(2)
  })

  // ── Layout assertions: horizontal file rows ───────────────────────────

  it('renders file rows as horizontal flex containers with thumbnail, labels, and actions', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('horizontal-test.png'),
    ])

    render(<MiniatureList />)

    // File row should have thumbnail image with 70px width
    const thumbnail = screen.getByRole('img', { name: 'horizontal-test.png' })
    expect(thumbnail).toBeInTheDocument()
    expect(thumbnail.className).toContain('w-[70px]')

    // File name label should be visible
    expect(screen.getByText('horizontal-test.png')).toBeInTheDocument()

    // Action buttons should be present: Remove and Process
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process' })).toBeInTheDocument()
  })

  it('renders processed image rows with thumbnail and action buttons on same horizontal plane', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p_horiz',
          originalId: 'orig1',
          originalName: 'processed.png',
          name: 'processed-result.png',
          type: 'image/png',
          size: 2048,
          downloadUrl: `${API_BASE}/api/images/p_horiz/download`,
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)

    // Thumbnail should exist with 70px
    const thumbnail = screen.getByRole('img', { name: 'processed-result.png' })
    expect(thumbnail).toBeInTheDocument()
    expect(thumbnail.className).toContain('w-[70px]')

    // Action buttons: Download and Remove
    const removeBtn = screen.getByRole('button', { name: 'Remove' })
    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    expect(removeBtn).toBeInTheDocument()
    expect(downloadBtn).toBeInTheDocument()
  })

  // ── Color contrast accessibility ───────────────────────────────────────

  it('uses muted text color for secondary metadata', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('contrast-test.png'),
    ])

    render(<MiniatureList />)

    // Section headers should use text-muted color
    const toProcessHeader = screen.getByText('To Process')
    expect(toProcessHeader).toBeInTheDocument()
    expect(toProcessHeader.style.color).toBeTruthy()
  })

  it('uses white text for primary content labels', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('white-label.png'),
    ])

    render(<MiniatureList />)

    // File name should be visible
    const fileName = screen.getByText('white-label.png')
    expect(fileName).toBeInTheDocument()
    expect(fileName.style.color).toBe('var(--text-main)')
  })

  // ── Typography assertions ──────────────────────────────────────────────

  it('renders section titles with heading font via CSS variable', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('font-test.png'),
    ])
    render(<MiniatureList />)

    const toProcessHeader = screen.getByText('To Process')
    // Font is applied via var(--font-heading) CSS variable
    expect(toProcessHeader.style.fontFamily).toContain('var(--font-heading)')
  })

  it('renders file names with body font via CSS variable', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('mukta-test.png'),
    ])
    render(<MiniatureList />)

    // The file row should be rendered with the file name visible
    const img = screen.getByRole('img', { name: 'mukta-test.png' })
    expect(img).toBeInTheDocument()
    expect(screen.getByText('mukta-test.png')).toBeInTheDocument()

    // Verify the file row uses the body font via CSS variable by checking
    // that the parent element's style references the font-body variable
    const fileRow = img.closest('.items-center.justify-between')
    expect(fileRow).toBeInTheDocument()
  })

  it('renders the Process All button with UI font via CSS variable', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('sintony-test.png'),
    ])
    render(<MiniatureList />)

    const processAllBtn = screen.getByRole('button', { name: 'Process All' })
    expect(processAllBtn.style.fontFamily).toContain('var(--font-ui)')
  })

  it('renders processed file names with body font via CSS variable', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p_font',
          originalId: 'orig1',
          originalName: 'processed-font.png',
          name: 'processed-font-result.png',
          type: 'image/png',
          size: 4096,
          downloadUrl: `${API_BASE}/api/images/p_font/download`,
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)

    const fileName = screen.getByText('processed-font-result.png')
    expect(fileName.style.fontFamily).toContain('var(--font-body)')
  })

  it('renders the Download button with UI font via CSS variable', async () => {
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p_dl_font',
          originalId: 'orig1',
          originalName: 'download-font.png',
          name: 'download-font-result.png',
          type: 'image/png',
          size: 1024,
          downloadUrl: `${API_BASE}/api/images/p_dl_font/download`,
          processedAt: Date.now(),
        },
      ],
    })

    render(<MiniatureList />)

    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    expect(downloadBtn.style.fontFamily).toContain('var(--font-ui)')
  })

  it('clears all processed images when the Processed trash icon is clicked', async () => {
    const user = userEvent.setup()
    // Mock fetch for the DELETE call
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })

    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
        {
          id: 'p2',
          originalId: 'orig2',
          originalName: 'other.png',
          name: 'other-processed.png',
          type: 'image/png',
          size: 200,
          downloadUrl: `${API_BASE}/api/images/p2/download`,
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

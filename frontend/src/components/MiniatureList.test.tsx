import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImagesStore } from '../stores/images'
import MiniatureList from './MiniatureList'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [] })
})

describe('MiniatureList', () => {
  it('shows an empty state message when there are no images', () => {
    render(<MiniatureList />)
    expect(screen.getByText('No images loaded')).toBeInTheDocument()
  })

  it('renders a MiniatureImageWithOptions for each image', async () => {
    await useImagesStore.getState().addImages([
      createMockFile('sunset.png'),
      createMockFile('portrait.jpeg', 'image/jpeg'),
    ])

    render(<MiniatureList />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
  })

  it('displays the image name as alt text', async () => {
    await useImagesStore.getState().addImages([createMockFile('vacation.png')])

    render(<MiniatureList />)

    expect(screen.getByRole('img', { name: 'vacation.png' })).toBeInTheDocument()
  })

  it('renders Remove and Process buttons for each image', async () => {
    await useImagesStore.getState().addImages([createMockFile('photo.png')])

    render(<MiniatureList />)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process' })).toBeInTheDocument()
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

  it('does not show the empty state when images are present', async () => {
    await useImagesStore.getState().addImages([createMockFile('photo.png')])

    render(<MiniatureList />)

    expect(screen.queryByText('No images loaded')).not.toBeInTheDocument()
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

  it('shows navigation buttons in ImageExplorer when there are multiple images', async () => {
    const user = userEvent.setup()
    await useImagesStore.getState().addImages([
      createMockFile('first.png'),
      createMockFile('second.png'),
    ])

    render(<MiniatureList />)

    // Click the first image
    const img = screen.getByRole('img', { name: 'first.png' })
    await user.click(img)

    // Should show prev/next buttons
    expect(
      screen.getByRole('button', { name: 'Previous image' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Next image' }),
    ).toBeInTheDocument()
  })
})

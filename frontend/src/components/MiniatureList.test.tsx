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

  it('renders a MiniatureImageWithOptions for each image', () => {
    useImagesStore.getState().addImages([
      createMockFile('sunset.png'),
      createMockFile('portrait.jpeg', 'image/jpeg'),
    ])

    render(<MiniatureList />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
  })

  it('displays the image name as alt text', () => {
    useImagesStore.getState().addImages([createMockFile('vacation.png')])

    render(<MiniatureList />)

    expect(screen.getByRole('img', { name: 'vacation.png' })).toBeInTheDocument()
  })

  it('renders Remove and Process buttons for each image', () => {
    useImagesStore.getState().addImages([createMockFile('photo.png')])

    render(<MiniatureList />)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process' })).toBeInTheDocument()
  })

  it('removes an image when its Remove button is clicked', async () => {
    const user = userEvent.setup()
    useImagesStore.getState().addImages([
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

  it('does not show the empty state when images are present', () => {
    useImagesStore.getState().addImages([createMockFile('photo.png')])

    render(<MiniatureList />)

    expect(screen.queryByText('No images loaded')).not.toBeInTheDocument()
  })
})

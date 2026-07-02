import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useImagesStore } from './stores/images'

beforeEach(() => {
  useImagesStore.setState({ images: [] })
})

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByText('Image Prepare')).toBeInTheDocument()
  })

  it('renders the FileInput component', () => {
    render(<App />)
    expect(screen.getByText('Load Images')).toBeInTheDocument()
  })

  it('shows the empty state of MiniatureList', () => {
    render(<App />)
    expect(screen.getByText('No images loaded')).toBeInTheDocument()
  })

  it('shows a miniature after selecting a file', async () => {
    const user = userEvent.setup()
    render(<App />)

    const file = new File(['fake-content'], 'photo.png', { type: 'image/png' })
    const input = screen.getByTestId('file-input')
    await user.upload(input, file)

    expect(screen.getByRole('img', { name: 'photo.png' })).toBeInTheDocument()
  })

  it('shows Remove and Process buttons after adding an image', async () => {
    const user = userEvent.setup()
    render(<App />)

    const file = new File(['fake-content'], 'test.png', { type: 'image/png' })
    const input = screen.getByTestId('file-input')
    await user.upload(input, file)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process' })).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useImagesStore } from './stores/images'

/**
 * Helper — waits for the App's hydration gate to finish so the
 * main UI (title "Image Prepare") is visible.
 */
async function waitForApp() {
  return waitFor(
    () => {
      expect(screen.getByText('Image Prepare')).toBeInTheDocument()
    },
    { timeout: 5000 },
  )
}

beforeEach(() => {
  useImagesStore.setState({ images: [] })
})

describe('App', () => {
  it('renders the title', async () => {
    render(<App />)
    await waitForApp()
  })

  it('renders the FileInput component', async () => {
    render(<App />)
    await waitForApp()
    expect(screen.getByText('Load Images')).toBeInTheDocument()
  })

  it('shows the empty state of MiniatureList', async () => {
    render(<App />)
    await waitForApp()
    expect(screen.getByText('No images loaded')).toBeInTheDocument()
  })

  it('shows a miniature after selecting a file', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitForApp()

    const file = new File(['fake-content'], 'photo.png', { type: 'image/png' })
    const input = screen.getByTestId('file-input')
    await user.upload(input, file)

    expect(screen.getByRole('img', { name: 'photo.png' })).toBeInTheDocument()
  })

  it('shows Remove and Process buttons after adding an image', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitForApp()

    const file = new File(['fake-content'], 'test.png', { type: 'image/png' })
    const input = screen.getByTestId('file-input')
    await user.upload(input, file)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Process' })).toBeInTheDocument()
  })
})

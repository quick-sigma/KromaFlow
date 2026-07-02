import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByText('Image Prepare')).toBeInTheDocument()
  })

  it('renders the FileInput component', () => {
    render(<App />)
    expect(screen.getByText('Load Images')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByText('Image Prepare')).toBeInTheDocument()
  })

  it('starts with count 0', () => {
    render(<App />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('increments count when +1 is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('+1'))
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('decrements count when -1 is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('-1'))
    expect(screen.getByText('-1')).toBeInTheDocument()
  })
})

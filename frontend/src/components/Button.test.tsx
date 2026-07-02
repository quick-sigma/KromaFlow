import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from './Button'

describe('Button', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Process</Button>)
    const button = screen.getByRole('button', { name: 'Process' })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-blue-600')
  })

  it('renders with primary variant explicitly', () => {
    render(<Button variant="primary">Process</Button>)
    const button = screen.getByRole('button', { name: 'Process' })
    expect(button.className).toContain('bg-blue-600')
  })

  it('renders with danger variant', () => {
    render(<Button variant="danger">Remove</Button>)
    const button = screen.getByRole('button', { name: 'Remove' })
    expect(button.className).toContain('bg-red-600')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<Button onClick={handleClick}>Click Me</Button>)
    await user.click(screen.getByRole('button', { name: 'Click Me' }))

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('renders children text', () => {
    render(<Button>Hello World</Button>)
    expect(screen.getByRole('button', { name: 'Hello World' })).toBeInTheDocument()
  })

  it('forwards additional props to the button element', () => {
    render(<Button data-testid="custom-button" disabled>Submit</Button>)
    const button = screen.getByTestId('custom-button')
    expect(button).toBeDisabled()
  })

  it('applies custom className alongside variant classes', () => {
    render(<Button className="my-custom-class">Styled</Button>)
    const button = screen.getByRole('button', { name: 'Styled' })
    expect(button.className).toContain('my-custom-class')
    expect(button.className).toContain('bg-blue-600')
  })
})

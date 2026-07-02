import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Miniature from './Miniature'

describe('Miniature', () => {
  const testSrc = 'blob:http://localhost/test-image'

  it('renders an img element with the given src', () => {
    render(<Miniature src={testSrc} alt="Test image" />)
    const img = screen.getByRole('img', { name: 'Test image' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', testSrc)
  })

  it('renders with alt text', () => {
    render(<Miniature src={testSrc} alt="Photo preview" />)
    const img = screen.getByRole('img', { name: 'Photo preview' })
    expect(img).toHaveAttribute('alt', 'Photo preview')
  })

  it('applies a rounded and bordered style to the image', () => {
    render(<Miniature src={testSrc} alt="Styled" />)
    const img = screen.getByRole('img', { name: 'Styled' })
    expect(img.className).toContain('rounded')
    expect(img.className).toContain('border')
  })

  it('forwards additional props to the img element', () => {
    render(<Miniature src={testSrc} alt="Props" data-testid="miniature-img" />)
    const img = screen.getByTestId('miniature-img')
    expect(img).toBeInTheDocument()
  })
})

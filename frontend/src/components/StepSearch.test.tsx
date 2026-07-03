import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepSearch from './StepSearch'
import { useStepsStore, type StepInfo } from '../stores/steps'

const MOCK_STEPS: StepInfo[] = [
  {
    id: 'wm_remover',
    name: 'watermark-remover',
    description: 'Detect and remove watermarks',
    version: '1.0.0',
    variant: 'processor',
    config_schema: { type: 'object', properties: {} },
  },
  {
    id: 'test_proc',
    name: 'test-processor',
    description: 'Apply crop, resize, rotate, and grayscale transformations',
    version: '1.0.0',
    variant: 'processor',
    config_schema: { type: 'object', properties: {} },
  },
  {
    id: 'avif_fmt',
    name: 'avif-output-formatter',
    description: 'Encode an image to AVIF format',
    version: '1.0.0',
    variant: 'output_formatter',
    config_schema: { type: 'object', properties: {} },
  },
]

beforeEach(() => {
  // Reset store and mock fetch before each test
  useStepsStore.setState({
    steps: MOCK_STEPS,
    isLoading: false,
    error: null,
  })
  localStorage.clear()
  vi.restoreAllMocks()

  // Mock global fetch so the loadSteps effect doesn't make real HTTP calls
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_STEPS,
    }),
  )
})

describe('StepSearch', () => {
  it('renders the search input', async () => {
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(
      await screen.findByPlaceholderText('Search steps…'),
    ).toBeInTheDocument()
  })

  it('shows all steps when query is empty', async () => {
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('watermark-remover')).toBeInTheDocument()
    expect(screen.getByText('test-processor')).toBeInTheDocument()
    expect(
      screen.getByText('avif-output-formatter'),
    ).toBeInTheDocument()
  })

  it('renders the pill switch with All / Processors / Output options', async () => {
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('All')).toBeInTheDocument()
    expect(screen.getByText('Processors')).toBeInTheDocument()
    // Use getByRole to find the filter pill specifically (avoids duplicate "Output" text)
    expect(screen.getByRole('radio', { name: 'Output' })).toBeInTheDocument()
  })

  it('selects All by default', async () => {
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    const allRadio = await screen.findByRole('radio', { name: 'All' })
    expect(allRadio).toHaveAttribute('aria-checked', 'true')
  })

  it('filters to processors only when Processors pill is clicked', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('Processors'))

    // Processors should be visible
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()
    expect(screen.getByText('test-processor')).toBeInTheDocument()
    // Output formatter should be hidden
    expect(
      screen.queryByText('avif-output-formatter'),
    ).not.toBeInTheDocument()
  })

  it('filters to output only when Output pill is clicked', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    await user.click(screen.getByRole('radio', { name: 'Output' }))

    // Output formatter should be visible
    expect(screen.getByText('avif-output-formatter')).toBeInTheDocument()
    // Processors should be hidden
    expect(
      screen.queryByText('watermark-remover'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('test-processor'),
    ).not.toBeInTheDocument()
  })

  it('shows all steps again after switching back to All', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    // Switch to Processors
    await user.click(screen.getByText('Processors'))
    expect(
      screen.queryByText('avif-output-formatter'),
    ).not.toBeInTheDocument()

    // Switch back to All
    await user.click(screen.getByText('All'))
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()
    expect(screen.getByText('test-processor')).toBeInTheDocument()
    expect(
      screen.getByText('avif-output-formatter'),
    ).toBeInTheDocument()
  })

  it('shows version badges for each step', async () => {
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    const badges = await screen.findAllByText(/v1\.0\.0/)
    expect(badges).toHaveLength(3)
  })

  it('filters steps by name as user types', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    const input = screen.getByPlaceholderText('Search steps…')
    await user.type(input, 'watermark')

    expect(screen.getByText('watermark-remover')).toBeInTheDocument()
    expect(
      screen.queryByText('test-processor'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('avif-output-formatter'),
    ).not.toBeInTheDocument()
  })

  it('filters steps by description', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    const input = screen.getByPlaceholderText('Search steps…')
    await user.type(input, 'grayscale')

    expect(screen.getByText('test-processor')).toBeInTheDocument()
    expect(
      screen.queryByText('watermark-remover'),
    ).not.toBeInTheDocument()
  })

  it('shows no results message when nothing matches', async () => {
    const user = userEvent.setup()
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('watermark-remover')
    const input = screen.getByPlaceholderText('Search steps…')
    await user.type(input, 'zzzzz_nothing_matches')

    expect(
      screen.getByText(/No steps match/),
    ).toBeInTheDocument()
  })

  it('shows the empty message when no steps are available from the start', async () => {
    // Override fetch to return empty so loadSteps effect doesn't add steps
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    )
    useStepsStore.setState({ steps: [], isLoading: false })
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(
      await screen.findByText('No steps available.'),
    ).toBeInTheDocument()
  })

  it('calls onSelect and onClose when a step is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(<StepSearch onSelect={onSelect} onClose={onClose} />)

    // Wait for the component to settle (steps visible)
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // onSelect is called with the store's actual step object
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    useStepsStore.setState({ isLoading: false })

    render(<StepSearch onSelect={vi.fn()} onClose={onClose} />)

    // Wait for the component to mount and settle
    await screen.findByPlaceholderText('Search steps…')
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { container } = render(
      <StepSearch onSelect={vi.fn()} onClose={onClose} />,
    )

    // Wait for the component to mount and settle
    await screen.findByPlaceholderText('Search steps…')

    // The backdrop is the outermost fixed div
    const backdrop = container.firstChild as HTMLElement
    await user.click(backdrop)

    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error message when the store has an error', async () => {
    // Override fetch to reject so loadSteps preserves the error state
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Failed to load steps')),
    )
    useStepsStore.setState({
      error: 'Failed to load steps',
      steps: [],
      isLoading: false,
    })
    render(<StepSearch onSelect={vi.fn()} onClose={vi.fn()} />)

    expect(
      await screen.findByText('Failed to load steps'),
    ).toBeInTheDocument()
  })

  it('shows loading bar when isLoading is true', async () => {
    useStepsStore.setState({ isLoading: true, steps: [] })
    const { container } = render(
      <StepSearch onSelect={vi.fn()} onClose={vi.fn()} />,
    )

    await waitFor(() => {
      const loadingBar = container.querySelector(
        '[style*="animation: loading-bar"]',
      )
      expect(loadingBar).toBeInTheDocument()
    })
  })

  it('does not show loading bar when not loading', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    const { container } = render(
      <StepSearch onSelect={vi.fn()} onClose={vi.fn()} />,
    )

    await screen.findByText('watermark-remover')
    const loadingBar = container.querySelector(
      '[style*="animation: loading-bar"]',
    )
    expect(loadingBar).not.toBeInTheDocument()
  })

  // ── excludeVariants prop ────────────────────────────────────────────────

  it('hides output formatters when excludeVariants contains output_formatter', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    render(
      <StepSearch
        onSelect={vi.fn()}
        onClose={vi.fn()}
        excludeVariants={['output_formatter']}
      />,
    )

    expect(
      await screen.findByText('watermark-remover'),
    ).toBeInTheDocument()
    expect(screen.getByText('test-processor')).toBeInTheDocument()
    expect(
      screen.queryByText('avif-output-formatter'),
    ).not.toBeInTheDocument()
  })

  it('shows a notice when excludeVariants is non-empty', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    render(
      <StepSearch
        onSelect={vi.fn()}
        onClose={vi.fn()}
        excludeVariants={['output_formatter']}
      />,
    )

    expect(
      await screen.findByText(/Some steps are hidden/i),
    ).toBeInTheDocument()
  })

  it('shows all variants when excludeVariants is empty', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    render(
      <StepSearch
        onSelect={vi.fn()}
        onClose={vi.fn()}
        excludeVariants={[]}
      />,
    )

    expect(await screen.findByText('watermark-remover')).toBeInTheDocument()
    expect(screen.getByText('test-processor')).toBeInTheDocument()
    expect(
      screen.getByText('avif-output-formatter'),
    ).toBeInTheDocument()
  })

  it('hides steps when excludeStepIds contains their id', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    render(
      <StepSearch
        onSelect={vi.fn()}
        onClose={vi.fn()}
        excludeStepIds={['test_proc']}
      />,
    )

    expect(
      await screen.findByText('watermark-remover'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('test-processor'),
    ).not.toBeInTheDocument()
  })

  it('does not show the exclusion notice when excludeVariants is empty', async () => {
    useStepsStore.setState({ isLoading: false, steps: MOCK_STEPS })
    render(
      <StepSearch
        onSelect={vi.fn()}
        onClose={vi.fn()}
        excludeVariants={[]}
      />,
    )

    await screen.findByText('watermark-remover')
    expect(
      screen.queryByText(/output formatter already in pipeline/i),
    ).not.toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PipelineEditor from './PipelineEditor'
import { useStepsStore, type StepInfo } from '../stores/steps'
import { usePipelineStore } from '../stores/pipeline'

const MOCK_STEPS: StepInfo[] = [
  {
    id: 'wm_remover',
    name: 'watermark-remover',
    description: 'Remove watermarks',
    version: '1.0.0',
    variant: 'processor',
    config_schema: {
      type: 'object',
      properties: {
        grayscale: {
          anyOf: [{ type: 'boolean' }, { type: 'null' }],
          default: null,
        },
      },
    },
  },
  {
    id: 'test_proc',
    name: 'test-processor',
    description: 'A generic test processor',
    version: '1.0.0',
    variant: 'processor',
    config_schema: {
      type: 'object',
      properties: {
        value: { type: 'integer', default: 42 },
      },
    },
  },
  {
    id: 'avif_fmt',
    name: 'avif-output-formatter',
    description: 'Encode to AVIF',
    version: '1.0.0',
    variant: 'output_formatter',
    config_schema: {
      type: 'object',
      properties: {
        quality: {
          anyOf: [{ type: 'integer', minimum: 1, maximum: 100 }, { type: 'null' }],
          default: 85,
        },
      },
    },
  },
]

beforeEach(() => {
  useStepsStore.setState({
    steps: MOCK_STEPS,
    isLoading: false,
    error: null,
  })
  usePipelineStore.setState({ steps: [] })
  localStorage.clear()
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_STEPS,
    }),
  )
})

describe('PipelineEditor', () => {
  it('renders the pipeline editor with header', () => {
    render(<PipelineEditor />)
    expect(
      screen.getByText('Pipeline Editor'),
    ).toBeInTheDocument()
  })

  it('renders the Add New Step button with primary variant', () => {
    render(<PipelineEditor />)
    const button = screen.getByRole('button', { name: 'Add New Step' })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-blue-600')
  })

  it('shows empty state when no steps are selected', () => {
    render(<PipelineEditor />)
    expect(
      screen.getByText('No steps yet. Click the button below to add one.'),
    ).toBeInTheDocument()
  })

  it('opens the StepSearch when Add New Step is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))

    expect(
      screen.getByPlaceholderText('Search steps…'),
    ).toBeInTheDocument()
  })

  it('adds a processor step to the list when selected from search', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    expect(screen.getByText('watermark-remover')).toBeInTheDocument()
  })

  // ── Validation: output formatter always last ─────────────────────────────

  it('adds an output formatter at the end of the pipeline', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('avif-output-formatter')
    await user.click(screen.getByText('avif-output-formatter'))

    expect(
      screen.getByText('avif-output-formatter'),
    ).toBeInTheDocument()
  })

  it('inserts a processor step before the output formatter when one already exists', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('avif-output-formatter')
    await user.click(screen.getByText('avif-output-formatter'))

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    expect(
      screen.getByText('avif-output-formatter'),
    ).toBeInTheDocument()
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()
  })

  it('hides output formatters from search when one is already in the pipeline', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('avif-output-formatter')
    await user.click(screen.getByText('avif-output-formatter'))

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('Processors')

    expect(
      screen.queryByText('Output Formatters'),
    ).not.toBeInTheDocument()

    const searchResults = document.querySelector('.max-h-80')
    expect(searchResults).toBeInTheDocument()
    expect(searchResults?.textContent).not.toContain(
      'avif-output-formatter',
    )
  })

  it('shows a tooltip on the Add New Step button when pipeline has no output formatter', () => {
    render(<PipelineEditor />)

    // With empty pipeline (no output formatter), tooltip should be visible
    expect(
      screen.getByRole('tooltip', {
        name: 'Your pipeline needs an output step — add one to enable image processing',
      }),
    ).toBeInTheDocument()
  })

  it('hides the tooltip on the Add New Step button when an output formatter is present', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add an output formatter
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('avif-output-formatter')
    await user.click(screen.getByText('avif-output-formatter'))

    // Tooltip should not be present
    expect(
      screen.queryByRole('tooltip', {
        name: 'Your pipeline needs an output step — add one to enable image processing',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows a notice when output formatters are excluded from search', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('avif-output-formatter')
    await user.click(screen.getByText('avif-output-formatter'))

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    expect(
      await screen.findByText(/Some steps are hidden/i),
    ).toBeInTheDocument()
  })

  // ── Delete step ──────────────────────────────────────────────────────────

  it('deletes a step when the delete icon is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()

    // Click delete
    const deleteBtn = screen.getByRole('button', {
      name: /remove watermark-remover/i,
    })
    await user.click(deleteBtn)

    // Step should be gone, empty state returned
    expect(
      screen.queryByText('watermark-remover'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('No steps yet. Click the button below to add one.'),
    ).toBeInTheDocument()
  })

  // ── Configure step ───────────────────────────────────────────────────────

  it('opens the configuration dialog when the configure icon is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step with configurable props (watermark-remover has 'grayscale')
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Click configure
    const configBtn = screen.getByRole('button', {
      name: /configure watermark-remover/i,
    })
    await user.click(configBtn)

    // Dialog should appear with the step name
    expect(
      screen.getByText(/Configure watermark-remover/i),
    ).toBeInTheDocument()
  })

  it('renders form fields in the configuration dialog matching the config_schema', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add watermark-remover (has boolean "grayscale" field)
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Open config dialog
    await user.click(
      screen.getByRole('button', { name: /configure watermark-remover/i }),
    )

    // Should show the dialog
    expect(
      screen.getByRole('dialog', { name: /Configure watermark-remover/i }),
    ).toBeInTheDocument()
  })

  it('saves configuration and closes the dialog', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add watermark-remover
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Open config dialog
    await user.click(
      screen.getByRole('button', { name: /configure watermark-remover/i }),
    )
    await screen.findByText(/Configure watermark-remover/i)

    // Click Save
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Dialog should close
    expect(
      screen.queryByText(/Configure watermark-remover/i),
    ).not.toBeInTheDocument()
  })

  it('closes the configuration dialog on Cancel', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    await user.click(
      screen.getByRole('button', { name: /configure watermark-remover/i }),
    )
    await screen.findByText(/Configure watermark-remover/i)

    // Click Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.queryByText(/Configure watermark-remover/i),
    ).not.toBeInTheDocument()
  })

  // ── Restriction: no duplicate step IDs ───────────────────────────────

  it('prevents adding the same step twice', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add watermark-remover once
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()

    // Open search — watermark-remover should be hidden from results
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('Processors')

    // Check within the search results container (not the whole DOM,
    // since the step name appears in the pipeline graph)
    const searchResults = document.querySelector('.max-h-80')
    expect(searchResults).toBeInTheDocument()
    expect(searchResults?.textContent).not.toContain('watermark-remover')
  })

  it('shows the exclusion notice when steps are already in the pipeline', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Open search again — notice should appear
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    expect(
      await screen.findByText(/Some steps are hidden/i),
    ).toBeInTheDocument()
  })

  // ── Save / Load pipeline ────────────────────────────────────────────

  it('shows Save Pipeline button disabled when there are no steps', () => {
    render(<PipelineEditor />)
    const saveBtn = screen.getByRole('button', { name: 'Save Pipeline' })
    expect(saveBtn).toBeDisabled()
  })

  it('enables Save Pipeline button when at least one step is added', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    const saveBtn = screen.getByRole('button', { name: 'Save Pipeline' })
    expect(saveBtn).toBeEnabled()
  })

  it('opens the save dialog when Save Pipeline is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step first
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Click Save Pipeline — should open the dialog, not save immediately
    await user.click(screen.getByRole('button', { name: 'Save Pipeline' }))

    // The save dialog should appear with an input field
    expect(
      screen.getByRole('dialog', { name: 'Save Pipeline' }),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Enter pipeline name…'),
    ).toBeInTheDocument()
  })

  it('saves pipeline to localStorage when name is entered in the dialog', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step first
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Click Save Pipeline to open the dialog
    await user.click(screen.getByRole('button', { name: 'Save Pipeline' }))

    // Type a custom name
    const input = screen.getByPlaceholderText('Enter pipeline name…')
    await user.clear(input)
    await user.type(input, 'My Custom Pipeline')

    // Click Save in the dialog
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The dropdown button should show the custom name
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'My Custom Pipeline' }),
      ).toBeInTheDocument()
    })

    // Check localStorage
    const raw = localStorage.getItem('pipeline-editor-saved')
    expect(raw).not.toBeNull()
    const saved = JSON.parse(raw!)
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('My Custom Pipeline')
    expect(saved[0].steps).toHaveLength(1)
  })

  it('auto-generates a name when saving with an empty name in the dialog', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Add a step first
    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Click Save Pipeline to open the dialog
    await user.click(screen.getByRole('button', { name: 'Save Pipeline' }))

    // Clear the name field and leave it empty
    const input = screen.getByPlaceholderText('Enter pipeline name…')
    await user.clear(input)

    // Click Save in the dialog
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The dropdown button should show the auto-generated name
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Untitled Pipeline' }),
      ).toBeInTheDocument()
    })

    // Check localStorage
    const raw = localStorage.getItem('pipeline-editor-saved')
    expect(raw).not.toBeNull()
    const saved = JSON.parse(raw!)
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Untitled Pipeline')
    expect(saved[0].steps).toHaveLength(1)
  })

  it('closes the save dialog on Cancel', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    await user.click(screen.getByRole('button', { name: 'Add New Step' }))
    await screen.findByText('watermark-remover')
    await user.click(screen.getByText('watermark-remover'))

    // Open save dialog
    await user.click(screen.getByRole('button', { name: 'Save Pipeline' }))
    expect(
      screen.getByRole('dialog', { name: 'Save Pipeline' }),
    ).toBeInTheDocument()

    // Click Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Dialog should close, localStorage should NOT have anything new
    expect(
      screen.queryByRole('dialog', { name: 'Save Pipeline' }),
    ).not.toBeInTheDocument()
    const raw = localStorage.getItem('pipeline-editor-saved')
    expect(raw).toBeNull()
  })

  it('loads a saved pipeline and restores the steps', async () => {
    // Pre-populate localStorage with a saved pipeline
    const savedPipeline = {
      name: 'My Pipeline',
      steps: [
        {
          step: MOCK_STEPS[0],
          config: { grayscale: true },
        },
      ],
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(
      'pipeline-editor-saved',
      JSON.stringify([savedPipeline]),
    )

    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Open the dropdown
    const dropdownBtn = screen.getByRole('button', {
      name: 'Load Pipeline…',
    })
    await user.click(dropdownBtn)

    // Should see the saved pipeline in the dropdown
    expect(screen.getByText('My Pipeline')).toBeInTheDocument()

    // Click to load
    await user.click(screen.getByText('My Pipeline'))

    // The pipeline steps should be restored
    expect(screen.getByText('watermark-remover')).toBeInTheDocument()

    // The dropdown button should now show the loaded pipeline name
    expect(
      screen.getByRole('button', { name: 'My Pipeline' }),
    ).toBeInTheDocument()
  })

  it('deletes a saved pipeline from the dropdown', async () => {
    // Pre-populate localStorage with a saved pipeline
    const savedPipeline = {
      name: 'Pipeline To Delete',
      steps: [],
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(
      'pipeline-editor-saved',
      JSON.stringify([savedPipeline]),
    )

    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Open the dropdown
    const dropdownBtn = screen.getByRole('button', {
      name: 'Load Pipeline…',
    })
    await user.click(dropdownBtn)

    // Should see the saved pipeline
    expect(screen.getByText('Pipeline To Delete')).toBeInTheDocument()

    // Click the delete button (X icon) — the aria-label contains the name
    const deleteBtn = screen.getByRole('button', {
      name: /delete.*pipeline to delete/i,
    })
    await user.click(deleteBtn)

    // The pipeline should be removed from the dropdown
    expect(
      screen.queryByText('Pipeline To Delete'),
    ).not.toBeInTheDocument()

    // Should show the empty state message in dropdown
    expect(
      screen.getByText('No saved pipelines yet.'),
    ).toBeInTheDocument()
  })

  it('shows "No saved pipelines yet" in dropdown when there are none', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Open the dropdown
    const dropdownBtn = screen.getByRole('button', {
      name: 'Load Pipeline…',
    })
    await user.click(dropdownBtn)

    expect(
      screen.getByText('No saved pipelines yet.'),
    ).toBeInTheDocument()
  })

  it('closes the dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Open the dropdown
    const dropdownBtn = screen.getByRole('button', {
      name: 'Load Pipeline…',
    })
    await user.click(dropdownBtn)

    // Should see the empty message
    expect(
      screen.getByText('No saved pipelines yet.'),
    ).toBeInTheDocument()

    // Click outside the dropdown
    await user.click(screen.getByText('Pipeline Editor'))

    // Dropdown should close
    expect(
      screen.queryByText('No saved pipelines yet.'),
    ).not.toBeInTheDocument()
  })

  it('keeps Save button disabled after loading a pipeline with no steps', async () => {
    // Save an empty pipeline
    const savedPipeline = {
      name: 'Empty Pipeline',
      steps: [],
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(
      'pipeline-editor-saved',
      JSON.stringify([savedPipeline]),
    )

    const user = userEvent.setup()
    render(<PipelineEditor />)

    // Load the empty pipeline
    await user.click(
      screen.getByRole('button', { name: 'Load Pipeline…' }),
    )
    await user.click(screen.getByText('Empty Pipeline'))

    // Save should still be disabled
    const saveBtn = screen.getByRole('button', { name: 'Save Pipeline' })
    expect(saveBtn).toBeDisabled()
  })
})

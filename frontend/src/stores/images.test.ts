import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useImagesStore } from './images'
import { usePipelineStore } from './pipeline'

const API_BASE = 'http://localhost:55558'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [], processedImages: [] })
  usePipelineStore.setState({ steps: [] })
  vi.restoreAllMocks()
})

describe('images store', () => {
  it('should start with empty arrays', () => {
    const { images, processedImages } = useImagesStore.getState()
    expect(images).toEqual([])
    expect(processedImages).toEqual([])
  })

  it('should add a single image and create a blob URL', async () => {
    const { addImages } = useImagesStore.getState()
    const file = createMockFile('photo.png')

    await addImages([file])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('photo.png')
    expect(images[0].type).toBe('image/png')
    expect(images[0].size).toBeGreaterThan(0)
    expect(images[0].src).toMatch(/^blob:/)
    expect(images[0].id).toBeDefined()
    expect(images[0].blobKey).toContain(images[0].id)
  })

  it('should add multiple images at once', async () => {
    const { addImages } = useImagesStore.getState()

    await addImages([
      createMockFile('a.png'),
      createMockFile('b.jpeg', 'image/jpeg'),
    ])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('a.png')
    expect(images[1].name).toBe('b.jpeg')
  })

  it('should append new images to existing ones', async () => {
    await useImagesStore.getState().addImages([createMockFile('first.png')])
    await useImagesStore.getState().addImages([createMockFile('second.png')])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('first.png')
    expect(images[1].name).toBe('second.png')
  })

  it('should remove an image by id and revoke its blob URL', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, removeImage } = useImagesStore.getState()

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]
    const blobUrl = entry.src

    await removeImage(entry.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl)
  })

  it('should remove only the specified image', async () => {
    const { addImages, removeImage } = useImagesStore.getState()

    await addImages([createMockFile('keep.png'), createMockFile('remove.png')])
    const toRemove = useImagesStore.getState().images[1]

    await removeImage(toRemove.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('keep.png')
  })

  it('should add a processed image result with downloadUrl', async () => {
    const { addImages, processImage } = useImagesStore.getState()

    // Set up pipeline with output formatter
    usePipelineStore.setState({
      steps: [
        {
          step: {
            id: 'png_fmt',
            name: 'png-output-formatter',
            variant: 'output_formatter',
          },
          config: {},
        },
      ],
    })

    // Mock fetch to return JSON (new backend contract)
    const resultId = crypto.randomUUID()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultId,
          name: 'photo-processed.png',
          type: 'image/png',
          size: 1234,
          downloadUrl: `/api/images/${resultId}/download`,
        }),
    })

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    // Wait for processing to complete
    await new Promise((resolve) => {
      const unsubscribe = useImagesStore.subscribe((state) => {
        if (state.processingState === 'success') {
          unsubscribe()
          resolve(undefined)
        }
      })
      processImage(entry.id)
    })

    const { processedImages } = useImagesStore.getState()
    expect(processedImages).toHaveLength(1)
    expect(processedImages[0].originalId).toBe(entry.id)
    expect(processedImages[0].originalName).toBe('photo.png')
    expect(processedImages[0].name).toContain('photo-processed')
    expect(processedImages[0].processedAt).toBeGreaterThan(0)
    // Should have downloadUrl instead of blob src
    expect(processedImages[0].downloadUrl).toContain(API_BASE)
    expect(processedImages[0].downloadUrl).toContain('/download')
    expect(processedImages[0].downloadUrl).toContain(resultId)
    // Should NOT have blobKey or blob src
    expect((processedImages[0] as Record<string, unknown>).blobKey).toBeUndefined()
  })

  it('should remove a processed image and call backend DELETE', async () => {
    // Mock fetch so the DELETE call doesn't fail
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })

    // Manually add a processed image entry
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })

    await useImagesStore.getState().removeProcessedImage('p1')

    const { processedImages } = useImagesStore.getState()
    expect(processedImages).toHaveLength(0)
    // Should have called DELETE on the backend
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/images/p1`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('should reject processing when the pipeline is empty', async () => {
    // Pipeline is empty — processImage should set an error
    const { addImages, processImage } = useImagesStore.getState()

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    const state = useImagesStore.getState()
    expect(state.processingState).toBe('error')
    expect(state.processingError).toBe(
      'No pipeline steps configured. Add steps first.',
    )
  })

  it('should reject processing when the pipeline has steps but no output formatter', async () => {
    // Set up pipeline with only a processor step
    usePipelineStore.setState({
      steps: [
        {
          step: {
            id: 'wm_remover',
            name: 'watermark-remover',
            variant: 'processor',
          },
          config: {},
        },
      ],
    })

    const { addImages, processImage } = useImagesStore.getState()
    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    const state = useImagesStore.getState()
    expect(state.processingState).toBe('error')
    expect(state.processingError).toContain('output')
  })

  it('should clear all images and processed images, revoke original blob URLs, and call DELETE on backend', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    // Mock fetch for processed image DELETE calls
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    const { addImages, clearImages } = useImagesStore.getState()

    await addImages([createMockFile('a.png'), createMockFile('b.png')])
    const urls = useImagesStore.getState().images.map((img) => img.src)

    // Add a processed image (new format)
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'a.png',
          name: 'a-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })

    await clearImages()

    const { images, processedImages } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(processedImages).toHaveLength(0)
    // Original blob URLs should be revoked
    expect(revokeSpy).toHaveBeenCalledWith(urls[0])
    expect(revokeSpy).toHaveBeenCalledWith(urls[1])
    // Backend DELETE should have been called for the processed image
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/images/p1`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('should clear only original images with clearOriginalImages', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    await useImagesStore.getState().addImages([
      createMockFile('keep-processed.png'),
    ])

    // Add a processed image
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'keep-processed.png',
          name: 'keep-processed-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })

    const imgEntry = useImagesStore.getState().images[0]
    await useImagesStore.getState().clearOriginalImages()

    const { images, processedImages } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    // Processed images should survive
    expect(processedImages).toHaveLength(1)
    expect(revokeSpy).toHaveBeenCalledWith(imgEntry.src)
  })

  it('should clear only processed images with clearProcessedImages, calling backend DELETE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    await useImagesStore.getState().addImages([
      createMockFile('original.png'),
    ])

    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'original.png',
          name: 'original-processed.png',
          type: 'image/png',
          size: 100,
          downloadUrl: `${API_BASE}/api/images/p1/download`,
          processedAt: Date.now(),
        },
      ],
    })

    await useImagesStore.getState().clearProcessedImages()

    const { images, processedImages } = useImagesStore.getState()
    // Original images should survive
    expect(images).toHaveLength(1)
    expect(processedImages).toHaveLength(0)
    // Should have called backend DELETE
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/images/p1`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  describe('processAllImages', () => {
    it('should return early when there are no images', async () => {
      useImagesStore.setState({
        processingState: 'idle',
        images: [],
      })
      await useImagesStore.getState().processAllImages()
      const state = useImagesStore.getState()
      // Should not change to processing or error
      expect(state.processingState).not.toBe('processing')
      expect(state.processingState).not.toBe('error')
    })

    it('should set an error when the pipeline is empty', async () => {
      usePipelineStore.setState({ steps: [] })
      await useImagesStore.getState().addImages([createMockFile('photo.png')])

      await useImagesStore.getState().processAllImages()

      const state = useImagesStore.getState()
      expect(state.processingState).toBe('error')
      expect(state.processingError).toBe(
        'No pipeline steps configured. Add steps first.',
      )
    })

    it('should set an error when there is no output formatter', async () => {
      usePipelineStore.setState({
        steps: [
          {
            step: {
              id: 'wm_remover',
              name: 'watermark-remover',
              variant: 'processor',
            },
            config: {},
          },
        ],
      })
      await useImagesStore.getState().addImages([createMockFile('photo.png')])

      await useImagesStore.getState().processAllImages()

      const state = useImagesStore.getState()
      expect(state.processingState).toBe('error')
      expect(state.processingError).toContain('output')
    })

    it('should process all images and store results with downloadUrls', async () => {
      usePipelineStore.setState({
        steps: [
          {
            step: {
              id: 'png_fmt',
              name: 'png-output-formatter',
              variant: 'output_formatter',
            },
            config: {},
          },
        ],
      })

      // Mock fetch to return JSON metadata
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            resultId: 'mock-result-id',
            name: 'photo-processed.png',
            type: 'image/png',
            size: 999,
            downloadUrl: '/api/images/mock-result-id/download',
          }),
      })

      await useImagesStore.getState().addImages([
        createMockFile('a.png'),
        createMockFile('b.png'),
      ])

      await useImagesStore.getState().processAllImages()

      const state = useImagesStore.getState()
      expect(state.processingState).toBe('success')
      expect(state.processedImages).toHaveLength(2)
      expect(state.processedImages[0].originalName).toBe('a.png')
      expect(state.processedImages[1].originalName).toBe('b.png')
      // Should have downloadUrls
      state.processedImages.forEach((img) => {
        expect(img.downloadUrl).toContain(API_BASE)
        expect(img.downloadUrl).toContain('/download')
      })
    })

    it('should handle partial failures and report errors', async () => {
      usePipelineStore.setState({
        steps: [
          {
            step: {
              id: 'png_fmt',
              name: 'png-output-formatter',
              variant: 'output_formatter',
            },
            config: {},
          },
        ],
      })

      // First call succeeds, second call fails
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              resultId: 'ok-id',
              name: 'ok-processed.png',
              type: 'image/png',
              size: 100,
              downloadUrl: '/api/images/ok-id/download',
            }),
        })
        .mockRejectedValueOnce(new Error('Network error'))
      globalThis.fetch = mockFetch

      await useImagesStore.getState().addImages([
        createMockFile('ok.png'),
        createMockFile('fail.png'),
      ])

      await useImagesStore.getState().processAllImages()

      const state = useImagesStore.getState()
      expect(state.processingState).toBe('error')
      // One result should still be stored
      expect(state.processedImages).toHaveLength(1)
      expect(state.processingError).toContain('1/2')
      expect(state.processingError).toContain('fail.png')
    })
  })
})
